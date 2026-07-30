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
const get_mail_item = vi.fn();

vi.mock("@/services/api/mail", () => ({
  patch_mail_item_metadata: (...args: unknown[]) =>
    patch_mail_item_metadata(...args),
  get_mail_item: (...args: unknown[]) => get_mail_item(...args),
}));

vi.mock("./memory_key_store", () => ({
  get_derived_encryption_key: () => ({}) as CryptoKey,
}));

const blob_store = new Map<string, Record<string, unknown>>();
let blob_counter = 0;

vi.mock("./envelope", () => ({
  encrypt_metadata: vi.fn(async (data: unknown) => {
    blob_counter += 1;
    const id = `cipher-${blob_counter}`;

    blob_store.set(id, JSON.parse(JSON.stringify(data)));

    return { encrypted_data: id, nonce: `nonce-${blob_counter}`, version: 1 };
  }),
  decrypt_metadata: vi.fn(async (blob: { encrypted_data: string }) =>
    blob_store.get(blob.encrypted_data) ?? null,
  ),
  derive_metadata_key: vi.fn(async () => ({}) as CryptoKey),
  base64_to_array: vi.fn(() => new Uint8Array(0)),
  array_to_base64: vi.fn(() => ""),
  NONCE_LENGTH: 12,
}));

function last_payload(): Record<string, unknown> {
  const calls = patch_mail_item_metadata.mock.calls;

  return calls[calls.length - 1][1];
}

beforeEach(() => {
  patch_mail_item_metadata.mockReset();
  patch_mail_item_metadata.mockResolvedValue({ data: { success: true } });
  get_mail_item.mockReset();
  get_mail_item.mockResolvedValue({ data: { id: "server-item" } });
  blob_store.clear();
});

describe("update_item_metadata on undecryptable items", () => {
  it("sends flags only and leaves the existing ciphertext intact", async () => {
    const item_id = crypto.randomUUID();

    const result = await update_item_metadata(
      item_id,
      {
        encrypted_metadata: "unreadable-blob",
        metadata_nonce: "unreadable-nonce",
        metadata_version: 4,
      },
      { is_trashed: true },
    );

    expect(result.success).toBe(true);

    const payload = last_payload();

    expect(payload.encrypted_metadata).toBeUndefined();
    expect(payload.metadata_nonce).toBeUndefined();
    expect(payload.is_trashed).toBe(true);
    expect(result.written_version).toBe(4);
  });

  it("still writes ciphertext for an item that has no metadata yet", async () => {
    const item_id = crypto.randomUUID();

    const result = await update_item_metadata(
      item_id,
      {},
      { is_archived: true },
    );

    expect(result.success).toBe(true);

    const payload = last_payload();

    expect(payload.encrypted_metadata).toBeDefined();
    expect(payload.is_archived).toBe(true);
  });
});
