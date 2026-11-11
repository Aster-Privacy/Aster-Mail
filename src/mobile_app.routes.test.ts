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
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const PUBLIC_PATHS = [
  "/sign-in",
  "/register",
  "/signup",
  "/invite/:code",
  "/forgot-password",
  "/reset-password",
  "/verify-recovery-email",
  "/terms",
  "/privacy",
  "/link-device",
  "/join/family",
  "/family/claim/:token",
  "/view/:token",
];

function route_paths(file: string): Set<string> {
  const source = readFileSync(resolve(__dirname, file), "utf-8");

  return new Set(
    Array.from(source.matchAll(/path="([^"]+)"/g), (match) => match[1]),
  );
}

describe("mobile and desktop route parity", () => {
  const desktop = route_paths("App.tsx");
  const mobile = route_paths("mobile_app.tsx");

  it.each(PUBLIC_PATHS)("both apps route %s", (path) => {
    expect(desktop.has(path)).toBe(true);
    expect(mobile.has(path)).toBe(true);
  });
});
