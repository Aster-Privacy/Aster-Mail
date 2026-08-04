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
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, it, expect } from "vitest";

const SRC = join(process.cwd(), "src");
const SCAN_MODULE = join(SRC, "services", "bulk_mail_scan.ts");

function source_files(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);

    if (statSync(full).isDirectory()) {
      source_files(full, out);
      continue;
    }

    if (/\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }

  return out;
}

const files = source_files(SRC).filter((f) => f !== SCAN_MODULE);

describe("bulk mail scan guards", () => {
  it("has no unbounded cursor pagination loops outside bulk_mail_scan", () => {
    const offenders = files.filter((file) =>
      /}\s*while\s*\(\s*cursor\s*\)/.test(readFileSync(file, "utf8")),
    );

    expect(
      offenders.map((f) => relative(SRC, f)),
      "use scan_received_items / scan_encrypted_items from @/services/bulk_mail_scan",
    ).toEqual([]);
  });

  it("never lists mail without an explicit page limit", () => {
    const offenders: string[] = [];

    for (const file of files) {
      const source = readFileSync(file, "utf8");
      const calls = source.match(/list_(encrypted_)?mail_items\(\{[^}]*\}\)/g);

      if (!calls) continue;

      for (const call of calls) {
        if (/\bids\b\s*[:,}]/.test(call)) continue;

        if (!call.includes("limit")) {
          offenders.push(
            `${relative(SRC, file)}: ${call.replace(/\s+/g, " ")}`,
          );
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
