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

const show_plan_limit_upgrade = vi.fn();

vi.mock("@/stores/upgrade_store", () => ({
  show_plan_limit_upgrade: (...args: unknown[]) =>
    show_plan_limit_upgrade(...args),
}));

const {
  find_locked_expiry_feature,
  prompt_expiry_upgrade,
  EXPIRATION_FEATURE,
  PASSWORD_FEATURE,
} = await import("@/components/compose/expiry_plan_gate");

function locked_set(...keys: string[]) {
  return (feature_key: string) => keys.includes(feature_key);
}

const expiry = new Date("2030-01-01T00:00:00Z");

describe("find_locked_expiry_feature", () => {
  it("reports expiration when a free plan sets an expiry", () => {
    expect(
      find_locked_expiry_feature({
        expires_at: expiry,
        limits_loaded: true,
        is_feature_locked: locked_set(EXPIRATION_FEATURE, PASSWORD_FEATURE),
      }),
    ).toBe(EXPIRATION_FEATURE);
  });

  it("reports the password when only password protection is locked", () => {
    expect(
      find_locked_expiry_feature({
        expires_at: expiry,
        expiry_password: "hunter22",
        limits_loaded: true,
        is_feature_locked: locked_set(PASSWORD_FEATURE),
      }),
    ).toBe(PASSWORD_FEATURE);
  });

  it("allows a plan that includes both features", () => {
    expect(
      find_locked_expiry_feature({
        expires_at: expiry,
        expiry_password: "hunter22",
        limits_loaded: true,
        is_feature_locked: locked_set(),
      }),
    ).toBeNull();
  });

  it("allows a message with no expiry or password on a locked plan", () => {
    expect(
      find_locked_expiry_feature({
        expires_at: null,
        expiry_password: null,
        limits_loaded: true,
        is_feature_locked: locked_set(EXPIRATION_FEATURE, PASSWORD_FEATURE),
      }),
    ).toBeNull();
  });

  it("does not block before the plan limits load", () => {
    expect(
      find_locked_expiry_feature({
        expires_at: expiry,
        expiry_password: "hunter22",
        limits_loaded: false,
        is_feature_locked: locked_set(EXPIRATION_FEATURE, PASSWORD_FEATURE),
      }),
    ).toBeNull();
  });
});

describe("prompt_expiry_upgrade", () => {
  beforeEach(() => {
    show_plan_limit_upgrade.mockClear();
  });

  it("opens the upgrade prompt for the locked feature", () => {
    prompt_expiry_upgrade(EXPIRATION_FEATURE, "upgrade needed");

    expect(show_plan_limit_upgrade).toHaveBeenCalledWith({
      message: "upgrade needed",
      resource: null,
      feature: EXPIRATION_FEATURE,
    });
  });
});
