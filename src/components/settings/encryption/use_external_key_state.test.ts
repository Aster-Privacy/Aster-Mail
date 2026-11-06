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
import { describe, expect, it, vi } from "vitest";

vi.mock("@/services/crypto/external_pgp_key", () => ({
  get_external_key_state: () => ({}),
  subscribe_external_key: () => () => undefined,
}));

import { external_key_device_label_key } from "./use_external_key_state";
import { en } from "@/lib/i18n/translations/en";

describe("external_key_device_label_key", () => {
  it("names each known client platform", () => {
    expect(external_key_device_label_key("android")).toBe(
      "settings.external_key_device_android",
    );
    expect(external_key_device_label_key("iOS")).toBe(
      "settings.external_key_device_ios",
    );
    expect(external_key_device_label_key("desktop")).toBe(
      "settings.external_key_device_desktop",
    );
    expect(external_key_device_label_key(" web ")).toBe(
      "settings.external_key_device_web",
    );
    expect(external_key_device_label_key("bridge")).toBe(
      "settings.external_key_device_bridge",
    );
  });

  it("falls back to other device for unknown or missing platforms", () => {
    expect(external_key_device_label_key("toaster")).toBe(
      "settings.external_key_device_other",
    );
    expect(external_key_device_label_key("")).toBe(
      "settings.external_key_device_other",
    );
    expect(external_key_device_label_key(null)).toBe(
      "settings.external_key_device_other",
    );
  });

  it("maps every platform to a defined English string", () => {
    const settings = en.settings as Record<string, string>;

    for (const platform of ["android", "ios", "desktop", "web", "bridge", "x"]) {
      const key = external_key_device_label_key(platform).replace(
        "settings.",
        "",
      );

      expect(settings[key]).toBeTruthy();
    }
  });
});
