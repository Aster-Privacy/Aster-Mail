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
import { describe, it, expect, vi, beforeEach } from "vitest";

const env = vi.hoisted(() => ({
  native: true,
  platform: "android",
  set_secure: vi.fn(),
}));

vi.mock("@capacitor/core", () => ({
  registerPlugin: () => ({ setSecure: env.set_secure }),
}));

vi.mock("./capacitor_bridge", () => ({
  is_native_platform: () => env.native,
  get_platform: () => env.platform,
}));

const { set_screen_capture_blocked } = await import("./screen_privacy");

describe("screen capture blocking", () => {
  beforeEach(() => {
    env.native = true;
    env.platform = "android";
    env.set_secure.mockReset();
    env.set_secure.mockImplementation(async ({ enabled }) => ({ enabled }));
  });

  it("turns the secure flag on and off on Android", async () => {
    expect(await set_screen_capture_blocked(true)).toBe(true);
    expect(await set_screen_capture_blocked(false)).toBe(true);
    expect(env.set_secure.mock.calls).toEqual([
      [{ enabled: true }],
      [{ enabled: false }],
    ]);
  });

  it("does nothing in a browser", async () => {
    env.native = false;

    expect(await set_screen_capture_blocked(true)).toBe(false);
    expect(env.set_secure).not.toHaveBeenCalled();
  });

  it("does nothing on other native platforms", async () => {
    env.platform = "ios";

    expect(await set_screen_capture_blocked(true)).toBe(false);
    expect(env.set_secure).not.toHaveBeenCalled();
  });

  it("reports failure when the plugin rejects", async () => {
    env.set_secure.mockRejectedValue(new Error("unimplemented"));

    expect(await set_screen_capture_blocked(true)).toBe(false);
  });
});
