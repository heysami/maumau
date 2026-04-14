#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const argv = process.argv.slice(2);

const state = await openState();

try {
  const [command, ...rest] = argv;
  switch (command) {
    case "collection":
      await handleCollectionCommand(state, rest);
      break;
    case "update":
    case "embed":
      await syncAllCollections(state);
      break;
    case "query":
    case "search":
    case "vsearch":
      await handleSearchCommand(state, command, rest);
      break;
    default:
      fail(`unsupported bundled qmd command: ${command ?? "(none)"}`);
  }
} finally {
  state.db.close();
}

async function openState() {
  const xdgCacheHome = process.env.XDG_CACHE_HOME?.trim() || path.join(process.cwd(), ".cache");
  const qmdDir = path.join(xdgCacheHome, "qmd");
  const dbPath = path.join(qmdDir, "index.sqlite");
  await fs.mkdir(qmdDir, { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS collections (
      name TEXT PRIMARY KEY,
      root_path TEXT NOT NULL,
      pattern TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS documents (
      hash TEXT NOT NULL,
      collection TEXT NOT NULL,
      path TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (collection, path)
    );
    CREATE INDEX IF NOT EXISTS documents_hash_idx ON documents(hash);
    CREATE INDEX IF NOT EXISTS documents_collection_active_idx ON documents(collection, active);
  `);
  return { db, dbPath };
}

async function handleCollectionCommand(state, args) {
  const [subcommand, ...rest] = args;
  switch (subcommand) {
    case "add":
      await handleCollectionAdd(state, rest);
      return;
    case "remove":
      handleCollectionRemove(state, rest);
      return;
    case "list":
      handleCollectionList(state, rest);
      return;
    default:
      fail(`unsupported bundled qmd collection command: ${subcommand ?? "(none)"}`);
  }
}

async function handleCollectionAdd(state, args) {
  const targetPath = args[0]?.trim();
  const name = readFlagValue(args, "--name");
  const pattern = readFlagValue(args, "--mask") ?? "**/*.md";
  if (!targetPath || !name) {
    fail("collection add requires <path> --name <name>");
  }
  const existing = state.db.prepare("SELECT name FROM collections WHERE name = ?").get(name);
  if (existing) {
    fail(`collection already exists: ${name}`);
  }
  const resolvedRoot = path.resolve(targetPath);
  await fs.mkdir(path.dirname(resolvedRoot), { recursive: true });
  state.db
    .prepare("INSERT INTO collections (name, root_path, pattern) VALUES (?, ?, ?)")
    .run(name, resolvedRoot, pattern);
}

function handleCollectionRemove(state, args) {
  const name = args[0]?.trim();
  if (!name) {
    fail("collection remove requires <name>");
  }
  const result = state.db.prepare("DELETE FROM collections WHERE name = ?").run(name);
  state.db.prepare("DELETE FROM documents WHERE collection = ?").run(name);
  if ((result.changes ?? 0) === 0) {
    fail(`collection missing: ${name}`);
  }
}

function handleCollectionList(state, args) {
  const asJson = args.includes("--json");
  const rows = state.db
    .prepare("SELECT name, root_path, pattern FROM collections ORDER BY name")
    .all();
  if (asJson) {
    printJson(
      rows.map((row) => ({
        name: row.name,
        path: row.root_path,
        pattern: row.pattern,
      })),
    );
    return;
  }
  for (const row of rows) {
    process.stdout.write(`${row.name}\n`);
  }
}

async function handleSearchCommand(state, _command, args) {
  const parsed = parseSearchArgs(args);
  await ensureCollectionsIndexed(state, parsed.collections);
  const selected = selectCollections(state, parsed.collections);
  const rows = state.db
    .prepare(
      `
        SELECT d.hash, d.collection, d.path, d.updated_at, c.root_path
        FROM documents d
        JOIN collections c ON c.name = d.collection
        WHERE d.active = 1
          AND (${selected.names.map(() => "d.collection = ?").join(" OR ")})
      `,
    )
    .all(...selected.names);

  const results = [];
  for (const row of rows) {
    const absolutePath = path.join(row.root_path, row.path);
    const body = await fs.readFile(absolutePath, "utf8").catch(() => null);
    if (!body) {
      continue;
    }
    const scored = scoreDocument(body, parsed.query, row.updated_at);
    if (scored.score <= 0) {
      continue;
    }
    results.push({
      docid: row.hash,
      collection: row.collection,
      file: row.path.replace(/\\/g, "/"),
      score: scored.score,
      snippet: buildSnippet(body, parsed.query, scored.firstLine),
    });
  }

  results.sort((left, right) => right.score - left.score);
  printJson(results.slice(0, parsed.limit));
}

function parseSearchArgs(args) {
  const collections = [];
  let limit = 6;
  const positionals = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      continue;
    }
    if (arg === "-n") {
      const next = args[index + 1];
      if (next) {
        limit = Math.max(1, Number.parseInt(next, 10) || limit);
        index += 1;
      }
      continue;
    }
    if (arg === "-c") {
      const next = args[index + 1];
      if (next) {
        collections.push(next.trim());
        index += 1;
      }
      continue;
    }
    positionals.push(arg);
  }
  const query = positionals.join(" ").trim();
  if (!query) {
    fail("search query required");
  }
  return { query, limit, collections };
}

function selectCollections(state, names) {
  if (names.length > 0) {
    return { names };
  }
  const rows = state.db.prepare("SELECT name FROM collections ORDER BY name").all();
  const selected = rows.map((row) => row.name);
  if (selected.length === 0) {
    return { names: ["__none__"] };
  }
  return { names: selected };
}

async function ensureCollectionsIndexed(state, requestedNames) {
  const names = requestedNames.length > 0 ? requestedNames : null;
  const rows = names
    ? state.db
        .prepare(
          `SELECT name, root_path, pattern FROM collections WHERE ${names
            .map(() => "name = ?")
            .join(" OR ")}`,
        )
        .all(...names)
    : state.db.prepare("SELECT name, root_path, pattern FROM collections").all();

  for (const row of rows) {
    const existingCount = state.db
      .prepare("SELECT COUNT(*) AS c FROM documents WHERE collection = ? AND active = 1")
      .get(row.name);
    if ((existingCount?.c ?? 0) === 0) {
      await syncOneCollection(state, row);
    }
  }
}

async function syncAllCollections(state) {
  const rows = state.db.prepare("SELECT name, root_path, pattern FROM collections").all();
  for (const row of rows) {
    await syncOneCollection(state, row);
  }
}

async function syncOneCollection(state, row) {
  const files = await collectMatchingFiles(row.root_path, row.pattern);
  const seen = new Set(files.map((entry) => entry.relativePath));
  state.db.prepare("DELETE FROM documents WHERE collection = ?").run(row.name);
  const insert = state.db.prepare(
    `
      INSERT INTO documents (hash, collection, path, active, updated_at)
      VALUES (?, ?, ?, 1, ?)
    `,
  );
  for (const entry of files) {
    insert.run(entry.hash, row.name, entry.relativePath, entry.updatedAt);
  }
  if (seen.size === 0) {
    return;
  }
}

async function collectMatchingFiles(rootPath, pattern) {
  const resolvedRoot = path.resolve(rootPath);
  const files = [];
  if (!hasGlob(pattern)) {
    const target = path.join(resolvedRoot, pattern);
    const stat = await fs.stat(target).catch(() => null);
    if (stat?.isFile()) {
      const relativePath = pattern.replace(/\\/g, "/");
      files.push({
        relativePath,
        updatedAt: Math.floor(stat.mtimeMs),
        hash: hashDocumentPath(relativePath),
      });
    }
    return files;
  }
  await walkDirectory(resolvedRoot, async (absolutePath, stat) => {
    const relativePath = path.relative(resolvedRoot, absolutePath).replace(/\\/g, "/");
    if (!matchesPattern(relativePath, pattern)) {
      return;
    }
    files.push({
      relativePath,
      updatedAt: Math.floor(stat.mtimeMs),
      hash: hashDocumentPath(relativePath),
    });
  });
  return files;
}

async function walkDirectory(rootPath, onFile) {
  const stat = await fs.stat(rootPath).catch(() => null);
  if (!stat?.isDirectory()) {
    return;
  }
  const entries = await fs.readdir(rootPath, { withFileTypes: true });
  for (const entry of entries) {
    const absolutePath = path.join(rootPath, entry.name);
    if (entry.isDirectory()) {
      await walkDirectory(absolutePath, onFile);
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }
    const fileStat = await fs.stat(absolutePath).catch(() => null);
    if (!fileStat?.isFile()) {
      continue;
    }
    await onFile(absolutePath, fileStat);
  }
}

function scoreDocument(body, query, updatedAt) {
  const normalizedBody = body.toLowerCase();
  const normalizedQuery = query.trim().toLowerCase();
  const tokens = tokenizeQuery(query);
  let tokenMatches = 0;
  let firstLine = 1;
  for (const token of tokens) {
    if (normalizedBody.includes(token)) {
      tokenMatches += 1;
    }
  }
  if (normalizedQuery && normalizedBody.includes(normalizedQuery)) {
    const lineIndex = locateLine(body, normalizedQuery);
    if (lineIndex > 0) {
      firstLine = lineIndex;
    }
  } else if (tokens.length > 0) {
    for (const token of tokens) {
      const lineIndex = locateLine(body, token);
      if (lineIndex > 0) {
        firstLine = lineIndex;
        break;
      }
    }
  }
  const tokenScore = tokens.length > 0 ? tokenMatches / tokens.length : 0;
  const exactBonus = normalizedQuery && normalizedBody.includes(normalizedQuery) ? 0.35 : 0;
  const recencyDays = Math.max(0, (Date.now() - updatedAt) / 86_400_000);
  const recencyBonus = Math.max(0, 0.15 - recencyDays * 0.01);
  return {
    score: Math.min(1, tokenScore + exactBonus + recencyBonus),
    firstLine,
  };
}

function buildSnippet(body, query, firstLine) {
  const lines = body.split(/\r?\n/);
  const startLine = Math.max(1, firstLine);
  const selected = lines.slice(startLine - 1, startLine + 4);
  const text = selected.join("\n").trim();
  const count = Math.max(1, selected.length);
  return `@@ -${startLine},${count}\n${text || query.trim()}`;
}

function locateLine(body, token) {
  const lines = body.split(/\r?\n/);
  const lowerToken = token.toLowerCase();
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index]?.toLowerCase().includes(lowerToken)) {
      return index + 1;
    }
  }
  return 1;
}

function tokenizeQuery(query) {
  return query
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
}

function hashDocumentPath(relativePath) {
  return crypto.createHash("sha1").update(relativePath).digest("hex");
}

function hasGlob(pattern) {
  return /[*?[\]{}]/.test(pattern);
}

function matchesPattern(relativePath, pattern) {
  if (typeof path.matchesGlob === "function") {
    return path.matchesGlob(relativePath, pattern);
  }
  if (pattern === "**/*.md") {
    return relativePath.toLowerCase().endsWith(".md");
  }
  return relativePath === pattern;
}

function readFlagValue(args, flag) {
  const index = args.indexOf(flag);
  if (index < 0) {
    return undefined;
  }
  return args[index + 1]?.trim() || undefined;
}

function printJson(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}
