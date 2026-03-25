import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

type PluginManifestShape = {
  id?: unknown;
};

type MaumauPackageShape = {
  name?: unknown;
  maumau?: {
    install?: {
      npmSpec?: unknown;
    };
    channel?: {
      id?: unknown;
    };
  };
};

type BundledPluginRecord = {
  dirName: string;
  packageName: string;
  manifestId: string;
  installNpmSpec?: string;
  channelId?: string;
};

const EXTENSIONS_ROOT = path.resolve(process.cwd(), "extensions");
const DIR_ID_EXCEPTIONS = new Map<string, string>([
  // Historical directory name kept until a wider repo cleanup is worth the churn.
  ["kimi-coding", "kimi"],
]);
const ALLOWED_PACKAGE_SUFFIXES = [
  "",
  "-provider",
  "-plugin",
  "-speech",
  "-sandbox",
  "-media-understanding",
] as const;

function readJsonFile<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function normalizeText(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed || undefined;
}

function readBundledPluginRecords(): BundledPluginRecord[] {
  const records: BundledPluginRecord[] = [];
  for (const dirName of fs.readdirSync(EXTENSIONS_ROOT).toSorted()) {
    const rootDir = path.join(EXTENSIONS_ROOT, dirName);
    const packagePath = path.join(rootDir, "package.json");
    const manifestPath = path.join(rootDir, "maumau.plugin.json");
    if (!fs.existsSync(packagePath) || !fs.existsSync(manifestPath)) {
      continue;
    }

    const manifest = readJsonFile<PluginManifestShape>(manifestPath);
    const pkg = readJsonFile<MaumauPackageShape>(packagePath);
    const manifestId = normalizeText(manifest.id);
    const packageName = normalizeText(pkg.name);
    if (!manifestId || !packageName) {
      continue;
    }

    records.push({
      dirName,
      packageName,
      manifestId,
      installNpmSpec: normalizeText(pkg.maumau?.install?.npmSpec),
      channelId: normalizeText(pkg.maumau?.channel?.id),
    });
  }
  return records;
}

function resolveAllowedPackageNamesForId(pluginId: string): string[] {
  return ALLOWED_PACKAGE_SUFFIXES.map((suffix) => `@maumau/${pluginId}${suffix}`);
}

describe("bundled plugin naming guardrails", () => {
  it("keeps bundled workspace package names anchored to the plugin id", () => {
    const mismatches = readBundledPluginRecords()
      .filter(
        ({ packageName, manifestId }) =>
          !resolveAllowedPackageNamesForId(manifestId).includes(packageName),
      )
      .map(
        ({ dirName, packageName, manifestId }) => `${dirName}: ${packageName} (id=${manifestId})`,
      );

    expect(
      mismatches,
      `Bundled extension package names must stay anchored to the manifest id via @maumau/<id> or an approved suffix (${ALLOWED_PACKAGE_SUFFIXES.join(", ")}). Update the plugin naming docs and this invariant before adding a new naming form.\nFound: ${mismatches.join(", ") || "<none>"}`,
    ).toEqual([]);
  });

  it("keeps bundled workspace directories aligned with the plugin id unless explicitly allowlisted", () => {
    const mismatches = readBundledPluginRecords()
      .filter(
        ({ dirName, manifestId }) => (DIR_ID_EXCEPTIONS.get(dirName) ?? dirName) !== manifestId,
      )
      .map(({ dirName, manifestId }) => `${dirName} -> ${manifestId}`);

    expect(
      mismatches,
      `Bundled extension directory names should match maumau.plugin.json:id. If a legacy exception is unavoidable, add it to DIR_ID_EXCEPTIONS with a comment.\nFound: ${mismatches.join(", ") || "<none>"}`,
    ).toEqual([]);
  });

  it("keeps bundled maumau.install.npmSpec aligned with the package name", () => {
    const mismatches = readBundledPluginRecords()
      .filter(
        ({ installNpmSpec, packageName }) =>
          typeof installNpmSpec === "string" && installNpmSpec !== packageName,
      )
      .map(
        ({ dirName, packageName, installNpmSpec }) =>
          `${dirName}: package=${packageName}, npmSpec=${installNpmSpec}`,
      );

    expect(
      mismatches,
      `Bundled maumau.install.npmSpec values must match the package name so install/update paths stay deterministic.\nFound: ${mismatches.join(", ") || "<none>"}`,
    ).toEqual([]);
  });

  it("keeps bundled channel ids aligned with the canonical plugin id", () => {
    const mismatches = readBundledPluginRecords()
      .filter(
        ({ channelId, manifestId }) => typeof channelId === "string" && channelId !== manifestId,
      )
      .map(
        ({ dirName, manifestId, channelId }) =>
          `${dirName}: channel=${channelId}, id=${manifestId}`,
      );

    expect(
      mismatches,
      `Bundled maumau.channel.id values must match maumau.plugin.json:id for the owning plugin.\nFound: ${mismatches.join(", ") || "<none>"}`,
    ).toEqual([]);
  });
});
