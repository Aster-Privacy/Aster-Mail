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
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, sep } from "node:path";

import { afterEach, describe, it, expect } from "vitest";

const root = process.cwd();
const script = join(root, "scripts", "prepare_native_dist.mjs");

function read(name: string): string {
  return readFileSync(join(root, name), "utf8").replace(/\r\n/g, "\n");
}

function list_files(dir: string, base = dir): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) =>
      entry.isDirectory()
        ? list_files(join(dir, entry.name), base)
        : [relative(base, join(dir, entry.name)).split(sep).join("/")],
    )
    .sort();
}

const GENERATED_DIRS = new Set([
  "node_modules",
  "target",
  "build",
  "gen",
  ".gradle",
  "Pods",
  "DerivedData",
  "public",
  "bergamot",
  "fonts",
]);
const TEXT_FILE =
  /(\.(tsx?|jsx?|mjs|cjs|css|html|json|webmanifest|xml|gradle|kts|java|kt|plist|swift|m|h|storyboard|xib|pbxproj|xcconfig|strings|properties|rs|toml|nsh|txt)|^_headers)$/;

function list_text_files(name: string): string[] {
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      if (entry.isDirectory()) {
        return GENERATED_DIRS.has(entry.name)
          ? []
          : walk(join(dir, entry.name));
      }

      return TEXT_FILE.test(entry.name)
        ? [relative(root, join(dir, entry.name)).split(sep).join("/")]
        : [];
    });

  return existsSync(join(root, name)) ? walk(join(root, name)).sort() : [];
}

function web_only_files(): string[] {
  const list = read("scripts/prepare_native_dist.mjs").match(
    /WEB_ONLY_FILES = \[([^\]]*)\]/,
  );

  expect(list).not.toBeNull();

  return [...list![1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

let work_dir = "";

afterEach(() => {
  if (work_dir) rmSync(work_dir, { recursive: true, force: true });
  work_dir = "";
});

describe("native packages ship a slim copy of the web build", () => {
  it("points tauri and capacitor at the prepared native directory", () => {
    const tauri = JSON.parse(read("src-tauri/tauri.conf.json"));
    const pkg = JSON.parse(read("package.json"));

    expect(tauri.build.frontendDist).toBe("../dist-native");
    expect(tauri.build.beforeBuildCommand).toMatch(
      /vite build && node scripts\/prepare_native_dist\.mjs$/,
    );
    expect(read("capacitor.config.ts")).toMatch(/webDir:\s*"dist-native"/);
    expect(pkg.scripts["build:mobile"]).toMatch(
      /node scripts\/prepare_native_dist\.mjs && npx cap sync$/,
    );
    expect(pkg.scripts["build:android"]).toMatch(
      /node scripts\/prepare_native_dist\.mjs && npx cap sync android$/,
    );
    expect(pkg.scripts["capacitor:copy:before"]).toBe(
      "node scripts/prepare_native_dist.mjs",
    );
  });

  it("prepares the native directory before every capacitor command that reads it", () => {
    const pkg = JSON.parse(read("package.json"));
    const reads_web_dir = Object.entries<string>(pkg.scripts).filter(
      ([, command]) => /\bcap (sync|copy|run|build)\b/.test(command),
    );

    expect(reads_web_dir.map(([name]) => name)).toEqual(
      expect.arrayContaining(["cap:sync", "cap:android", "android"]),
    );

    for (const [name, command] of reads_web_dir) {
      expect(command, name).toMatch(
        /node scripts\/prepare_native_dist\.mjs && npx cap (sync|copy|run|build)\b/,
      );
    }
  });

  it("keeps the native directory out of version control", () => {
    expect(read(".gitignore").split(/\r?\n/)).toContain("dist-native");
  });

  it("copies the build without source maps or web-only images", () => {
    work_dir = mkdtempSync(join(tmpdir(), "native-dist-"));
    const source = join(work_dir, "dist");
    const target = join(work_dir, "dist-native");
    const files = [
      "index.html",
      "bridge.html",
      "sw.js",
      "sw.js.map",
      "assets/index-abc.js",
      "assets/index-abc.js.map",
      "assets/index-abc.css",
      "assets/index-abc.css.map",
      "bergamot/worker.js",
      "bergamot/worker.js.map",
      "logo.png",
      "providers/profile.png",
      ...web_only_files(),
    ];

    for (const file of files) {
      mkdirSync(dirname(join(source, file)), { recursive: true });
      writeFileSync(join(source, file), file);
    }
    mkdirSync(target);
    writeFileSync(join(target, "stale.js"), "stale");

    execFileSync(process.execPath, [script, source, target], {
      stdio: "pipe",
    });

    const shipped = list_files(target);

    expect(shipped.filter((f) => f.endsWith(".map"))).toHaveLength(0);
    expect(shipped.filter((f) => web_only_files().includes(f))).toHaveLength(0);
    expect(shipped).toEqual([
      "assets/index-abc.css",
      "assets/index-abc.js",
      "bergamot/worker.js",
      "bridge.html",
      "index.html",
      "logo.png",
      "providers/profile.png",
      "sw.js",
    ]);
    expect(list_files(source)).toHaveLength(files.length);
  });

  it("refuses to run before the web build exists", () => {
    work_dir = mkdtempSync(join(tmpdir(), "native-dist-"));

    expect(() =>
      execFileSync(
        process.execPath,
        [script, join(work_dir, "dist"), join(work_dir, "dist-native")],
        { stdio: "pipe" },
      ),
    ).toThrow();
  });

  it("only leaves out files the app never references", () => {
    const names = [
      "index.html",
      "bridge.html",
      "vite.config.ts",
      "capacitor.config.ts",
      ...list_text_files("src").filter((f) => !/\.test\.tsx?$/.test(f)),
      ...list_text_files("public"),
      ...list_text_files("src-tauri"),
      ...list_text_files("android"),
      ...list_text_files("ios"),
    ];
    const sources = names.map((name) => ({ name, text: read(name) }));

    expect(web_only_files().length).toBeGreaterThan(0);
    expect(names).toEqual(
      expect.arrayContaining([
        "public/desktop_ready.js",
        "src-tauri/tauri.conf.json",
        "src-tauri/src/main.rs",
        "android/app/src/main/AndroidManifest.xml",
      ]),
    );

    for (const file of web_only_files()) {
      expect(
        sources
          .filter(({ text }) => text.includes(file))
          .map(({ name }) => name),
        file,
      ).toEqual([]);
    }
  });
});
