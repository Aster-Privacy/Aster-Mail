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
import { describe, expect, it } from "vitest";

import { guard_device_label } from "@/services/guard/guard_device_label";

const WIN_CHROME =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36";
const MAC_SAFARI =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
const LINUX_FIREFOX =
  "Mozilla/5.0 (X11; Linux x86_64; rv:132.0) Gecko/20100101 Firefox/132.0";
const ANDROID_CHROME =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36";

describe("guard_device_label", () => {
  it("names the browser and system", () => {
    expect(guard_device_label(WIN_CHROME, false)).toBe("Chrome · Windows");
    expect(guard_device_label(MAC_SAFARI, false)).toBe("Safari · macOS");
    expect(guard_device_label(LINUX_FIREFOX, false)).toBe("Firefox · Linux");
    expect(guard_device_label(ANDROID_CHROME, false)).toBe("Chrome · Android");
  });

  it("names the desktop app with its system", () => {
    expect(guard_device_label(WIN_CHROME, true)).toBe(
      "Aster Mail desktop · Windows",
    );
    expect(guard_device_label(LINUX_FIREFOX, true)).toBe(
      "Aster Mail desktop · Linux",
    );
  });

  it("stays short enough for the server limit", () => {
    for (const ua of [WIN_CHROME, MAC_SAFARI, LINUX_FIREFOX, ""]) {
      expect(guard_device_label(ua, true).length).toBeLessThanOrEqual(64);
      expect(guard_device_label(ua, false).length).toBeLessThanOrEqual(64);
    }
    expect(guard_device_label("", false)).toBe("Browser");
  });
});
