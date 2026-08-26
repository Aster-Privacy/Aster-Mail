import { spawnSync } from "node:child_process";
import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const BUCKET = "aster-translation-models";
const KEY_PREFIX = "";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const model_root = join(root, "public", "bergamot", "models", "v1");

function fail(message) {
  console.error(`\x1b[31mupload models: ${message}\x1b[0m`);
  process.exit(1);
}

function human(bytes) {
  return `${(bytes / 1e6).toFixed(1)} MB`;
}

function content_type(key) {
  return key.endsWith(".json") ? "application/json" : "application/octet-stream";
}

function cache_control(key) {
  return key === "registry.json"
    ? "public, max-age=3600"
    : "public, max-age=31536000, immutable";
}

async function collect() {
  const entries = [];
  const registry_path = join(model_root, "registry.json");

  try {
    await stat(registry_path);
  } catch {
    fail("registry.json is missing, run fetch_translation_models.mjs first");
  }

  const registry = JSON.parse(await readFile(registry_path, "utf8"));

  for (const pair of Object.keys(registry).sort()) {
    for (const name of await readdir(join(model_root, pair))) {
      const path = join(model_root, pair, name);
      const info = await stat(path);

      if (!info.isFile()) continue;

      entries.push({ key: `${pair}/${name}`, path, size: info.size });
    }
  }

  entries.push({
    key: "registry.json",
    path: registry_path,
    size: (await stat(registry_path)).size,
  });

  return entries;
}

function upload(entry) {
  const key = `${KEY_PREFIX}${entry.key}`;
  const result = spawnSync(
    process.platform === "win32" ? "npx.cmd" : "npx",
    [
      "wrangler",
      "r2",
      "object",
      "put",
      `${BUCKET}/${key}`,
      "--file",
      entry.path,
      "--content-type",
      content_type(entry.key),
      "--cache-control",
      cache_control(entry.key),
      "--remote",
    ],
    { stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" },
  );

  if (result.status !== 0) {
    fail(`${key} failed: ${result.stderr || result.stdout}`);
  }

  console.log(`  ${key} ${human(entry.size)}`);
}

const entries = await collect();
const total = entries.reduce((sum, entry) => sum + entry.size, 0);

console.log(`upload models: ${entries.length} object(s), ${human(total)}`);

for (const entry of entries) {
  upload(entry);
}

console.log(`upload models: done, ${human(total)} in ${BUCKET}`);
