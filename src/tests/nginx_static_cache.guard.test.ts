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
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, it, expect } from "vitest";

const nginx = readFileSync(join(process.cwd(), "nginx.conf"), "utf8").replace(
  /\r\n/g,
  "\n",
);

function block_body(header: string): string {
  const start = nginx.indexOf(header);

  expect(start).toBeGreaterThan(-1);

  const end = nginx.indexOf("\n    }", start);

  return nginx.slice(start + header.length, end);
}

function header_lines(body: string): string[] {
  return body
    .split("\n")
    .map((line) => line.trim())
    .filter(
      (line) =>
        line.startsWith("add_header ") &&
        !line.startsWith("add_header Cache-Control "),
    )
    .sort();
}

const fonts = block_body("location ^~ /fonts/ {");
const generic_static = block_body("|webmanifest|mp3)$ {");

describe("font files", () => {
  it("are kept by the browser between visits", () => {
    const max_age = fonts.match(
      /add_header Cache-Control "public, max-age=(\d+)";/,
    );

    expect(max_age).not.toBeNull();
    expect(Number(max_age![1])).toBeGreaterThanOrEqual(86_400);
  });

  it("can still be replaced under the same name", () => {
    expect(fonts).not.toMatch(/immutable/);
  });

  it("do not keep an error response", () => {
    expect(fonts).not.toMatch(/add_header Cache-Control [^;]* always;/);
    expect(fonts).toMatch(/try_files \$uri =404;/);
  });

  it("carry the same response headers as other static files", () => {
    expect(header_lines(fonts)).toEqual(header_lines(generic_static));
    expect(header_lines(fonts).length).toBeGreaterThan(8);
  });
});

describe("static file serving", () => {
  it("revalidates unversioned scripts and styles on every load", () => {
    expect(generic_static).toMatch(
      /add_header Cache-Control "no-cache" always;/,
    );
  });

  it("compresses the web manifest and WebAssembly modules", () => {
    const types = nginx.match(/gzip_types ([^;]+);/);

    expect(types).not.toBeNull();
    expect(types![1].split(/\s+/)).toEqual(
      expect.arrayContaining([
        "application/javascript",
        "text/css",
        "application/manifest+json",
        "application/wasm",
      ]),
    );
  });

  it("never resolves a route name to a directory", () => {
    expect(nginx).not.toMatch(/try_files[^;]*\$uri\//);
  });
});
