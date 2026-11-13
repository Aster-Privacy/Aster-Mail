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
import { describe, it, expect, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => ({
  config: null as unknown,
  unlocked: false,
}));

vi.mock("./app_lock_store", () => ({
  get_app_lock_config: () => h.config,
  is_server_wrapped_config: (config: { wrap?: { device_lock_id?: string } } | null) =>
    !!config?.wrap?.device_lock_id,
}));

vi.mock("./app_lock_wrap", () => ({
  get_unlocked_key: () => (h.unlocked ? ({} as CryptoKey) : null),
}));

import { kept_app_lock_field } from "./app_lock_password_change";

const LOCK_ID = "8a1f3c4e-2b6d-4e7a-9c1d-5f0e2a3b4c5d";

describe("keeping this device's app lock through a password change", () => {
  beforeEach(() => {
    h.config = { enabled: true, wrap: { device_lock_id: LOCK_ID, salt: "c2FsdA==" } };
    h.unlocked = true;
  });

  it("names this device's lock when the PIN key is unlocked", () => {
    expect(kept_app_lock_field("acct")).toEqual({ keep_device_lock_id: LOCK_ID });
  });

  it("names no lock when the PIN key is not in memory", () => {
    h.unlocked = false;

    expect(kept_app_lock_field("acct")).toEqual({});
  });

  it("names no lock when the device has no server-wrapped app lock", () => {
    h.config = null;

    expect(kept_app_lock_field("acct")).toEqual({});
  });
});
