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
import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => false },
}));

vi.mock("@/services/lockdown_store", () => ({
  is_any_lockdown_active: () => false,
}));

vi.mock("@/services/routing/connection_store", () => ({
  connection_store: { get_method: () => "direct" },
}));

vi.mock("@/lib/icon_cache", () => ({
  is_icon_failed: () => false,
}));

const { get_favicon_url, PENDING_FAVICON_SRC } = await import(
  "./favicon_url"
);
const { build_merged_preferences, DEFAULT_PREFERENCES } = await import(
  "@/services/api/preferences"
);

async function logo_switch() {
  return import("@/services/sender_logos_state");
}

afterEach(async () => {
  try {
    (await logo_switch()).set_sender_logos_enabled(false);
  } catch {
    return;
  }
});

describe("company logos", () => {
  it("requests no logo from the server before settings load", () => {
    expect(get_favicon_url("shop.example")).toBe(PENDING_FAVICON_SRC);
  });

  it("shows logos for an account whose saved settings predate the switch", () => {
    const saved: Record<string, unknown> = { ...DEFAULT_PREFERENCES };

    delete saved.hide_sender_logos;

    expect(build_merged_preferences(saved, null).hide_sender_logos).toBe(
      false,
    );
  });

  it("keeps logos hidden for an account that turned them off", () => {
    const saved: Record<string, unknown> = {
      ...DEFAULT_PREFERENCES,
      hide_sender_logos: true,
    };

    expect(build_merged_preferences(saved, null).hide_sender_logos).toBe(true);
  });

  it("requests the logo once settings turn logos on", async () => {
    (await logo_switch()).set_sender_logos_enabled(true);

    expect(get_favicon_url("shop.example")).toBe(
      "/api/images/v1/favicon/shop.example",
    );
  });
});
