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
    const sources = [
      "index.html",
      "bridge.html",
      "vite.config.ts",
      ...list_files(join(root, "src"))
        .filter((f) => /\.(tsx?|css|html|json)$/.test(f))
        .filter((f) => !/\.test\.tsx?$/.test(f))
        .map((f) => `src/${f}`),
    ].map(read);

    expect(web_only_files().length).toBeGreaterThan(0);

    for (const file of web_only_files()) {
      expect(
        sources.filter((text) => text.includes(file)),
        file,
      ).toHaveLength(0);
    }
  });
});
