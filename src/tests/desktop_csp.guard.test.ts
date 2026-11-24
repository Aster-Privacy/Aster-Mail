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

function directives(policy: string): Record<string, string[]> {
  const parsed: Record<string, string[]> = {};

  for (const part of policy.split(";")) {
    const tokens = part.trim().split(/\s+/).filter(Boolean);

    if (tokens.length === 0) continue;

    parsed[tokens[0]] = tokens.slice(1);
  }

  return parsed;
}

const tauri = JSON.parse(read("src-tauri/tauri.conf.json")) as {
  app: {
    security: {
      csp: string;
      dangerousDisableAssetCspModification: boolean | string[];
    };
  };
};

const desktop = directives(tauri.app.security.csp);

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

describe("desktop content security policy", () => {
  it("reads the web policy it has to match", () => {
    expect(web["script-src"]).toBeDefined();
    expect(web["script-src"]).not.toContain("'unsafe-inline'");
  });

  it("never allows an inline or evaluated script on the desktop", () => {
    expect(desktop["script-src"]).toBeDefined();
    expect(desktop["script-src"]).not.toContain("'unsafe-inline'");
    expect(desktop["script-src"]).not.toContain("'unsafe-eval'");
  });

  it("keeps the desktop script sources within the web allowance", () => {
    const extra = desktop["script-src"].filter(
      (source) => !web["script-src"].includes(source),
    );

    expect(extra).toEqual([]);
  });

  it("keeps the desktop lockdown directives", () => {
    expect(desktop["object-src"]).toEqual(["'none'"]);
    expect(desktop["base-uri"]).toEqual(["'self'"]);
    expect(desktop["frame-ancestors"]).toEqual(["'none'"]);
    expect(desktop["default-src"]).toEqual(["'self'"]);
  });

  it("lets Tauri bind bundled scripts to a nonce or a hash", () => {
    const disabled = tauri.app.security.dangerousDisableAssetCspModification;

    expect(disabled).not.toBe(true);
    expect(Array.isArray(disabled) ? disabled : []).not.toContain("script-src");
  });

  it("loads images and fonts only from bundled or Aster hosts", () => {
    for (const policy of [web, desktop]) {
      for (const directive of ["img-src", "font-src"]) {
        expect(policy[directive], directive).toBeDefined();
        expect(policy[directive], directive).not.toContain("https:");
        expect(policy[directive], directive).not.toContain("*");
      }
    }
  });

  it("lets the desktop load proxied images and fonts", () => {
    expect(native_image_proxy).toMatch(/^https:\/\/[^/]+\/api\/images\/v1\/proxy$/);
    expect(native_font_proxy).toMatch(/\/api\/content\/v1\/proxy$/);
    expect(source_allows(desktop["img-src"], native_image_proxy)).toBe(true);
    expect(source_allows(desktop["font-src"], native_font_proxy)).toBe(true);
    expect(
      source_allows(desktop["img-src"], "https://app.astermail.org/gallery/a.jpg"),
    ).toBe(true);
    expect(
      source_allows(desktop["img-src"], "https://aster-wallpapers.pages.dev/a.jpg"),
    ).toBe(false);
    expect(source_allows(desktop["img-src"], "https://tracker.example/p.gif")).toBe(
      false,
    );
  });

  it("loads desktop images and fonts only from the app host", () => {
    const native_image_hosts = [
      native_image_proxy,
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
      expect(source_allows(desktop["img-src"], url!), url).toBe(true);
    }

    for (const directive of ["img-src", "font-src"]) {
      const remote = desktop[directive].filter((source) =>
        source.startsWith("https://"),
      );

      expect(remote, directive).toEqual(["https://app.astermail.org"]);
      expect(
        source_allows(desktop[directive], "https://files.astermail.org/p.gif"),
        directive,
      ).toBe(false);
    }
  });

  it("carries no inline script in the shell document", () => {
    const shell = read("index.html");
    const inline = [...shell.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)]
      .filter(([, attributes]) => !/\bsrc=/.test(attributes))
      .filter(([, , body]) => body.trim().length > 0);

    expect(inline).toEqual([]);
  });
});
