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

function read_nginx(): string {
  return readFileSync(join(process.cwd(), "nginx.conf"), "utf8").replace(
    /\r\n/g,
    "\n",
  );
}

function block_after(nginx: string, opener: string): string {
  const start = nginx.indexOf(opener);

  expect(start).toBeGreaterThanOrEqual(0);

  let depth = 0;

  for (let index = nginx.indexOf("{", start); index < nginx.length; index++) {
    if (nginx[index] === "{") depth++;
    if (nginx[index] === "}") depth--;
    if (depth === 0) return nginx.slice(start, index + 1);
  }

  throw new Error(`unterminated block: ${opener}`);
}

function zones_in(block: string): string[] {
  return [...block.matchAll(/limit_req zone=([a-z_]+)/g)].map((m) => m[1]);
}

describe("nginx rate limit zones", () => {
  const nginx = read_nginx();

  it("declares separate zones for favicons and the gallery", () => {
    expect(nginx).toMatch(
      /limit_req_zone \$rate_limit_key zone=favicon_limit:/,
    );
    expect(nginx).toMatch(
      /limit_req_zone \$rate_limit_key zone=gallery_limit:/,
    );
  });

  it("keeps favicons out of the shared API bucket", () => {
    const favicon = block_after(nginx, "location ^~ /api/images/v1/favicon/ {");

    expect(zones_in(favicon)).toEqual(["favicon_limit"]);
    expect(favicon).toContain(
      "proxy_pass http://${BACKEND_SERVICE_HOST}:${BACKEND_SERVICE_PORT};",
    );
  });

  it("nests the favicon route inside the API block so it keeps the API headers", () => {
    const api = block_after(nginx, "location /api/ {");

    expect(api).toContain("location ^~ /api/images/v1/favicon/ {");
  });

  it("limits gallery images with their own zone", () => {
    const gallery = block_after(nginx, "location ^~ /gallery/ {");

    expect(zones_in(gallery)).toEqual(["gallery_limit"]);
  });
});
