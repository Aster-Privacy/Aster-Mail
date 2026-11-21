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
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const IANA_TLD_URL = "https://data.iana.org/TLD/tlds-alpha-by-domain.txt";
const MIN_EXPECTED_TLDS = 1000;
const TLD_PATTERN = /^(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/;

const script_dir = path.dirname(fileURLToPath(import.meta.url));
const output_path = path.resolve(
  script_dir,
  "../src/services/api/aliases/iana_tlds.ts",
);

const license_header = `//
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
`;

async function load_source(local_path) {
  if (local_path) return readFile(local_path, "utf8");

  const response = await fetch(IANA_TLD_URL);

  if (!response.ok) {
    throw new Error(`IANA list request failed with ${response.status}`);
  }

  return response.text();
}

function parse_tld_list(text) {
  const lines = text.split(/\r?\n/).map((line) => line.trim());
  const version_line = lines.find((line) => line.startsWith("#")) ?? "";
  const version = version_line.match(/Version\s+(\d+)/)?.[1];

  if (!version) throw new Error("IANA list has no version line");

  const tlds = lines
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => line.toLowerCase());

  const invalid = tlds.filter((tld) => !TLD_PATTERN.test(tld));

  if (invalid.length > 0) {
    throw new Error(`Unexpected TLD entries: ${invalid.join(", ")}`);
  }
  if (tlds.length < MIN_EXPECTED_TLDS) {
    throw new Error(`IANA list has only ${tlds.length} entries`);
  }

  return { version, tlds: [...new Set(tlds)].sort() };
}

const { version, tlds } = parse_tld_list(await load_source(process.argv[2]));

const body = [
  license_header,
  `export const IANA_TLD_LIST_VERSION = "${version}";`,
  "",
  "export const IANA_TLDS: ReadonlySet<string> = new Set([",
  ...tlds.map((tld) => `  "${tld}",`),
  "]);",
  "",
].join("\n");

await writeFile(output_path, body, "utf8");
console.log(`Wrote ${tlds.length} TLDs (version ${version}) to ${output_path}`);
