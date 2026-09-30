/*
 * Aster Mail - Privacy-first email
 * Copyright (C) 2026 Aster Privacy
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, it, expect } from "vitest";

const SRC = join(process.cwd(), "src");

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

describe("plural counts reach the translator as numbers", () => {
  it("never stringifies a count passed to t()", () => {
    const offenders: string[] = [];

    for (const file of source_files(SRC)) {
      const source = readFileSync(file, "utf8");
      const pattern = /\bt\(\s*"[^"]+"\s*,\s*\{[^{}]*count:\s*(String\(|`)/g;

      if (pattern.test(source)) {
        offenders.push(relative(SRC, file).split("\\").join("/"));
      }
    }

    expect(offenders.sort()).toEqual([]);
  });
});
