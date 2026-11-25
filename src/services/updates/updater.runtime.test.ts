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
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { is_desktop_runtime } from "./updater";

type RuntimeGlobals = Record<string, unknown>;

const FLAG_NAMES = [
  "__TAURI_INTERNALS__",
  "__ASTER_FLATPAK__",
  "__ASTER_UPDATES_MANAGED__",
];

function globals(): RuntimeGlobals {
  return window as unknown as RuntimeGlobals;
}

function clear_flags(): void {
  for (const name of FLAG_NAMES) {
    delete globals()[name];
  }
}

describe("is_desktop_runtime", () => {
  beforeEach(() => {
    clear_flags();
  });

  afterEach(() => {
    clear_flags();
  });

  it("is false outside the desktop app", () => {
    expect(is_desktop_runtime()).toBe(false);
  });

  it("is true in the desktop app", () => {
    globals().__TAURI_INTERNALS__ = {};

    expect(is_desktop_runtime()).toBe(true);
  });

  it("is false when Flatpak manages updates", () => {
    globals().__TAURI_INTERNALS__ = {};
    globals().__ASTER_FLATPAK__ = true;

    expect(is_desktop_runtime()).toBe(false);
  });

  it("is false when a package manager manages updates", () => {
    globals().__TAURI_INTERNALS__ = {};
    globals().__ASTER_UPDATES_MANAGED__ = true;

    expect(is_desktop_runtime()).toBe(false);
  });
});
