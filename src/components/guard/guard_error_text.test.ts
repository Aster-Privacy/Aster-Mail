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
    expect(
      guard_error_message({ server_code: "GUARD_HELD" }, NOW)?.key,
    ).toBe("guard.error_held_soon");
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
    expect(guard_error_text(t as never, { status: 500 }, "guard.held_error")).toBe(
      "guard.held_error",
    );
    expect(guard_error_text_or_null(t as never, { status: 500 })).toBeNull();
  });

  it("leaves errors without a Guard code to the caller", () => {
    expect(guard_error_text_or_null(t as never, { status: 429 })).toBeNull();
    expect(
      guard_error_text_or_null(t as never, { code: "TIMEOUT_ERROR" }),
    ).toBeNull();
    expect(
      guard_error_text_or_null(t as never, { server_code: "GUARD_LAST_DEVICE" }),
    ).not.toBeNull();
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
