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

  it("carries no inline script in the shell document", () => {
    const shell = read("index.html");
    const inline = [...shell.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)]
      .filter(([, attributes]) => !/\bsrc=/.test(attributes))
      .filter(([, , body]) => body.trim().length > 0);

    expect(inline).toEqual([]);
  });
});
