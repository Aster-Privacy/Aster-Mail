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

function read(name: string): string {
  return readFileSync(join(root, name), "utf8").replace(/\r\n/g, "\n");
}

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

function frame_src(): string[] {
  const tauri = JSON.parse(read("src-tauri/tauri.conf.json")) as {
    app: { security: { csp: string } };
  };
  const directive = tauri.app.security.csp
    .split(";")
    .map((part) => part.trim().split(/\s+/))
    .find((tokens) => tokens[0] === "frame-src");

  return directive ? directive.slice(1) : [];
}

function tag_attributes(text: string, start: number): string {
  let depth = 0;
  let quote: string | null = null;
  let attributes = "";

  for (let at = start; at < text.length; at += 1) {
    const char = text[at];

    if (quote) {
      if (char === "\\") at += 1;
      else if (char === quote) quote = null;
      if (depth === 0) attributes += char;
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      quote = char;
    } else if (char === "{") {
      depth += 1;
      if (depth === 1) attributes += char;
      continue;
    } else if (char === "}") {
      depth -= 1;
    } else if (char === ">" && depth === 0) {
      return attributes;
    }
    if (depth === 0) attributes += char;
  }

  return attributes;
}

function markup_frames(text: string): string[] {
  return [...text.matchAll(/<iframe(?=[\s/>])/gi)].map(({ index }) =>
    tag_attributes(text, index),
  );
}

const CREATED_FRAME =
  /(?:\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*)?(?:[A-Za-z_$][\w$]*\s*\??\.\s*)+createElement(?:NS)?\(\s*(?:[^,()]*,\s*)?["'`]iframe["'`]\s*\)/gi;

function escape_pattern(value: string): string {
  return value.replace(/[$]/g, "\\$&");
}

function created_frame_unsandboxed(text: string): boolean {
  const sites = [...text.matchAll(CREATED_FRAME)];

  return sites.some((site, position) => {
    const name = site[1];

    if (!name) return true;

    const scope = text.slice(site.index, sites[position + 1]?.index);
    const sandbox_call = new RegExp(
      `\\b${escape_pattern(name)}\\s*\\.\\s*setAttribute\\(\\s*["']sandbox["']`,
    );

    return !sandbox_call.test(scope);
  });
}

function unsandboxed(_file: string, text: string): boolean {
  const sandbox = /\ssandbox(?=[\s=/>]|$)/i;

  return (
    markup_frames(text).some((tag) => !sandbox.test(tag)) ||
    created_frame_unsandboxed(text)
  );
}

function sandbox_tokens(file: string): string[][] {
  return markup_frames(read(file)).map((tag) =>
    (tag.match(/\bsandbox="([^"]*)"/)?.[1] ?? "").split(/\s+/).filter(Boolean),
  );
}

const files = source_files(join(root, "src"));

describe("desktop frames", () => {
  it("never frames app-origin or blob documents on the desktop", () => {
    const sources = frame_src();

    expect(sources.length).toBeGreaterThan(0);
    expect(sources).not.toContain("'self'");
    expect(sources).not.toContain("blob:");
    expect(sources).not.toContain("data:");
    expect(sources).not.toContain("*");
    expect(sources).not.toContain("https:");
  });

  it("sandboxes every frame the app creates", () => {
    expect(files.filter((file) => unsandboxed(file, read(file)))).toEqual([]);
  });

  it("checks each created frame on its own", () => {
    const text = [
      'const first = document.createElement("iframe");',
      'first.setAttribute("sandbox", "");',
      'const second = document.createElement("iframe");',
      "second.src = url;",
    ].join("\n");

    expect(unsandboxed("frames.ts", text)).toBe(true);
    expect(
      unsandboxed(
        "frames.ts",
        `${text}\nsecond.setAttribute("sandbox", "allow-popups");`,
      ),
    ).toBe(false);
  });

  it("reads frame attributes past nested markup in props", () => {
    expect(
      unsandboxed(
        "frame.tsx",
        '<iframe src="a" render={() => <i sandbox="x" />} />',
      ),
    ).toBe(true);
    expect(
      unsandboxed(
        "frame.tsx",
        '<iframe render={() => <i />} sandbox="allow-popups" src="a" />',
      ),
    ).toBe(false);
  });

  it("follows frames created through another document reference", () => {
    const text = [
      "const doc = window.document;",
      'const frame = doc.createElement("iframe");',
      "frame.src = url;",
    ].join("\n");

    expect(unsandboxed("frames.ts", text)).toBe(true);
    expect(
      unsandboxed(
        "frames.ts",
        'const frame = host.ownerDocument?.createElement("IFRAME");',
      ),
    ).toBe(true);
    expect(
      unsandboxed("frames.ts", `${text}\nframe.setAttribute("sandbox", "");`),
    ).toBe(false);
  });

  it("finds frames written as markup strings in any source file", () => {
    expect(
      unsandboxed(
        "frames.ts",
        `host.innerHTML = '<iframe src="https://a.example"></iframe>';`,
      ),
    ).toBe(true);
    expect(
      unsandboxed(
        "frames.ts",
        'host.insertAdjacentHTML("beforeend", `<IFRAME\n src=${url}>`);',
      ),
    ).toBe(true);
    expect(
      unsandboxed(
        "frames.ts",
        `host.innerHTML = '<iframe sandbox src="https://a.example">';`,
      ),
    ).toBe(false);
  });

  it("renders mail without scripts in its frame", () => {
    const frames = sandbox_tokens(
      "src/components/email/sandboxed_email_renderer/renderer.tsx",
    );

    expect(frames.length).toBe(1);
    expect(frames[0]).toContain("allow-same-origin");
    expect(frames[0]).not.toContain("allow-scripts");
    expect(frames[0]).not.toContain("allow-popups-to-escape-sandbox");
    expect(frames[0]).not.toContain("allow-top-navigation");
  });

  it("gives the secure view frame an opaque origin", () => {
    const frames = sandbox_tokens("src/pages/secure_view.tsx");

    expect(frames.length).toBe(1);
    expect(frames[0]).toContain("allow-scripts");
    expect(frames[0]).not.toContain("allow-same-origin");
    expect(frames[0]).not.toContain("allow-top-navigation");
  });
});
