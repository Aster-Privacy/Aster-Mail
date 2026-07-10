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

import { update_item_metadata } from "./mail_metadata";

const patch_mail_item_metadata = vi.fn();

vi.mock("@/services/api/mail", () => ({
  patch_mail_item_metadata: (...args: unknown[]) =>
    patch_mail_item_metadata(...args),
}));

vi.mock("./memory_key_store", () => ({
  get_derived_encryption_key: () => ({}) as CryptoKey,
}));

vi.mock("./envelope", () => ({
  encrypt_metadata: vi.fn(async () => ({
    encrypted_data: "encrypted",
    nonce: "nonce",
    version: 1,
  })),
  decrypt_metadata: vi.fn(async () => null),
  derive_metadata_key: vi.fn(async () => ({}) as CryptoKey),
  base64_to_array: vi.fn(() => new Uint8Array(0)),
  array_to_base64: vi.fn(() => ""),
  NONCE_LENGTH: 12,
}));

describe("update_item_metadata dedup cache", () => {
  beforeEach(() => {
    patch_mail_item_metadata.mockReset();
    patch_mail_item_metadata.mockResolvedValue({ data: { success: true } });
  });

  it("dedups an identical repeated write within the window", async () => {
    const item_id = crypto.randomUUID();

    const first = await update_item_metadata(item_id, {}, { is_read: true });
    const second = await update_item_metadata(item_id, {}, { is_read: true });

    expect(first.success).toBe(true);
    expect(second).toBe(first);
    expect(patch_mail_item_metadata).toHaveBeenCalledTimes(1);
  });

  it("writes the third toggle of an A-B-A sequence instead of serving the stale cached result", async () => {
    const item_id = crypto.randomUUID();

    await update_item_metadata(item_id, {}, { is_read: true });
    await update_item_metadata(item_id, {}, { is_read: false });
    const third = await update_item_metadata(item_id, {}, { is_read: true });

    expect(third.success).toBe(true);
    expect(patch_mail_item_metadata).toHaveBeenCalledTimes(3);
    expect(patch_mail_item_metadata.mock.calls[2][1]).toMatchObject({
      is_read: true,
    });
  });

  it("keeps cached results for other items when one item completes a write", async () => {
    const item_a = crypto.randomUUID();
    const item_b = crypto.randomUUID();

    await update_item_metadata(item_a, {}, { is_read: true });
    await update_item_metadata(item_b, {}, { is_read: false });
    await update_item_metadata(item_a, {}, { is_read: true });

    expect(patch_mail_item_metadata).toHaveBeenCalledTimes(2);
  });

  it("does not cache failed writes and retries them", async () => {
    const item_id = crypto.randomUUID();

    patch_mail_item_metadata.mockResolvedValueOnce({
      data: null,
      error: "server error",
    });

    const first = await update_item_metadata(item_id, {}, { is_read: true });
    const second = await update_item_metadata(item_id, {}, { is_read: true });

    expect(first.success).toBe(false);
    expect(second.success).toBe(true);
    expect(patch_mail_item_metadata).toHaveBeenCalledTimes(2);
  });
});
