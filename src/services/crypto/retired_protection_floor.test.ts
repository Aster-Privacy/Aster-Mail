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
import { describe, expect, it } from "vitest";

import {
  PROTECTIVE_WHEN_FALSE,
  PROTECTIVE_WHEN_TRUE,
  RANKED_PROTECTIONS,
  floor_retired_bytes,
  floor_retired_dev_mode,
  floor_retired_preferences,
} from "./retired_protection_floor";

import { DEFAULT_PREFERENCES } from "@/services/api/preferences";

function encode(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value));
}

function decode(bytes: Uint8Array | null): unknown {
  return bytes ? JSON.parse(new TextDecoder().decode(bytes)) : null;
}

describe("floor_retired_preferences", () => {
  it("raises every lowered protection back to the baseline", () => {
    const opened: Record<string, unknown> = {
      theme: "light",
      load_remote_images: "always",
      block_external_images: false,
      encrypt_emails: false,
      require_encryption: false,
      show_encryption_indicators: false,
      block_tracking_pixels: false,
      send_read_receipts: true,
      external_content_blocking_mode: "trackers",
      session_timeout_minutes: 600,
    };
    const baseline = {
      load_remote_images: "never",
      block_external_images: true,
      encrypt_emails: true,
      require_encryption: true,
      show_encryption_indicators: true,
      block_tracking_pixels: true,
      send_read_receipts: false,
      external_content_blocking_mode: "both",
      session_timeout_minutes: 30,
    };

    expect(floor_retired_preferences(opened, baseline)).toBe(true);
    expect(opened).toEqual({ theme: "light", ...baseline });
  });

  it("keeps values that are at least as protective as the baseline", () => {
    const opened: Record<string, unknown> = {
      load_remote_images: "ask",
      encrypt_emails: true,
      send_read_receipts: false,
      external_content_blocking_mode: "both",
      session_timeout_minutes: 5,
      protected_folder_lock_mode: "on_leave",
    };
    const before = { ...opened };

    expect(
      floor_retired_preferences(opened, {
        load_remote_images: "always",
        encrypt_emails: false,
        send_read_receipts: true,
        external_content_blocking_mode: "trackers",
        session_timeout_minutes: 30,
        protected_folder_lock_mode: "session",
      }),
    ).toBe(false);
    expect(opened).toEqual(before);
  });

  it("keeps a weaker value that matches what this device already uses", () => {
    const opened: Record<string, unknown> = {
      load_remote_images: "ask",
      block_tracking_pixels: false,
      external_content_blocking_mode: "images",
    };

    expect(
      floor_retired_preferences(opened, {
        load_remote_images: "ask",
        block_tracking_pixels: false,
        external_content_blocking_mode: "images",
      }),
    ).toBe(false);
  });

  it("replaces values of the wrong type and drops ones with no baseline", () => {
    const opened: Record<string, unknown> = {
      encrypt_emails: "yes",
      load_remote_images: "sometimes",
      session_timeout_minutes: -1,
      block_remote_fonts: false,
    };

    expect(
      floor_retired_preferences(opened, {
        encrypt_emails: true,
        load_remote_images: "never",
        session_timeout_minutes: 15,
      }),
    ).toBe(true);
    expect(opened).toEqual({
      encrypt_emails: true,
      load_remote_images: "never",
      session_timeout_minutes: 15,
    });
  });

  it("raises the protections from the defaults when nothing is cached", () => {
    const opened: Record<string, unknown> = {
      load_remote_images: "always",
      show_encryption_indicators: false,
      block_external_content: false,
      block_remote_images: false,
      external_content_blocking_mode: "trackers",
    };

    floor_retired_preferences(opened, DEFAULT_PREFERENCES);

    expect(opened).toEqual({
      load_remote_images: DEFAULT_PREFERENCES.load_remote_images,
      show_encryption_indicators:
        DEFAULT_PREFERENCES.show_encryption_indicators,
      block_external_content: DEFAULT_PREFERENCES.block_external_content,
      block_remote_images: DEFAULT_PREFERENCES.block_remote_images,
      external_content_blocking_mode:
        DEFAULT_PREFERENCES.external_content_blocking_mode,
    });
  });

  it("names only preferences that exist", () => {
    const known = Object.keys(DEFAULT_PREFERENCES);
    const listed = [
      ...PROTECTIVE_WHEN_TRUE,
      ...PROTECTIVE_WHEN_FALSE,
      ...Object.keys(RANKED_PROTECTIONS),
    ];

    expect(listed.filter((key) => !known.includes(key))).toEqual([]);
  });
});

describe("floor_retired_dev_mode", () => {
  it("turns developer mode off", () => {
    const opened: Record<string, unknown> = { enabled: true, timestamp: 2 };

    expect(floor_retired_dev_mode(opened)).toBe(true);
    expect(opened).toEqual({ enabled: false, timestamp: 2 });
  });

  it("leaves a record without the flag alone", () => {
    const opened: Record<string, unknown> = { step: 2 };

    expect(floor_retired_dev_mode(opened)).toBe(false);
    expect(opened).toEqual({ step: 2 });
  });
});

describe("floor_retired_bytes", () => {
  it("re-encodes an adjusted object", () => {
    expect(
      decode(
        floor_retired_bytes(encode({ enabled: 1 }), floor_retired_dev_mode),
      ),
    ).toEqual({ enabled: false });
  });

  it("returns an equal copy when nothing changes", () => {
    const bytes = new TextEncoder().encode('"dark"');
    const result = floor_retired_bytes(bytes, floor_retired_dev_mode);

    expect(result).toEqual(bytes);
    expect(result).not.toBe(bytes);
  });

  it("refuses bytes that are not JSON", () => {
    expect(
      floor_retired_bytes(new Uint8Array([0xff, 0xfe]), floor_retired_dev_mode),
    ).toBeNull();
    expect(
      floor_retired_bytes(
        new TextEncoder().encode("not json"),
        floor_retired_dev_mode,
      ),
    ).toBeNull();
  });
});
