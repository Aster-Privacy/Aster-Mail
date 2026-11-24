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
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const config = readFileSync(join(root, "nginx.conf"), "utf8").replace(
  /\r\n/g,
  "\n",
);

function directives(policy: string): Record<string, string[]> {
  const parsed: Record<string, string[]> = {};

  for (const part of policy.split(";")) {
    const tokens = part.trim().split(/\s+/).filter(Boolean);

    if (tokens.length === 0) continue;

    parsed[tokens[0]] = tokens.slice(1);
  }

  return parsed;
}

const enforced = directives(
  config.match(/map \$host \$aster_csp \{\s*\n\s*default "([^"]+)"/)?.[1] ??
    "",
);

describe("web image policy", () => {
  it("limits enforced image sources to bundled and listed hosts", () => {
    const img_src = enforced["img-src"];

    expect(img_src).toBeDefined();
    expect(img_src).not.toContain("https:");
    expect(img_src).not.toContain("http:");
    expect(img_src).not.toContain("*");
    expect(
      img_src.filter(
        (source) =>
          !["'self'", "data:", "blob:"].includes(source) &&
          !/^https:\/\/[a-z0-9.-]+$/.test(source),
      ),
    ).toEqual([]);
  });

  it("sends one enforced policy and no report-only copy", () => {
    expect(config).not.toMatch(/Content-Security-Policy-Report-Only/);
    expect(config).not.toMatch(/\$aster_csp_report_only/);
  });

  it("ships no static header file with a second policy", () => {
    expect(existsSync(join(root, "public", "_headers"))).toBe(false);
  });
});
