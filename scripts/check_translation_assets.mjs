import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const model_root = join(root, "dist", "bergamot", "models", "v1");
const registry_path = join(model_root, "registry.json");

function warn(message) {
  console.warn(`\x1b[33mtranslation assets: ${message}\x1b[0m`);
}

if (!existsSync(registry_path)) {
  warn(
    "dist/bergamot/models/v1/registry.json is missing. On-device translation will 404 and every message will report as untranslatable. public/bergamot/models/ is gitignored, so a fresh clone does not have it.",
  );
  process.exit(0);
}

let registry;

try {
  registry = JSON.parse(readFileSync(registry_path, "utf8"));
} catch {
  warn("dist/bergamot/models/v1/registry.json is not valid JSON.");
  process.exit(0);
}

const missing = [];

for (const [pair, files] of Object.entries(registry)) {
  for (const entry of Object.values(files ?? {})) {
    const name = entry?.name;

    if (typeof name !== "string") continue;
    if (!existsSync(join(model_root, name))) missing.push(`${pair}/${name}`);
  }
}

if (missing.length > 0) {
  warn(
    `${missing.length} model file(s) referenced by registry.json are missing from dist: ${missing.slice(0, 6).join(", ")}${missing.length > 6 ? ", ..." : ""}`,
  );
  process.exit(0);
}

console.log(
  `translation assets: ${Object.keys(registry).length} model pair(s) present in dist`,
);
