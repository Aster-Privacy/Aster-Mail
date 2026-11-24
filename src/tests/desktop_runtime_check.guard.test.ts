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
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { describe, it, expect } from "vitest";

const root = process.cwd();

const RAW_CHECK =
  /["']__TAURI(?:_INTERNALS)?__["']\s+in\s+(?:window|globalThis|self)\b|\b(?:window|globalThis|self)\s*(?:\.\s*|\[\s*["'])__TAURI(?:_INTERNALS)?__\b/;

const RUNTIME_HELPER = "src/lib/tauri_runtime.ts";

function source_files(dir: string): string[] {
  const found: string[] = [];

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);

    if (entry.isDirectory()) {
      found.push(...source_files(path));
    } else if (
      /\.tsx?$/.test(entry.name) &&
      !/\.(test|spec)\./.test(entry.name)
    ) {
      found.push(relative(root, path).split(sep).join("/"));
    }
  }

  return found;
}

describe("desktop runtime check", () => {
  it("detects the desktop runtime only through the shared helper", () => {
    const raw = source_files(join(root, "src")).filter(
      (file) =>
        file !== RUNTIME_HELPER &&
        RAW_CHECK.test(readFileSync(join(root, file), "utf8")),
    );

    expect(raw).toEqual([]);
  });
});
