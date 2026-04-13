import fs from "node:fs/promises";
import path from "node:path";
import type { ScopedMemoryItem, MultiUserMemoryStore } from "./store.js";

const CORPUS_ROOT = "corpus";

export function resolveCorpusRelativePathForItem(item: ScopedMemoryItem): string {
  switch (item.scopeType) {
    case "private":
      return item.durability === "daily"
        ? path.posix.join("users", sanitizePathSegment(item.scopeId), "memory", resolveEntryDate(item))
        : path.posix.join("users", sanitizePathSegment(item.scopeId), "MEMORY.md");
    case "provisional":
      return item.durability === "daily"
        ? path.posix.join(
            "provisional",
            sanitizePathSegment(item.scopeId),
            "memory",
            resolveEntryDate(item),
          )
        : path.posix.join("provisional", sanitizePathSegment(item.scopeId), "MEMORY.md");
    case "group":
      return path.posix.join("groups", sanitizePathSegment(item.scopeId), "MEMORY.md");
    case "global":
      return path.posix.join("global", "MEMORY.md");
  }
}

export async function syncScopedCorpus(params: {
  workspaceDir: string;
  store: MultiUserMemoryStore;
}): Promise<void> {
  const corpusRoot = path.join(params.workspaceDir, CORPUS_ROOT);
  await fs.mkdir(corpusRoot, { recursive: true });

  const byPath = new Map<string, ScopedMemoryItem[]>();
  for (const item of params.store.listActiveMemoryItems()) {
    const relativePath = resolveCorpusRelativePathForItem(item);
    const existing = byPath.get(relativePath) ?? [];
    existing.push(item);
    byPath.set(relativePath, existing);
  }

  const keep = new Set<string>();
  for (const [relativePath, items] of byPath) {
    const absolutePath = path.join(corpusRoot, relativePath);
    keep.add(normalizePath(absolutePath));
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, renderScopedCorpusFile(items), "utf8");
  }

  await removeStaleCorpusFiles(corpusRoot, keep);
}

export function isCorpusPath(relPath: string): boolean {
  return relPath.replace(/\\/g, "/").startsWith("corpus/");
}

function renderScopedCorpusFile(items: ScopedMemoryItem[]): string {
  return `${items.map(renderScopedCorpusItem).join("\n\n").trim()}\n`;
}

function renderScopedCorpusItem(item: ScopedMemoryItem): string {
  const frontmatter = [
    "---",
    `itemId: ${renderScalar(item.itemId)}`,
    `scopeType: ${renderScalar(item.scopeType)}`,
    `scopeId: ${renderScalar(item.scopeId)}`,
    `sourceUserId: ${renderScalar(item.sourceUserId ?? "")}`,
    `provenance: ${renderScalar(resolveProvenance(item))}`,
    `durability: ${renderScalar(item.durability)}`,
    `createdAt: ${renderScalar(new Date(item.createdAt).toISOString())}`,
    `updatedAt: ${renderScalar(new Date(item.updatedAt).toISOString())}`,
  ];
  if (item.entryDate) {
    frontmatter.push(`entryDate: ${renderScalar(item.entryDate)}`);
  }
  if (item.itemKind) {
    frontmatter.push(`kind: ${renderScalar(item.itemKind)}`);
  }
  if (item.summary) {
    frontmatter.push(`summary: ${renderScalar(item.summary)}`);
  }
  frontmatter.push("---", item.body.trim());
  return frontmatter.join("\n");
}

function resolveEntryDate(item: ScopedMemoryItem): string {
  return `${item.entryDate ?? new Date(item.createdAt).toISOString().slice(0, 10)}.md`;
}

function resolveProvenance(item: ScopedMemoryItem): string {
  return item.provenance ?? (item.provenanceItemId ? `item:${item.provenanceItemId}` : "direct");
}

function renderScalar(value: string): string {
  return JSON.stringify(value);
}

function sanitizePathSegment(value: string): string {
  const sanitized = value.trim().replace(/[^A-Za-z0-9._-]+/g, "-");
  return sanitized || "unknown";
}

async function removeStaleCorpusFiles(root: string, keep: Set<string>): Promise<void> {
  const existingFiles = await listFiles(root);
  await Promise.all(
    existingFiles
      .filter((filePath) => !keep.has(normalizePath(filePath)))
      .map((filePath) => fs.rm(filePath, { force: true })),
  );
}

async function listFiles(root: string): Promise<string[]> {
  const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
  const files: string[] = [];
  for (const entry of entries) {
    const absolutePath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(absolutePath)));
      continue;
    }
    if (entry.isFile()) {
      files.push(absolutePath);
    }
  }
  return files;
}

function normalizePath(value: string): string {
  const normalized = path.normalize(value);
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}
