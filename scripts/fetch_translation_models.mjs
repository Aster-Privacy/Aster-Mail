import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const RECORDS_URL =
  "https://firefox.settings.services.mozilla.com/v1/buckets/main/collections/translations-models/records";
const SERVER_ROOT = "https://firefox.settings.services.mozilla.com/v1/";

const MODEL_PAIRS = [
  { pair: "aren", from: "ar", to: "en", version: "2.2" },
  { pair: "iten", from: "it", to: "en", version: "1.0" },
  { pair: "jaen", from: "ja", to: "en", version: "2.1" },
  { pair: "koen", from: "ko", to: "en", version: "2.1" },
  { pair: "nlen", from: "nl", to: "en", version: "1.0" },
  { pair: "plen", from: "pl", to: "en", version: "1.0" },
  { pair: "pten", from: "pt", to: "en", version: "1.0" },
  { pair: "ruen", from: "ru", to: "en", version: "1.1" },
  { pair: "tren", from: "tr", to: "en", version: "1.0" },
  { pair: "zhen", from: "zh-Hans", to: "en", version: "2.1" },
  { pair: "enar", from: "en", to: "ar", version: "2.2" },
  { pair: "enit", from: "en", to: "it", version: "2.1" },
  { pair: "enja", from: "en", to: "ja", version: "2.3" },
  { pair: "enko", from: "en", to: "ko", version: "2.1" },
  { pair: "ennl", from: "en", to: "nl", version: "2.1" },
  { pair: "enpl", from: "en", to: "pl", version: "2.1" },
  { pair: "enpt", from: "en", to: "pt", version: "2.1" },
  { pair: "enru", from: "en", to: "ru", version: "2.1" },
  { pair: "entr", from: "en", to: "tr", version: "1.0" },
  { pair: "enzh", from: "en", to: "zh-Hans", version: "2.2" },
];

const REGISTRY_FILE_TYPES = ["model", "lex", "vocab", "srcvocab", "trgvocab"];

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const model_root = join(root, "public", "bergamot", "models", "v1");

function fail(message) {
  console.error(`\x1b[31mtranslation models: ${message}\x1b[0m`);
  process.exit(1);
}

function human(bytes) {
  return `${(bytes / 1e6).toFixed(1)} MB`;
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

async function attachment_base_url() {
  const response = await fetch(SERVER_ROOT);

  if (!response.ok) fail(`remote settings root returned ${response.status}`);

  const body = await response.json();
  const base = body?.capabilities?.attachments?.base_url;

  if (typeof base !== "string" || !base.startsWith("https://")) {
    fail("remote settings did not advertise an https attachment base url");
  }

  return base.endsWith("/") ? base : `${base}/`;
}

async function load_records() {
  const response = await fetch(RECORDS_URL);

  if (!response.ok) fail(`model records returned ${response.status}`);

  const body = await response.json();

  if (!Array.isArray(body?.data)) fail("model records payload has no data array");

  return body.data;
}

function select_records(records, entry) {
  const matches = records.filter(
    (record) =>
      record.fromLang === entry.from &&
      record.toLang === entry.to &&
      record.version === entry.version &&
      REGISTRY_FILE_TYPES.includes(record.fileType),
  );

  if (matches.length === 0) {
    fail(`no records for ${entry.from}->${entry.to} at version ${entry.version}`);
  }

  const by_type = new Map();

  for (const record of matches) {
    if (by_type.has(record.fileType)) {
      fail(
        `duplicate ${record.fileType} record for ${entry.from}->${entry.to} at version ${entry.version}`,
      );
    }

    by_type.set(record.fileType, record);
  }

  if (!by_type.has("model") || !by_type.has("lex")) {
    fail(`${entry.pair} is missing a model or lex file`);
  }

  if (!by_type.has("vocab") && !(by_type.has("srcvocab") && by_type.has("trgvocab"))) {
    fail(`${entry.pair} has neither a vocab nor a srcvocab/trgvocab pair`);
  }

  return [...by_type.values()];
}

async function already_valid(path, expected_hash) {
  try {
    const existing = await readFile(path);

    return sha256(existing) === expected_hash;
  } catch {
    return false;
  }
}

async function download_record(base, pair, record) {
  const target = join(model_root, pair, record.name);
  const expected_hash = record.attachment.hash;

  if (await already_valid(target, expected_hash)) {
    console.log(`  ${pair}/${record.name} already present`);

    return;
  }

  const url = `${base}${record.attachment.location}`;
  const response = await fetch(url);

  if (!response.ok) fail(`${url} returned ${response.status}`);

  const bytes = Buffer.from(await response.arrayBuffer());
  const actual_hash = sha256(bytes);

  if (actual_hash !== expected_hash) {
    fail(
      `checksum mismatch for ${pair}/${record.name}: expected ${expected_hash}, got ${actual_hash}`,
    );
  }

  if (bytes.length !== record.attachment.size) {
    fail(
      `size mismatch for ${pair}/${record.name}: expected ${record.attachment.size}, got ${bytes.length}`,
    );
  }

  await mkdir(join(model_root, pair), { recursive: true });
  await writeFile(target, bytes);

  console.log(`  ${pair}/${record.name} ${human(bytes.length)} verified`);
}

function registry_key_for(name) {
  for (const type of REGISTRY_FILE_TYPES) {
    if (name.startsWith(`${type}.`)) return type;
  }

  return null;
}

async function build_registry() {
  const registry = {};
  const pairs = (await readdir(model_root, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  for (const pair of pairs) {
    if (pair.length !== 4) {
      fail(`model directory ${pair} is not a four letter language pair`);
    }

    const files = {};

    for (const name of (await readdir(join(model_root, pair))).sort()) {
      const key = registry_key_for(name);

      if (!key) continue;

      const path = join(model_root, pair, name);
      const bytes = await readFile(path);

      files[key] = {
        name: `${pair}/${name}`,
        size: bytes.length,
        expectedSha256Hash: sha256(bytes),
      };
    }

    if (!files.model || !files.lex) {
      fail(`model directory ${pair} is missing a model or lex file`);
    }

    if (!files.vocab && !(files.srcvocab && files.trgvocab)) {
      fail(`model directory ${pair} has no usable vocabulary files`);
    }

    registry[pair] = files;
  }

  await writeFile(
    join(model_root, "registry.json"),
    `${JSON.stringify(registry, null, 2)}\n`,
  );

  return registry;
}

async function total_size() {
  let total = 0;

  for (const pair of await readdir(model_root)) {
    const path = join(model_root, pair);
    const info = await stat(path);

    if (!info.isDirectory()) continue;

    for (const name of await readdir(path)) {
      total += (await stat(join(path, name))).size;
    }
  }

  return total;
}

const base = await attachment_base_url();
const records = await load_records();

console.log(`translation models: ${MODEL_PAIRS.length} pair(s) requested`);

for (const entry of MODEL_PAIRS) {
  console.log(`${entry.pair} (${entry.from}->${entry.to} v${entry.version})`);

  for (const record of select_records(records, entry)) {
    await download_record(base, entry.pair, record);
  }
}

const registry = await build_registry();

console.log(
  `translation models: registry.json written with ${Object.keys(registry).length} pair(s), ${human(await total_size())} on disk`,
);
