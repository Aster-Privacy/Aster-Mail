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
import { join } from "node:path";

import { describe, it, expect } from "vitest";

const root = process.cwd();

function read(name: string): string {
  return readFileSync(join(root, name), "utf8").replace(/\r\n/g, "\n");
}

function block_body(config: string, header: string): string {
  const start = config.indexOf(header);

  expect(start).toBeGreaterThan(-1);

  let depth = 0;
  let index = start + header.length - 1;

  for (; index < config.length; index += 1) {
    if (config[index] === "{") depth += 1;

    if (config[index] === "}") {
      depth -= 1;

      if (depth === 0) break;
    }
  }

  return config.slice(start + header.length, index);
}

const nginx = read("nginx.conf");

describe("source maps are not served in production", () => {
  it("strips every map file from the image document root", () => {
    const dockerfile = read("Dockerfile");

    expect(dockerfile).toMatch(
      /find \/usr\/share\/nginx\/html -name '\*\.map' -type f -delete/,
    );
  });

  it("builds without a sourceMappingURL comment in the shipped bundles", () => {
    expect(read("vite.config.ts")).toMatch(/sourcemap:\s*"hidden"/);
  });

  it("refuses a map request under the asset prefix", () => {
    const assets = block_body(nginx, "location ^~ /assets/ {");
    const maps = block_body(assets, "location ~ ^/assets/.+\\.map$ {");

    expect(maps).toMatch(/return 404;/);
    expect(maps).toMatch(/error_page 404 = @source_map_denied;/);
    expect(maps).not.toMatch(/try_files/);

    const prefix = assets.indexOf("location ~ ^/assets/.+\\.map$ {");
    const modules = assets.indexOf("location ~ ^/assets/.+\\.m?js$ {");

    expect(prefix).toBeGreaterThan(-1);
    expect(prefix).toBeLessThan(modules);
  });

  it("never hands a map request to the stale asset reload page", () => {
    const denied = block_body(nginx, "location @source_map_denied {");

    expect(denied).toMatch(/return 404;/);
    expect(denied).not.toMatch(/try_files|@stale_asset|index\.html/);
  });

  it("refuses a map request outside the asset prefix", () => {
    const suffix = block_body(nginx, "location ~* \\.map$ {");

    expect(suffix).toMatch(/return 404;/);
    expect(suffix).not.toMatch(/try_files/);
  });
});
