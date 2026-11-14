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
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root_dir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read_text = (relative_path) =>
  readFileSync(join(root_dir, relative_path), "utf8");

const package_version = JSON.parse(read_text("package.json")).version;
const tauri_version = JSON.parse(read_text("src-tauri/tauri.conf.json")).version;
const cargo_match = read_text("src-tauri/Cargo.toml").match(
  /\[package\][^[]*?^version\s*=\s*"([^"]+)"/m,
);
const cargo_version = cargo_match ? cargo_match[1] : null;

const metainfo_path = "flatpak/org.astermail.Mail.metainfo.xml";
const metainfo = read_text(metainfo_path);
const release_versions = [
  ...metainfo.matchAll(/<release\s[^>]*version="([^"]+)"[^>]*>/g),
].map((match) => match[1]);
const release_dates = [
  ...metainfo.matchAll(/<release\s[^>]*date="([^"]+)"[^>]*>/g),
].map((match) => match[1]);

const errors = [];

const sources = [
  ["src-tauri/tauri.conf.json", tauri_version],
  ["src-tauri/Cargo.toml", cargo_version],
  [`${metainfo_path} (newest <release>)`, release_versions[0] ?? null],
];

for (const [label, version] of sources) {
  if (version !== package_version) {
    errors.push(
      `${label} has version ${version ?? "none"}, but package.json has ${package_version}`,
    );
  }
}

if (new Set(release_versions).size !== release_versions.length) {
  errors.push(`${metainfo_path} lists the same release version more than once`);
}

if (release_dates.length !== release_versions.length) {
  errors.push(`${metainfo_path} has a <release> without a date`);
}

const sorted_dates = [...release_dates].sort().reverse();
if (sorted_dates.join() !== release_dates.join()) {
  errors.push(`${metainfo_path} must list releases newest first`);
}

if (errors.length > 0) {
  for (const error of errors) {
    console.error(`::error::${error}`);
  }
  console.error(
    `Add <release version="${package_version}" date="YYYY-MM-DD"> at the top of <releases> in ${metainfo_path} when you bump the version.`,
  );
  process.exit(1);
}

console.log(`Release versions agree on ${package_version}.`);
