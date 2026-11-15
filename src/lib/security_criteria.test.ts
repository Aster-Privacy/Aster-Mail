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
import type { GuardStatus } from "@/services/api/guard";

import { describe, it, expect } from "vitest";

import {
  build_security_criteria,
  guard_criterion_met,
  guard_protection_state,
  second_factor_method,
  security_percent,
  SECURITY_CRITERION_IDS,
  type SecurityCriterionSource,
} from "./security_criteria";
import { SETTINGS_ANCHORS } from "./settings_links";

import { GUARD_SWITCH } from "@/services/api/guard";

const none: SecurityCriterionSource = {
  totp_enabled: false,
  passkey_registered: false,
  recovery_codes_saved: false,
  recovery_email_verified: false,
  login_alerts_enabled: false,
  block_tracking_pixels: false,
  block_remote_images: false,
  strip_exif_on_compose: false,
};

const all: SecurityCriterionSource = {
  totp_enabled: true,
  passkey_registered: true,
  recovery_codes_saved: true,
  recovery_email_verified: true,
  login_alerts_enabled: true,
  block_tracking_pixels: true,
  block_remote_images: true,
  strip_exif_on_compose: true,
};

describe("security criteria", () => {
  it("scores an unprotected account at zero", () => {
    expect(security_percent(build_security_criteria(none))).toBe(0);
  });

  it("scores a fully protected account at one hundred", () => {
    expect(security_percent(build_security_criteria(all))).toBe(100);
  });

  it("rounds a partial score", () => {
    const criteria = build_security_criteria({ ...none, totp_enabled: true });

    expect(security_percent(criteria)).toBe(13);
  });

  it("routes the recovery email criterion to its account row", () => {
    const criteria = build_security_criteria(none);
    const recovery = criteria.find((item) => item.id === "recovery_email");

    expect(recovery?.target).toEqual({
      section: "account",
      anchor: SETTINGS_ANCHORS.recovery_email,
    });
  });

  it("routes the recovery codes criterion to the security row", () => {
    const criteria = build_security_criteria(none);
    const codes = criteria.find((item) => item.id === "recovery_codes");

    expect(codes?.target).toEqual({
      section: "security",
      anchor: SETTINGS_ANCHORS.account_recovery,
    });
  });

  it("gives every criterion an anchor to scroll to", () => {
    const criteria = build_security_criteria(none);

    expect(
      criteria.filter((item) => item.target.section === "security"),
    ).toHaveLength(7);
    expect(criteria.every((item) => Boolean(item.target.anchor))).toBe(true);
  });

  it("builds criteria in the shared order", () => {
    expect(build_security_criteria(none).map((item) => item.id)).toEqual(
      SECURITY_CRITERION_IDS,
    );
  });

  it("marks only the enabled criteria as met", () => {
    const criteria = build_security_criteria({
      ...none,
      passkey_registered: true,
      block_remote_images: true,
    });
    const met = criteria.filter((item) => item.met).map((item) => item.id);

    expect(met).toEqual(["two_factor", "passkey", "remote_images"]);
  });

  it("counts a registered security key as the second factor", () => {
    const criteria = build_security_criteria({
      ...none,
      passkey_registered: true,
    });
    const two_factor = criteria.find((item) => item.id === "two_factor");

    expect(two_factor?.met).toBe(true);
    expect(security_percent(criteria)).toBe(25);
  });

  it("reaches one hundred with a security key and no authenticator app", () => {
    expect(
      security_percent(
        build_security_criteria({ ...all, totp_enabled: false }),
      ),
    ).toBe(100);
  });

  it("counts the second factor once when both methods are set up", () => {
    const key_only = build_security_criteria({
      ...none,
      passkey_registered: true,
    });
    const both = build_security_criteria({
      ...none,
      passkey_registered: true,
      totp_enabled: true,
    });

    expect(both.filter((item) => item.met)).toHaveLength(2);
    expect(security_percent(both)).toBe(security_percent(key_only));
    expect(security_percent(build_security_criteria(all))).toBe(100);
  });

  it("drops the second factor when the last security key is removed", () => {
    const criteria = build_security_criteria({
      ...all,
      totp_enabled: false,
      passkey_registered: false,
    });
    const unmet = criteria.filter((item) => !item.met).map((item) => item.id);

    expect(unmet).toEqual(["two_factor", "passkey"]);
    expect(security_percent(criteria)).toBe(75);
  });

  it("keeps recovery codes as a separate criterion from the second factor", () => {
    const criteria = build_security_criteria({
      ...none,
      passkey_registered: true,
    });

    expect(criteria.find((item) => item.id === "recovery_codes")?.met).toBe(
      false,
    );
  });

  it("returns zero for an empty criteria list", () => {
    expect(security_percent([])).toBe(0);
  });
});

describe("second factor method", () => {
  it.each([
    [false, false, "none"],
    [true, false, "authenticator"],
    [false, true, "security_key"],
    [true, true, "both"],
  ] as const)(
    "reports totp %s and key %s as %s",
    (totp_enabled, passkey_registered, expected) => {
      expect(second_factor_method({ totp_enabled, passkey_registered })).toBe(
        expected,
      );
    },
  );
});

describe("guard criterion", () => {
  const ID = "7c9e6679-7425-40de-944b-e07fc1f90ae7";

  function status(switches: number, held_off = false): GuardStatus {
    return {
      switches,
      hold_scopes: 0,
      version: 1,
      enrolled_at: "2026-11-01T10:00:00Z",
      recovery_wait_effective: false,
      paused_until: null,
      has_rescue_code: true,
      this_device: null,
      devices: [],
      pending_changes: held_off
        ? [
            {
              id: ID,
              kind: "guard_switches_off",
              apply_after: "2026-11-18T10:00:00Z",
              created_at: "2026-11-15T10:00:00Z",
            },
          ]
        : [],
    };
  }

  it("leaves the score as before when the server has no guard", () => {
    const criteria = build_security_criteria({ ...none, totp_enabled: true });

    expect(criteria.map((item) => item.id)).toEqual(SECURITY_CRITERION_IDS);
    expect(security_percent(criteria)).toBe(13);
  });

  it("adds guard last with the same weight as the second factor", () => {
    const guard_on = build_security_criteria({ ...none, guard_enabled: true });
    const two_factor_on = build_security_criteria({
      ...none,
      totp_enabled: true,
      guard_enabled: false,
    });

    expect(guard_on.map((item) => item.id)).toEqual([
      ...SECURITY_CRITERION_IDS,
      "guard_enabled",
    ]);
    expect(guard_on.at(-1)?.met).toBe(true);
    expect(security_percent(guard_on)).toBe(11);
    expect(security_percent(guard_on)).toBe(security_percent(two_factor_on));
    expect(
      security_percent(build_security_criteria({ ...all, guard_enabled: false })),
    ).toBe(89);
    expect(
      security_percent(build_security_criteria({ ...all, guard_enabled: true })),
    ).toBe(100);
  });

  it("routes guard to its settings section", () => {
    const guard = build_security_criteria({ ...none, guard_enabled: false }).find(
      (item) => item.id === "guard_enabled",
    );

    expect(guard?.target).toEqual({
      section: "security",
      anchor: SETTINGS_ANCHORS.guard,
    });
    expect(guard?.label_key).toBe("guard.criterion_guard");
  });

  it("is met only when new device approval is on", () => {
    expect(guard_protection_state(null)).toBeNull();
    expect(guard_protection_state(status(0))).toBe("off");
    expect(guard_protection_state(status(GUARD_SWITCH.hold_changes))).toBe(
      "off",
    );
    expect(
      guard_protection_state(status(GUARD_SWITCH.new_device_approval)),
    ).toBe("on");
    expect(guard_criterion_met(null)).toBeNull();
    expect(guard_criterion_met("off")).toBe(false);
    expect(guard_criterion_met("on")).toBe(true);
  });

  it("counts a held switch-off as on until it applies", () => {
    const state = guard_protection_state(
      status(
        GUARD_SWITCH.new_device_approval | GUARD_SWITCH.hold_changes,
        true,
      ),
    );

    expect(state).toBe("held_off");
    expect(guard_criterion_met(state)).toBe(true);
    expect(
      security_percent(
        build_security_criteria({
          ...none,
          guard_enabled: guard_criterion_met(state),
        }),
      ),
    ).toBe(11);
  });
});
