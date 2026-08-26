import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const model_root = join(root, "public", "bergamot", "models", "v1");

function fail(message) {
  console.error(`verify models: ${message}`);
  process.exit(1);
}

async function walk(dir) {
  const found = [];

  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);

    if (entry.isDirectory()) found.push(...(await walk(full)));
    else found.push(relative(model_root, full).split(sep).join("/"));
  }

  return found;
}

const registry_path = join(model_root, "registry.json");

try {
  await stat(registry_path);
} catch {
  fail("models are missing, run scripts/fetch_translation_models.mjs first");
}

const registry = JSON.parse(await readFile(registry_path, "utf8"));

const listed = new Set();
const missing = [];
const mismatched = [];
let entries = 0;
let bytes = 0;

for (const pair of Object.keys(registry)) {
  for (const kind of Object.keys(registry[pair])) {
    const entry = registry[pair][kind];

    if (!entry || typeof entry.name !== "string") continue;

    entries += 1;
    listed.add(entry.name);

    const file = join(model_root, entry.name);
    let buffer;

    try {
      buffer = await readFile(file);
    } catch {
      missing.push(entry.name);
      continue;
    }

    bytes += buffer.length;

    const digest = createHash("sha256").update(buffer).digest("hex");

    if (digest !== entry.expectedSha256Hash) {
      mismatched.push(`${entry.name} hash ${digest.slice(0, 12)} expected ${String(entry.expectedSha256Hash).slice(0, 12)}`);
    }

    if (typeof entry.size === "number" && entry.size !== buffer.length) {
      mismatched.push(`${entry.name} size ${buffer.length} expected ${entry.size}`);
    }
  }
}

const unlisted = (await walk(model_root)).filter(
  (name) => name !== "registry.json" && !listed.has(name),
);

console.log(
  `verify models: ${Object.keys(registry).length} pairs, ${entries} files, ${(bytes / 1048576).toFixed(0)} MB`,
);

if (missing.length) fail(`${missing.length} missing: ${missing.slice(0, 5).join(", ")}`);
if (mismatched.length) fail(`${mismatched.length} mismatched: ${mismatched.slice(0, 5).join(", ")}`);
if (unlisted.length) fail(`${unlisted.length} unlisted on disk: ${unlisted.slice(0, 5).join(", ")}`);

console.log("verify models: registry and files agree");
