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

import {
  guard_error_message,
  guard_error_text,
  guard_error_text_or_null,
  guard_retry_at,
  step_up_rejection,
} from "@/components/guard/guard_error_text";

const NOW = Date.parse("2026-11-20T10:00:00Z");
const t = (key: string, params?: Record<string, string | number>) =>
  params ? `${key}:${Object.values(params).join(",")}` : key;

describe("guard_error_message", () => {
  it("names the time a pause ends", () => {
    const message = guard_error_message(
      { server_code: "GUARD_PAUSED", status: 429, retry_after_secs: 900 },
      NOW,
    );

    expect(message?.key).toBe("guard.error_paused");
    expect(message?.params?.time).toBeTruthy();
  });

  it("says soon when a pause is short or has no time", () => {
    expect(
      guard_error_message(
        { server_code: "GUARD_PAUSED", retry_after_secs: 30 },
        NOW,
      )?.key,
    ).toBe("guard.error_paused_soon");
    expect(guard_error_message({ server_code: "GUARD_PAUSED" }, NOW)?.key).toBe(
      "guard.error_paused_soon",
    );
  });

  it("treats a bare 429 as too many requests", () => {
    expect(
      guard_error_message({ status: 429, retry_after_secs: 600 }, NOW)?.key,
    ).toBe("guard.error_too_many");
  });

  it("explains a held change with its apply time", () => {
    const message = guard_error_message(
      {
        server_code: "GUARD_HELD",
        held: { apply_after: "2026-11-21T10:00:00Z" },
      },
      NOW,
    );

    expect(message?.key).toBe("guard.error_held");
    expect(guard_error_message({ server_code: "GUARD_HELD" }, NOW)?.key).toBe(
      "guard.error_held_soon",
    );
  });

  it("explains a pending device with its activation time", () => {
    expect(
      guard_error_message(
        {
          server_code: "GUARD_DEVICE_PENDING",
          details: { activates_at: "2026-11-20T10:10:00Z" },
        },
        NOW,
      )?.key,
    ).toBe("guard.error_device_pending");
    expect(
      guard_error_message({ server_code: "GUARD_DEVICE_PENDING" }, NOW)?.key,
    ).toBe("guard.error_device_pending_soon");
  });

  it("maps fixed codes", () => {
    expect(guard_error_message({ server_code: "GUARD_LAST_DEVICE" })?.key).toBe(
      "guard.error_last_device",
    );
    expect(
      guard_error_message({ server_code: "GUARD_ENVELOPE_UNSUPPORTED" })?.key,
    ).toBe("guard.error_device_keys");
    expect(guard_error_message({ status: 426 })?.key).toBe(
      "guard.error_upgrade",
    );
    expect(guard_error_message({ status: 410 })?.key).toBe(
      "guard.error_request_gone",
    );
  });

  it("reports offline for network failures", () => {
    expect(guard_error_message({ code: "NETWORK_ERROR" })?.key).toBe(
      "guard.error_offline",
    );
    expect(guard_error_message({ code: "TIMEOUT_ERROR" })?.key).toBe(
      "guard.error_offline",
    );
  });

  it("returns null for unknown failures", () => {
    expect(guard_error_message(null)).toBeNull();
    expect(guard_error_message({ status: 500 })).toBeNull();
  });
});

describe("guard_error_text", () => {
  it("falls back when nothing matches", () => {
    expect(
      guard_error_text(t as never, { status: 500 }, "guard.held_error"),
    ).toBe("guard.held_error");
    expect(guard_error_text_or_null(t as never, { status: 500 })).toBeNull();
  });

  it("leaves errors without a Guard code to the caller", () => {
    expect(guard_error_text_or_null(t as never, { status: 429 })).toBeNull();
    expect(
      guard_error_text_or_null(t as never, { code: "TIMEOUT_ERROR" }),
    ).toBeNull();
    expect(
      guard_error_text_or_null(t as never, {
        server_code: "GUARD_LAST_DEVICE",
      }),
    ).not.toBeNull();
  });

  it("explains that setup needs a second device", () => {
    expect(
      guard_error_text_or_null(t as never, {
        server_code: "GUARD_BACKUP_DEVICE_REQUIRED",
      }),
    ).toBe("guard.error_backup_device_required");
  });

  it("fills the time parameter", () => {
    expect(
      guard_error_text(
        t as never,
        { server_code: "GUARD_PAUSED", retry_after_secs: 900 },
        "guard.held_error",
        NOW,
      ),
    ).toMatch(/^guard\.error_paused:.+/);
  });
});

describe("guard_retry_at", () => {
  it("adds the wait to now", () => {
    expect(guard_retry_at(60, NOW)).toBe("2026-11-20T10:01:00.000Z");
    expect(guard_retry_at(undefined, NOW)).toBeNull();
    expect(guard_retry_at(0, NOW)).toBeNull();
  });
});

describe("step_up_rejection", () => {
  it("points a wrong password at the password field", () => {
    const rejection = step_up_rejection(
      {
        server_code: "INVALID_CREDENTIALS",
        status: 401,
        details: { failed_factor: "password", attempts_remaining: 8 },
      },
      NOW,
    );

    expect(rejection).toEqual({
      field: "password",
      message: { key: "guard.step_up_password_wrong" },
    });
  });

  it("explains the current password while a password change is held", () => {
    expect(
      step_up_rejection(
        {
          server_code: "INVALID_CREDENTIALS",
          details: { failed_factor: "password", password_change_held: true },
        },
        NOW,
      )?.message.key,
    ).toBe("guard.step_up_password_wrong_held");
  });

  it("points a wrong authenticator code at the code field", () => {
    expect(
      step_up_rejection(
        {
          server_code: "INVALID_TWO_FACTOR_CODE",
          status: 400,
          details: { failed_factor: "totp", attempts_remaining: 9 },
        },
        NOW,
      ),
    ).toEqual({ field: "code", message: { key: "guard.step_up_code_wrong" } });
    expect(step_up_rejection({ server_code: "TOTP_REQUIRED" }, NOW)).toEqual({
      field: "code",
      message: { key: "guard.step_up_code_required" },
    });
  });

  it("points a failed security key at the key", () => {
    expect(
      step_up_rejection(
        {
          server_code: "INVALID_CREDENTIALS",
          details: { failed_factor: "security_key" },
        },
        NOW,
      )?.field,
    ).toBe("key");
  });

  it("warns when few attempts are left before the lock", () => {
    const rejection = step_up_rejection(
      {
        server_code: "INVALID_TWO_FACTOR_CODE",
        details: { failed_factor: "totp", attempts_remaining: 2 },
      },
      NOW,
    );

    expect(rejection?.message.extra).toEqual({
      key: "guard.step_up_attempts_left",
      params: { count: 2 },
    });
    expect(
      guard_error_text(
        t as never,
        {
          server_code: "INVALID_CREDENTIALS",
          details: { failed_factor: "password", attempts_remaining: 1 },
        },
        "guard.held_error",
        NOW,
      ),
    ).toBe("guard.step_up_password_wrong guard.step_up_attempts_left:1");
  });

  it("names the time a lock ends", () => {
    const rejection = step_up_rejection(
      {
        server_code: "ACCOUNT_LOCKED",
        status: 403,
        details: { attempts_remaining: 0, retry_after_seconds: 900 },
      },
      NOW,
    );

    expect(rejection?.field).toBe("all");
    expect(rejection?.message.key).toBe("guard.step_up_locked");
    expect(rejection?.message.params?.time).toBeTruthy();
    expect(
      step_up_rejection({ server_code: "ACCOUNT_LOCKED" }, NOW)?.message.key,
    ).toBe("guard.step_up_locked_soon");
  });

  it("leaves other failures to the caller", () => {
    expect(step_up_rejection({ server_code: "GUARD_PAUSED" }, NOW)).toBeNull();
    expect(step_up_rejection({ status: 500 }, NOW)).toBeNull();
    expect(step_up_rejection(null, NOW)).toBeNull();
  });
});
