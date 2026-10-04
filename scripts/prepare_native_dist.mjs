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
import { cpSync, existsSync, rmSync } from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const WEB_ONLY_FILES = [
  "aster.webp",
  "profile.png",
  "text_logo_white.png",
  "welcome_encrypted.png",
  "welcome_import.png",
  "welcome_opensource.png",
  "welcome_quantum.png",
];

const source = resolve(root, process.argv[2] ?? "dist");
const target = resolve(root, process.argv[3] ?? "dist-native");

if (!existsSync(resolve(source, "index.html"))) {
  console.error(
    `native dist: ${join(source, "index.html")} is missing. Run: npx vite build`,
  );
  process.exit(1);
}

if (target === source || target === root) {
  console.error(`native dist: refusing to replace ${target}`);
  process.exit(1);
}

let skipped = 0;

rmSync(target, { recursive: true, force: true });
cpSync(source, target, {
  recursive: true,
  filter(path) {
    const name = relative(source, path).split(sep).join("/");
    const ship = !path.endsWith(".map") && !WEB_ONLY_FILES.includes(name);

    if (!ship) skipped += 1;

    return ship;
  },
});

console.log(
  `native dist: copied ${basename(source)} to ${basename(target)} without ${skipped} source maps and web-only files`,
);
