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
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, it, expect } from "vitest";

const root = process.cwd();
const shell = new DOMParser().parseFromString(
  readFileSync(join(root, "index.html"), "utf8"),
  "text/html",
);
const MAX_SPLASH_LOGO_BYTES = 16 * 1024;

function candidates(srcset: string | null): string[] {
  return (srcset ?? "")
    .split(",")
    .map((candidate) => candidate.trim().split(/\s+/)[0])
    .filter(Boolean);
}

function bytes(url: string): number {
  return statSync(join(root, "public", url)).size;
}

const logo = shell.querySelector("#initial-loader-content img");
const preload = shell.querySelector('link[rel="preload"][as="image"]');

describe("splash logo", () => {
  it("downloads a logo sized for the splash at every pixel density", () => {
    const urls = [
      logo?.getAttribute("src") ?? "",
      ...candidates(logo?.getAttribute("srcset") ?? null),
    ];
    const oversized = urls.filter((url) => bytes(url) > MAX_SPLASH_LOGO_BYTES);

    expect(oversized).toEqual([]);
  });

  it("preloads the same images the splash renders", () => {
    const preloaded = preload?.getAttribute("imagesrcset")
      ? candidates(preload.getAttribute("imagesrcset"))
      : [preload?.getAttribute("href") ?? ""];

    expect(preloaded).toEqual(candidates(logo?.getAttribute("srcset") ?? null));
    expect(
      preloaded.filter((url) => bytes(url) > MAX_SPLASH_LOGO_BYTES),
    ).toEqual([]);
  });
});
