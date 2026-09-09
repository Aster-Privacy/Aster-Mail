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
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => false },
}));

const { compute_is_mobile_experience } = await import(
  "./use_mobile_experience"
);

describe("compute_is_mobile_experience", () => {
  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
    vi.restoreAllMocks();
    window.history.replaceState({}, "", "/");
  });

  it("never picks the mobile shell inside the desktop app", () => {
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
    window.history.replaceState({}, "", "/?mobile=true");
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Mobile Android");
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 400,
    });

    expect(compute_is_mobile_experience()).toBe(false);
  });

  it("honors the explicit override on the web", () => {
    window.history.replaceState({}, "", "/?mobile=true");

    expect(compute_is_mobile_experience()).toBe(true);
  });
});
