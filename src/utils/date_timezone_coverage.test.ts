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
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const SRC = join(process.cwd(), "src");

const DATE_CALL =
  /\.toLocale(?:Date|Time)?String\(\s*app_locale\(\)\s*(,\s*\{[^}]*\})?\s*\)/g;

function collect_files(dir: string, out: string[]): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);

    if (statSync(full).isDirectory()) {
      collect_files(full, out);
      continue;
    }

    if (/\.tsx?$/.test(entry) && !entry.includes(".test.")) out.push(full);
  }

  return out;
}

describe("locale date formatting honors the display time zone", () => {
  it("never formats a date without passing the chosen time zone", () => {
    const offenders: string[] = [];

    for (const file of collect_files(SRC, [])) {
      const source = readFileSync(file, "utf8");

      for (const match of source.matchAll(DATE_CALL)) {
        const options = match[1];

        if (options === undefined) continue;
        if (options.includes("timeZone")) continue;

        const line = source.slice(0, match.index).split("\n").length;

        offenders.push(`${file.replace(SRC, "src")}:${line}`);
      }
    }

    expect(offenders).toEqual([]);
  });
});
