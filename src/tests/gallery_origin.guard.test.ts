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
const GALLERY_HOST = "aster-wallpapers.pages.dev";

function read(name: string): string {
  return readFileSync(join(root, name), "utf8").replace(/\r\n/g, "\n");
}

function csp_lines(config: string): string[] {
  return config
    .split("\n")
    .filter((line) => /(default-src|connect-src|img-src)/.test(line));
}

describe("the profile picture gallery is served from the app origin", () => {
  it("keeps the gallery host out of every web policy", () => {
    for (const line of csp_lines(read("nginx.conf"))) {
      expect(line).not.toContain(GALLERY_HOST);
    }
  });

  it("keeps the gallery host out of the native policies", () => {
    expect(read("scripts/prepare_native_dist.mjs")).not.toContain(GALLERY_HOST);
    expect(read("src-tauri/tauri.conf.json")).not.toContain(GALLERY_HOST);
  });

  it("never points the client at the gallery host", () => {
    expect(read("src/services/profile_picture_gallery.ts")).not.toContain(
      GALLERY_HOST,
    );
  });

  it("proxies only manifest and image paths, without client headers", () => {
    const nginx = read("nginx.conf");
    const start = nginx.indexOf("location ^~ /gallery/ {");

    expect(start).toBeGreaterThan(-1);

    const block = nginx.slice(start, nginx.indexOf("\n    }\n", start));

    expect(block).toContain(
      'location ~ "^/gallery/(manifest\\.json|(?:thumb|full)/[a-z0-9][a-z0-9_-]{0,80}\\.webp)$"',
    );
    expect(block).toContain(`proxy_pass https://${GALLERY_HOST}/$1;`);
    expect(block).toContain("proxy_pass_request_headers off;");
    expect(block).toContain("proxy_ssl_verify on;");
    expect(block).toContain("proxy_hide_header Set-Cookie;");
    expect(block).toMatch(/return 404;\s*$/);
  });
});
