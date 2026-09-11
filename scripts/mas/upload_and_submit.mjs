//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the AGPLv3 as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// AGPLv3 for more details.
//
// You should have received a copy of the AGPLv3
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
import { spawnSync } from "node:child_process";
import { createPrivateKey, sign } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const BUNDLE_ID = "org.astermail.ios";
const PLATFORM = "MAC_OS";
const API_BASE = "https://api.appstoreconnect.apple.com";
const TOKEN_LIFETIME_SECONDS = 20 * 60;
const TOKEN_REFRESH_MARGIN_SECONDS = 120;
const GET_ATTEMPTS = 3;
const EDITABLE_VERSION_STATES = new Set([
  "PREPARE_FOR_SUBMISSION",
  "DEVELOPER_REJECTED",
  "REJECTED",
  "METADATA_REJECTED",
  "INVALID_BINARY",
]);
const FAILED_BUILD_STATES = new Set(["INVALID", "FAILED"]);
const repo_root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const staged_key_files = [];

process.on("exit", () => {
  for (const file of staged_key_files) rmSync(file, { force: true });
});
process.on("SIGINT", () => process.exit(130));
process.on("SIGTERM", () => process.exit(143));

function fail(message) {
  console.error(`error: ${message}`);
  process.exit(1);
}

function is_planned(id) {
  return typeof id !== "string" || id.startsWith("<");
}

function sleep(milliseconds) {
  return new Promise((done) => setTimeout(done, milliseconds));
}

function parse_positive_number(value, name) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) fail(`${name} must be a positive number`);

  return parsed;
}

function parse_options() {
  let parsed;

  try {
    parsed = parseArgs({
      options: {
        pkg: { type: "string" },
        version: { type: "string" },
        "build-number": { type: "string" },
        "skip-upload": { type: "boolean", default: false },
        "dry-run": { type: "boolean", default: false },
        "poll-timeout": { type: "string", default: "60" },
        "poll-interval": { type: "string", default: "30" },
      },
      strict: true,
    }).values;
  } catch (error) {
    fail(error.message);
  }
  if (!parsed.pkg) fail("--pkg is required");
  if (!existsSync(parsed.pkg)) fail(`package not found: ${parsed.pkg}`);

  return {
    pkg: resolve(parsed.pkg),
    version: parsed.version,
    build_number: parsed["build-number"],
    skip_upload: parsed["skip-upload"],
    dry_run: parsed["dry-run"],
    poll_timeout_minutes: parse_positive_number(parsed["poll-timeout"], "--poll-timeout"),
    poll_interval_seconds: parse_positive_number(parsed["poll-interval"], "--poll-interval"),
  };
}

function require_env(name) {
  const value = process.env[name];

  if (!value) fail(`${name} is not set`);

  return value;
}

function load_credentials() {
  const key_id = require_env("APPLE_API_KEY");
  const issuer_id = require_env("APPLE_API_ISSUER");
  const key_path = process.env.APPLE_API_KEY_PATH;
  const key_content = process.env.APPLE_API_KEY_CONTENT;
  let pem;

  if (key_path) {
    if (!existsSync(key_path)) fail("APPLE_API_KEY_PATH does not point to a file");
    pem = readFileSync(key_path, "utf8");
  } else if (key_content) {
    pem = key_content.includes("BEGIN PRIVATE KEY")
      ? key_content
      : Buffer.from(key_content, "base64").toString("utf8");
  } else {
    fail("set APPLE_API_KEY_PATH or APPLE_API_KEY_CONTENT");
  }
  if (!pem.includes("BEGIN PRIVATE KEY")) fail("the App Store Connect API key is not a PEM encoded .p8 key");
  let private_key;

  try {
    private_key = createPrivateKey(pem);
  } catch {
    fail("the App Store Connect API key could not be parsed");
  }

  return { key_id, issuer_id, key_path: key_path ? resolve(key_path) : null, pem, private_key };
}

function create_token_source({ key_id, issuer_id, private_key }) {
  let cached = null;

  return () => {
    const now = Math.floor(Date.now() / 1000);

    if (cached && cached.expires_at - TOKEN_REFRESH_MARGIN_SECONDS > now) return cached.token;
    const header = Buffer.from(JSON.stringify({ alg: "ES256", kid: key_id, typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(
      JSON.stringify({ iss: issuer_id, iat: now, exp: now + TOKEN_LIFETIME_SECONDS, aud: "appstoreconnect-v1" }),
    ).toString("base64url");
    const signature = sign("sha256", Buffer.from(`${header}.${payload}`), {
      key: private_key,
      dsaEncoding: "ieee-p1363",
    }).toString("base64url");

    cached = { token: `${header}.${payload}.${signature}`, expires_at: now + TOKEN_LIFETIME_SECONDS };

    return cached.token;
  };
}

function describe_errors(text) {
  try {
    const errors = JSON.parse(text).errors ?? [];

    return errors.map((error) => `  ${error.status ?? ""} ${error.code ?? ""}: ${error.detail ?? error.title ?? ""}`.trim());
  } catch {
    return text ? [`  ${text.slice(0, 500)}`] : [];
  }
}

function create_client(get_token, dry_run) {
  async function request(method, path, { query, body } = {}) {
    const url = new URL(`${API_BASE}${path}`);

    for (const [name, value] of Object.entries(query ?? {})) url.searchParams.set(name, value);
    if (method !== "GET" && dry_run) {
      console.log(`[dry-run] ${method} ${path}${body ? ` ${JSON.stringify(body)}` : ""}`);

      return null;
    }
    const attempts = method === "GET" ? GET_ATTEMPTS : 1;

    for (let attempt = 1; ; attempt += 1) {
      const response = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${get_token()}`,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      const text = await response.text();

      if (response.ok) return text ? JSON.parse(text) : null;
      const retryable = response.status === 429 || response.status >= 500;

      if (retryable && attempt < attempts) {
        await sleep(attempt * 5000);
        continue;
      }
      const details = describe_errors(text);

      throw new Error([`${method} ${path} failed with HTTP ${response.status}`, ...details].join("\n"));
    }
  }

  return {
    get: (path, query) => request("GET", path, { query }),
    post: (path, body) => request("POST", path, { body }),
    patch: (path, body) => request("PATCH", path, { body }),
  };
}

function read_json_file(file) {
  return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
}

function default_version() {
  const mas_config = read_json_file(join(repo_root, "src-tauri", "tauri.mas.conf.json"));
  const base_config = read_json_file(join(repo_root, "src-tauri", "tauri.conf.json"));

  return mas_config.version ?? base_config.version;
}

function read_attribute(tag, name) {
  return tag.match(new RegExp(`(?:^|\\s)${name}="([^"]*)"`))?.[1];
}

function read_pkg_metadata(pkg) {
  const work_dir = mkdtempSync(join(tmpdir(), "aster_mas_pkg_"));
  const expanded = join(work_dir, "expanded");
  const metadata = {};

  try {
    const result = spawnSync("pkgutil", ["--expand", pkg, expanded], { encoding: "utf8" });

    if (result.status === 0) {
      const documents = [join(expanded, "Distribution")];

      for (const entry of readdirSync(expanded)) documents.push(join(expanded, entry, "PackageInfo"));
      for (const document of documents.filter((file) => existsSync(file))) {
        const tags = readFileSync(document, "utf8").match(/<bundle\s[^>]*>/g) ?? [];
        const tag = tags.find((candidate) => read_attribute(candidate, "CFBundleVersion"));

        if (tag) {
          metadata.bundle_id = read_attribute(tag, "id");
          metadata.version = read_attribute(tag, "CFBundleShortVersionString");
          metadata.build_number = read_attribute(tag, "CFBundleVersion");
          break;
        }
      }
    }
  } finally {
    rmSync(work_dir, { recursive: true, force: true });
  }
  if (!metadata.build_number) {
    const match = basename(pkg).match(/-(\d+(?:\.\d+)*)-(\d+(?:\.\d+){0,2})\.pkg$/);

    if (match) {
      metadata.version = match[1];
      metadata.build_number = match[2];
    }
  }

  return metadata;
}

function resolve_release(options, metadata) {
  const version = options.version ?? default_version();
  const build_number = options.build_number ?? metadata.build_number;

  if (!version) fail("could not determine the version; pass --version");
  if (!build_number) fail("could not read the build number from the package; pass --build-number");
  if (metadata.bundle_id && metadata.bundle_id !== BUNDLE_ID) {
    fail(`the package bundle identifier is ${metadata.bundle_id}, expected ${BUNDLE_ID}`);
  }
  if (metadata.version && metadata.version !== version) {
    fail(`the package version is ${metadata.version}, expected ${version}`);
  }
  if (metadata.build_number && metadata.build_number !== build_number) {
    fail(`the package build number is ${metadata.build_number}, expected ${build_number}`);
  }

  return { version, build_number };
}

async function resolve_app_id(client) {
  if (process.env.ASC_APP_ID) return process.env.ASC_APP_ID;
  const response = await client.get("/v1/apps", {
    "filter[bundleId]": BUNDLE_ID,
    "fields[apps]": "bundleId,name",
    limit: "10",
  });
  const app = response.data.find((candidate) => candidate.attributes?.bundleId === BUNDLE_ID);

  if (!app) fail(`no App Store Connect app found for ${BUNDLE_ID}`);

  return app.id;
}

async function find_build(client, app_id, { version, build_number }) {
  const response = await client.get("/v1/builds", {
    "filter[app]": app_id,
    "filter[version]": build_number,
    "filter[preReleaseVersion.version]": version,
    "filter[preReleaseVersion.platform]": PLATFORM,
    limit: "5",
  });

  return response.data[0] ?? null;
}

function stage_key_for_altool(credentials) {
  const file_name = `AuthKey_${credentials.key_id}.p8`;

  if (credentials.key_path && basename(credentials.key_path) === file_name) {
    return { API_PRIVATE_KEYS_DIR: dirname(credentials.key_path) };
  }
  const directory = join(homedir(), ".appstoreconnect", "private_keys");
  const target = join(directory, file_name);

  if (existsSync(target)) {
    if (readFileSync(target, "utf8").trim() !== credentials.pem.trim()) {
      fail(`${target} already exists with a different key`);
    }

    return {};
  }
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  writeFileSync(target, credentials.pem, { mode: 0o600, flag: "wx" });
  staged_key_files.push(target);

  return {};
}

function altool_uses_kebab_flags() {
  const result = spawnSync("xcrun", ["altool", "--help"], { encoding: "utf8" });

  return `${result.stdout ?? ""}${result.stderr ?? ""}`.includes("--api-key <");
}

function upload_package({ pkg, app_id, release, credentials, dry_run }) {
  const kebab = altool_uses_kebab_flags();
  const target_args = kebab
    ? []
    : [
        "-t",
        "macos",
        "--apple-id",
        app_id,
        "--bundle-id",
        BUNDLE_ID,
        "--bundle-version",
        release.build_number,
        "--bundle-short-version-string",
        release.version,
      ];
  const auth_args = kebab
    ? ["--api-key", credentials.key_id, "--api-issuer", credentials.issuer_id]
    : ["--apiKey", credentials.key_id, "--apiIssuer", credentials.issuer_id];
  const args = ["altool", "--upload-package", pkg, ...target_args, ...auth_args];
  const printable = args.map((arg) =>
    arg === credentials.key_id ? "<APPLE_API_KEY>" : arg === credentials.issuer_id ? "<APPLE_API_ISSUER>" : arg,
  );

  console.log(`${dry_run ? "[dry-run] " : ""}xcrun ${printable.join(" ")}`);
  if (dry_run) return;
  const env = { ...process.env, ...stage_key_for_altool(credentials) };

  delete env.APPLE_API_KEY_CONTENT;
  const result = spawnSync("xcrun", args, { stdio: "inherit", env });

  if (result.status !== 0) fail(`altool upload failed with exit code ${result.status}`);
}

async function ensure_app_store_version(client, app_id, release) {
  const response = await client.get(`/v1/apps/${app_id}/appStoreVersions`, {
    "filter[platform]": PLATFORM,
    "filter[versionString]": release.version,
    include: "build",
    limit: "5",
  });
  const existing = response.data[0];

  if (!existing) {
    const created = await client.post("/v1/appStoreVersions", {
      data: {
        type: "appStoreVersions",
        attributes: { platform: PLATFORM, versionString: release.version, releaseType: "AFTER_APPROVAL" },
        relationships: { app: { data: { type: "apps", id: app_id } } },
      },
    });
    const id = created?.data?.id ?? "<new app store version>";

    console.log(`created ${PLATFORM} version ${release.version} (${id})`);

    return { id, state: "PREPARE_FOR_SUBMISSION", attached_build_number: null };
  }
  const state = existing.attributes.appVersionState ?? existing.attributes.appStoreVersionState;
  const attached_build_id = existing.relationships?.build?.data?.id;
  const attached_build = (response.included ?? []).find((item) => item.type === "builds" && item.id === attached_build_id);

  console.log(`found ${PLATFORM} version ${release.version} (${existing.id}) in state ${state}`);
  if (EDITABLE_VERSION_STATES.has(state) && existing.attributes.releaseType !== "AFTER_APPROVAL") {
    await client.patch(`/v1/appStoreVersions/${existing.id}`, {
      data: { type: "appStoreVersions", id: existing.id, attributes: { releaseType: "AFTER_APPROVAL" } },
    });
  }

  return { id: existing.id, state, attached_build_number: attached_build?.attributes?.version ?? null };
}

async function wait_for_valid_build(client, app_id, release, options) {
  const deadline = Date.now() + options.poll_timeout_minutes * 60_000;

  for (;;) {
    const build = await find_build(client, app_id, release);
    const state = build?.attributes?.processingState;

    if (state === "VALID") {
      console.log(`build ${release.build_number} is VALID (${build.id})`);

      return build;
    }
    if (FAILED_BUILD_STATES.has(state)) fail(`build ${release.build_number} processing ended in state ${state}`);
    if (options.dry_run) {
      console.log(
        `[dry-run] build ${release.build_number} is ${state ?? "not visible yet"}; a real run polls every ${options.poll_interval_seconds}s until VALID`,
      );

      return build;
    }
    if (Date.now() >= deadline) {
      fail(`timed out after ${options.poll_timeout_minutes} minutes waiting for build ${release.build_number}`);
    }
    console.log(`build ${release.build_number}: ${state ?? "not visible yet"}, checking again in ${options.poll_interval_seconds}s`);
    await sleep(options.poll_interval_seconds * 1000);
  }
}

async function find_encryption_declaration(client, app_id) {
  if (process.env.ASC_ENCRYPTION_DECLARATION_ID) return process.env.ASC_ENCRYPTION_DECLARATION_ID;
  const response = await client.get("/v1/appEncryptionDeclarations", { "filter[app]": app_id, limit: "50" });
  const approved = response.data.filter((item) => item.attributes?.appEncryptionDeclarationState === "APPROVED");
  const declaration = approved.find((item) => item.attributes?.platform === PLATFORM) ?? approved[0];

  if (!declaration) {
    fail("no approved app encryption declaration found; create one in App Store Connect or set ASC_ENCRYPTION_DECLARATION_ID");
  }

  return declaration.id;
}

async function declare_encryption(client, app_id, build) {
  const current = build?.attributes?.usesNonExemptEncryption;

  if (current === true || current === false) {
    console.log(`export compliance already set on the build (usesNonExemptEncryption=${current})`);

    return;
  }
  const build_id = build?.id ?? "<build>";
  const declaration_id = await find_encryption_declaration(client, app_id);

  await client.patch(`/v1/builds/${build_id}`, {
    data: { type: "builds", id: build_id, attributes: { usesNonExemptEncryption: true } },
  });
  await client.post(`/v1/appEncryptionDeclarations/${declaration_id}/relationships/builds`, {
    data: [{ type: "builds", id: build_id }],
  });
  console.log(`declared export compliance with encryption declaration ${declaration_id}`);
}

async function attach_build(client, app_store_version, build, release) {
  if (app_store_version.attached_build_number === release.build_number) {
    console.log(`build ${release.build_number} is already attached to version ${release.version}`);

    return;
  }
  const build_id = build?.id ?? "<build>";

  await client.patch(`/v1/appStoreVersions/${app_store_version.id}/relationships/build`, {
    data: { type: "builds", id: build_id },
  });
  console.log(`attached build ${release.build_number} to version ${release.version}`);
}

async function submit_for_review(client, app_id, app_store_version) {
  const open = await client.get("/v1/reviewSubmissions", {
    "filter[app]": app_id,
    "filter[platform]": PLATFORM,
    "filter[state]": "READY_FOR_REVIEW",
    limit: "10",
  });
  let submission_id = open.data[0]?.id;

  if (submission_id) {
    console.log(`reusing open review submission ${submission_id}`);
  } else {
    const created = await client.post("/v1/reviewSubmissions", {
      data: {
        type: "reviewSubmissions",
        attributes: { platform: PLATFORM },
        relationships: { app: { data: { type: "apps", id: app_id } } },
      },
    });

    submission_id = created?.data?.id ?? "<new review submission>";
  }
  const items = is_planned(submission_id)
    ? { data: [] }
    : await client.get(`/v1/reviewSubmissions/${submission_id}/items`, { include: "appStoreVersion", limit: "50" });
  const has_version = items.data.some(
    (item) => item.relationships?.appStoreVersion?.data?.id === app_store_version.id,
  );

  if (!has_version) {
    await client.post("/v1/reviewSubmissionItems", {
      data: {
        type: "reviewSubmissionItems",
        relationships: {
          reviewSubmission: { data: { type: "reviewSubmissions", id: submission_id } },
          appStoreVersion: { data: { type: "appStoreVersions", id: app_store_version.id } },
        },
      },
    });
  }
  const submitted = await client.patch(`/v1/reviewSubmissions/${submission_id}`, {
    data: { type: "reviewSubmissions", id: submission_id, attributes: { submitted: true } },
  });

  if (submitted) console.log(`review submission ${submission_id} is ${submitted.data.attributes.state}`);
}

async function main() {
  const options = parse_options();
  const credentials = load_credentials();
  const client = create_client(create_token_source(credentials), options.dry_run);
  const release = resolve_release(options, read_pkg_metadata(options.pkg));

  console.log(
    `${BUNDLE_ID} ${release.version} (${release.build_number}) for ${PLATFORM}${options.dry_run ? ", dry run" : ""}`,
  );
  const app_id = await resolve_app_id(client);

  console.log(`app ${app_id}`);
  const app_store_version = await ensure_app_store_version(client, app_id, release);

  if (!EDITABLE_VERSION_STATES.has(app_store_version.state)) {
    if (app_store_version.attached_build_number === release.build_number) {
      console.log(`version ${release.version} is already ${app_store_version.state} with build ${release.build_number}`);

      return;
    }
    fail(`version ${release.version} is ${app_store_version.state} and cannot take a new build; bump the version`);
  }
  if (options.skip_upload) {
    console.log("skipping upload");
  } else if (await find_build(client, app_id, release)) {
    console.log(`build ${release.build_number} already exists in App Store Connect; skipping upload`);
  } else {
    upload_package({ pkg: options.pkg, app_id, release, credentials, dry_run: options.dry_run });
  }
  const build = await wait_for_valid_build(client, app_id, release, options);

  await declare_encryption(client, app_id, build);
  await attach_build(client, app_store_version, build, release);
  await submit_for_review(client, app_id, app_store_version);
}

main().catch((error) => fail(error.message));
