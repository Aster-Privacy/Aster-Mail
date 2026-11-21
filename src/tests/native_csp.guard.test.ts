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
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, it, expect } from "vitest";

const root = process.cwd();
const script = join(root, "scripts", "prepare_native_dist.mjs");
const CSP_META =
  /<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]+)"\s*\/?>/gi;

function read(name: string): string {
  return readFileSync(join(root, name), "utf8").replace(/\r\n/g, "\n");
}

function directives(policy: string): Record<string, string[]> {
  const parsed: Record<string, string[]> = {};

  for (const part of policy.split(";")) {
    const tokens = part.trim().split(/\s+/).filter(Boolean);

    if (tokens.length === 0) continue;

    parsed[tokens[0]] = tokens.slice(1);
  }

  return parsed;
}

const web_policy = read("nginx.conf").match(
  /map \$host \$aster_csp \{\s*\n\s*default "([^"]+)"/,
);
const web = directives(web_policy?.[1] ?? "");

function source_allows(sources: string[], url: string): boolean {
  const target = new URL(url);

  return sources.some((source) => {
    if (!/^https:\/\//.test(source)) return false;

    const host = source.slice("https://".length).replace(/\/.*$/, "");

    if (target.protocol !== "https:") return false;
    if (host.startsWith("*.")) {
      return target.hostname.endsWith(host.slice(1));
    }

    return target.hostname === host;
  });
}

const native_image_proxy =
  read("src/lib/image_proxy.ts").match(
    /NATIVE_IMAGE_PROXY_URL = "([^"]+)"/,
  )?.[1] ?? "";
const native_font_proxy = native_image_proxy.replace(
  /\/api\/images\/v1\/proxy$/,
  "/api/content/v1/proxy",
);

let work_dir = "";

afterEach(() => {
  if (work_dir) rmSync(work_dir, { recursive: true, force: true });
  work_dir = "";
});

function prepare(index_html: string, args: string[]): string {
  work_dir = mkdtempSync(join(tmpdir(), "native-csp-"));
  const source = join(work_dir, "dist");
  const target = join(work_dir, "dist-native");

  mkdirSync(source, { recursive: true });
  writeFileSync(join(source, "index.html"), index_html);

  execFileSync(process.execPath, [script, source, target, ...args], {
    stdio: "pipe",
  });

  return readFileSync(join(target, "index.html"), "utf8");
}

function policies(html: string): string[] {
  return [...html.matchAll(CSP_META)].map((match) => match[1]);
}

const built_index = [
  "<!doctype html>",
  '<html lang="en">',
  "  <head>",
  '    <meta charset="UTF-8" />',
  '    <script src="/theme-bootstrap.js"></script>',
  '    <script type="module" crossorigin src="/assets/index-abc.js"></script>',
  "  </head>",
  '  <body><div id="root"></div></body>',
  "</html>",
].join("\n");

describe("capacitor content security policy", () => {
  it("adds one policy right after the charset, ahead of every script", () => {
    const html = prepare(built_index, ["--capacitor"]);
    const found = policies(html);

    expect(found).toHaveLength(1);

    const meta_at = html.search(CSP_META);

    expect(meta_at).toBeGreaterThan(html.indexOf("<meta charset"));
    expect(meta_at).toBeLessThan(html.indexOf("<script"));
  });

  it("never allows an inline or evaluated script", () => {
    const policy = directives(
      policies(prepare(built_index, ["--capacitor"]))[0],
    );
    const script_src = policy["script-src"];

    expect(script_src).toBeDefined();
    expect(script_src).not.toContain("'unsafe-inline'");
    expect(script_src).not.toContain("'unsafe-eval'");
    expect(script_src).not.toContain("'unsafe-hashes'");
    expect(script_src).not.toContain("*");
    expect(script_src).not.toContain("https:");
    expect(script_src).not.toContain("data:");
    expect(script_src).not.toContain("blob:");
    expect(script_src).toContain("'self'");
    expect(policy["object-src"]).toEqual(["'none'"]);
    expect(policy["base-uri"]).toEqual(["'self'"]);
    expect(policy["default-src"]).toEqual(["'self'"]);
  });

  it("keeps the script sources within the web allowance", () => {
    const policy = directives(
      policies(prepare(built_index, ["--capacitor"]))[0],
    );

    expect(web["script-src"]).toBeDefined();
    expect(
      policy["script-src"].filter(
        (source) => !web["script-src"].includes(source),
      ),
    ).toEqual([]);
  });

  it("lets the app reach its native api origin", () => {
    const policy = directives(
      policies(prepare(built_index, ["--capacitor"]))[0],
    );
    const base_url = read("src/services/api/base_url.ts");

    expect(base_url).toContain('"https://app.astermail.org/api"');
    expect(base_url).toContain('"wss://app.astermail.org/ws"');
    expect(policy["connect-src"]).toEqual(
      expect.arrayContaining([
        "https://*.astermail.org",
        "wss://*.astermail.org",
      ]),
    );
  });

  it("loads images and fonts only from bundled or Aster hosts", () => {
    const policy = directives(
      policies(prepare(built_index, ["--capacitor"]))[0],
    );

    for (const directive of ["img-src", "font-src"]) {
      expect(policy[directive], directive).toBeDefined();
      expect(policy[directive], directive).not.toContain("https:");
      expect(policy[directive], directive).not.toContain("*");
    }
  });

  it("never frames app-origin or blob documents", () => {
    const policy = directives(
      policies(prepare(built_index, ["--capacitor"]))[0],
    );
    const frame_src = policy["frame-src"];

    expect(frame_src).toBeDefined();
    expect(frame_src.length).toBeGreaterThan(0);

    for (const source of ["'self'", "blob:", "data:", "*", "https:"]) {
      expect(frame_src, source).not.toContain(source);
    }
  });

  it("lets the app load proxied images and fonts", () => {
    const policy = directives(
      policies(prepare(built_index, ["--capacitor"]))[0],
    );

    expect(native_image_proxy).toMatch(/^https:\/\/[^/]+\/api\/images\/v1\/proxy$/);
    expect(native_font_proxy).toMatch(/\/api\/content\/v1\/proxy$/);
    expect(source_allows(policy["img-src"], native_image_proxy)).toBe(true);
    expect(source_allows(policy["font-src"], native_font_proxy)).toBe(true);
    expect(source_allows(policy["img-src"], "https://tracker.example/p.gif")).toBe(
      false,
    );
  });

  it("loads native images and fonts only from the app host", () => {
    const policy = directives(
      policies(prepare(built_index, ["--capacitor"]))[0],
    );
    const native_image_hosts = [
      native_image_proxy,
      native_font_proxy,
      read("src/lib/favicon_url.ts").match(/NATIVE_BASE = "([^"]+)"/)?.[1],
      read("src/services/profile_picture_gallery.ts").match(
        /NATIVE_GALLERY_BASE = "([^"]+)"/,
      )?.[1],
      read("src/services/api/client/helpers.ts").match(
        /NATIVE_API_URL = "([^"]+)"/,
      )?.[1],
    ];

    for (const url of native_image_hosts) {
      expect(url).toMatch(/^https:\/\/app\.astermail\.org\//);
      expect(source_allows(policy["img-src"], url!), url).toBe(true);
      expect(source_allows(policy["font-src"], url!), url).toBe(true);
    }

    for (const directive of ["img-src", "font-src"]) {
      const remote = policy[directive].filter((source) =>
        source.startsWith("https://"),
      );

      expect(remote, directive).toEqual(["https://app.astermail.org"]);
      expect(
        source_allows(policy[directive], "https://files.astermail.org/p.gif"),
        directive,
      ).toBe(false);
    }
  });

  it("keeps the native connect and frame sources", () => {
    const policy = directives(
      policies(prepare(built_index, ["--capacitor"]))[0],
    );

    expect(policy["connect-src"]).toEqual(
      expect.arrayContaining([
        "https://astermail.org",
        "https://*.astermail.org",
        "wss://*.astermail.org",
      ]),
    );
    expect(policy["frame-src"]).toContain("https://calendar.astermail.org");
  });

  it("replaces a policy that is already in the page", () => {
    const html = prepare(
      built_index.replace(
        '<meta charset="UTF-8" />',
        '<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="script-src * \'unsafe-inline\'" />',
      ),
      ["--capacitor"],
    );

    const found = policies(html);

    expect(found).toHaveLength(1);
    expect(directives(found[0])["script-src"]).not.toContain("*");
    expect(directives(found[0])["script-src"]).not.toContain(
      "'unsafe-inline'",
    );
  });

  it("leaves the desktop copy to the tauri policy", () => {
    expect(policies(prepare(built_index, []))).toEqual([]);
  });

  it("rejects an unknown option", () => {
    expect(() => prepare(built_index, ["--capacitr"])).toThrow();
  });

  it("ships a page whose scripts all load from a file", () => {
    const scripts = [...read("index.html").matchAll(/<script\b([^>]*)>/gi)];

    expect(scripts.length).toBeGreaterThan(0);

    for (const [tag, attributes] of scripts) {
      expect(attributes, tag).toMatch(/\bsrc="\/[^"]+"/);
    }
  });
});
