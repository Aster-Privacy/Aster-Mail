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
import type { EncryptedVault } from "@/services/crypto/key_manager";

import { beforeEach, describe, expect, it, vi } from "vitest";

const get = vi.fn();
const opened = { bytes: new Uint8Array(), retired: false };

vi.mock("./client", () => ({
  api_client: {
    get: (...args: unknown[]) => get(...args),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("@/services/crypto/legacy_keks", () => ({
  decrypt_account_context_with_fallback: async (
    _context: string,
    _key: unknown,
    _encrypted: unknown,
    _nonce: unknown,
    on_retired_key?: () => void,
  ) => {
    if (opened.retired) on_retired_key?.();

    return opened.bytes.slice();
  },
  decrypt_aes_gcm_with_fallback: vi.fn(),
  get_account_data_write_key: vi.fn(() => null),
}));

vi.mock("@/services/crypto/account_data_writer", () => ({
  account_data_write_key: vi.fn(async () => null),
  retry_after_account_key_load: <T>(run: () => Promise<T>) => run(),
}));

import {
  clear_preferences_cache,
  DEFAULT_PREFERENCES,
  get_preferences,
} from "./preferences";
import { get_dev_mode } from "./preferences_dev_mode";

const SEALED = btoa("sealed-bytes-0000");
const NONCE = btoa("nonce-000000");
const vault = { identity_key: "identity-key-material" } as EncryptedVault;

const MIGRATED = {
  migration_haptic_v1_done: true,
  migration_tracker_blocking_v2_done: true,
  migration_toast_position_v1_done: true,
  migration_viewer_toolbar_v1_done: true,
  migration_signature_placement_v1_done: true,
};

const LOWERED = {
  ...MIGRATED,
  load_remote_images: "always",
  show_encryption_indicators: false,
  block_tracking_pixels: false,
  block_remote_images: false,
  send_read_receipts: true,
};

function serve(value: unknown, retired: boolean): void {
  opened.bytes = new TextEncoder().encode(JSON.stringify(value));
  opened.retired = retired;
}

beforeEach(() => {
  get.mockReset();
  localStorage.clear();
  clear_preferences_cache();
});

describe("preferences read under a retired key", () => {
  beforeEach(() => {
    get.mockResolvedValue({
      data: { encrypted_preferences: SEALED, preferences_nonce: NONCE },
    });
  });

  it("keeps the default protections", async () => {
    serve({ ...LOWERED, theme: "light" }, true);

    const { data } = await get_preferences(vault);

    expect(data.theme).toBe("light");
    expect(data.load_remote_images).toBe(
      DEFAULT_PREFERENCES.load_remote_images,
    );
    expect(data.show_encryption_indicators).toBe(true);
    expect(data.block_tracking_pixels).toBe(true);
    expect(data.block_remote_images).toBe(true);
    expect(data.send_read_receipts).toBe(false);
  });

  it("applies the same values when they were read under the current key", async () => {
    serve(LOWERED, false);

    const { data } = await get_preferences(vault);

    expect(data.load_remote_images).toBe("always");
    expect(data.show_encryption_indicators).toBe(false);
    expect(data.send_read_receipts).toBe(true);
  });
});

describe("developer mode read under a retired key", () => {
  beforeEach(() => {
    get.mockResolvedValue({
      data: { encrypted_dev_mode: SEALED, dev_mode_nonce: NONCE },
    });
  });

  it("stays off", async () => {
    serve({ enabled: true }, true);

    expect(await get_dev_mode(vault)).toEqual({ data: false });
  });

  it("turns on under the current key", async () => {
    serve({ enabled: true }, false);

    expect(await get_dev_mode(vault)).toEqual({ data: true });
  });
});
