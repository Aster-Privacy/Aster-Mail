import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const model_root = join(root, "dist", "bergamot", "models", "v1");
const registry_path = join(model_root, "registry.json");

function warn(message) {
  console.warn(`\x1b[33mtranslation assets: ${message}\x1b[0m`);
}

function fail(message) {
  console.error(`\x1b[31mtranslation assets: ${message}\x1b[0m`);
  process.exit(1);
}

let registry_source;

try {
  registry_source = readFileSync(registry_path, "utf8");
} catch {
  warn(
    "dist/bergamot/models/v1/registry.json is missing. On-device translation will 404 and every message will report as untranslatable. public/bergamot/models/ is gitignored, so a fresh clone does not have it. Run: node scripts/fetch_translation_models.mjs",
  );
  process.exit(0);
}

let registry;

try {
  registry = JSON.parse(registry_source);
} catch {
  warn("dist/bergamot/models/v1/registry.json is not valid JSON.");
  process.exit(0);
}

const missing = [];
const unhashed = [];
const corrupt = [];
let total_bytes = 0;

for (const files of Object.values(registry)) {
  for (const entry of Object.values(files ?? {})) {
    const name = entry?.name;

    if (typeof name !== "string") continue;

    const path = join(model_root, name);
    let bytes;

    try {
      bytes = readFileSync(path);
    } catch {
      missing.push(name);
      continue;
    }

    total_bytes += bytes.length;

    if (typeof entry.expectedSha256Hash !== "string") {
      unhashed.push(name);
      continue;
    }

    const actual = createHash("sha256").update(bytes).digest("hex");

    if (actual !== entry.expectedSha256Hash) {
      corrupt.push(name);
    } else if (typeof entry.size === "number" && entry.size !== bytes.length) {
      corrupt.push(`${name} (size)`);
    }
  }
}

if (missing.length > 0) {
  warn(
    `${missing.length} model file(s) referenced by registry.json are missing from dist: ${missing.slice(0, 6).join(", ")}${missing.length > 6 ? ", ..." : ""}`,
  );
  process.exit(0);
}

if (corrupt.length > 0) {
  fail(
    `${corrupt.length} model file(s) do not match the checksum in registry.json: ${corrupt.slice(0, 6).join(", ")}. The runtime enforces these hashes with subresource integrity, so translation would fail for every user. Re-run: node scripts/fetch_translation_models.mjs`,
  );
}

if (unhashed.length > 0) {
  fail(
    `${unhashed.length} model file(s) have no expectedSha256Hash in registry.json: ${unhashed.slice(0, 6).join(", ")}. Regenerate it with: node scripts/fetch_translation_models.mjs`,
  );
}

console.log(
  `translation assets: ${Object.keys(registry).length} model pair(s) present in dist, ${(total_bytes / 1e6).toFixed(1)} MB, all checksums verified`,
);
