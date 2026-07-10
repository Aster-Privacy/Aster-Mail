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

function fake_encrypt(data: unknown) {
  blob_counter += 1;
  const id = `cipher-${blob_counter}`;

  blob_store.set(id, JSON.parse(JSON.stringify(data)));

  return { encrypted_data: id, nonce: `nonce-${blob_counter}`, version: 1 };
}

function fake_decrypt(blob: { encrypted_data: string }) {
  return blob_store.get(blob.encrypted_data) ?? null;
}

vi.mock("./envelope", () => ({
  encrypt_metadata: vi.fn(async (data: unknown) => fake_encrypt(data)),
  decrypt_metadata: vi.fn(async (blob: { encrypted_data: string }) =>
    fake_decrypt(blob),
  ),
  derive_metadata_key: vi.fn(async () => ({}) as CryptoKey),
  base64_to_array: vi.fn(() => new Uint8Array(0)),
  array_to_base64: vi.fn(() => ""),
  NONCE_LENGTH: 12,
}));

function seed_blob(metadata: Record<string, unknown>): string {
  blob_counter += 1;
  const id = `seed-${blob_counter}`;

  blob_store.set(id, metadata);

  return id;
}

function last_written_payload(): { encrypted_metadata: string } {
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

describe("update_item_metadata dedup cache", () => {
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

describe("update_item_metadata missing-base recovery", () => {
  it("fetches the server blob instead of wiping flags when the caller base has no encrypted_metadata", async () => {
    const item_id = crypto.randomUUID();
    const server_blob = seed_blob({
      is_read: false,
      is_starred: true,
      is_pinned: true,
      is_trashed: false,
      is_archived: false,
      is_spam: false,
      size_bytes: 4096,
      has_attachments: true,
      attachment_count: 2,
      snoozed_until: "2026-07-10T00:00:00.000Z",
      category_pinned: true,
      item_type: "received",
    });

    get_mail_item.mockResolvedValueOnce({
      data: {
        id: item_id,
        encrypted_metadata: server_blob,
        metadata_nonce: "server-nonce",
        metadata_version: 1,
      },
    });

    const result = await update_item_metadata(item_id, {}, { is_read: true });

    expect(result.success).toBe(true);
    expect(get_mail_item).toHaveBeenCalledWith(item_id);

    const written = blob_store.get(last_written_payload().encrypted_metadata);

    expect(written).toMatchObject({
      is_read: true,
      is_starred: true,
      is_pinned: true,
      size_bytes: 4096,
      has_attachments: true,
      attachment_count: 2,
      snoozed_until: "2026-07-10T00:00:00.000Z",
      category_pinned: true,
    });
  });

  it("falls back to defaults only when the server confirms the item has no blob", async () => {
    const item_id = crypto.randomUUID();

    get_mail_item.mockResolvedValueOnce({ data: { id: item_id } });

    const result = await update_item_metadata(item_id, {}, { is_read: true });

    expect(result.success).toBe(true);

    const written = blob_store.get(last_written_payload().encrypted_metadata);

    expect(written).toMatchObject({ is_read: true, is_starred: false });
  });

  it("fails the write instead of encrypting defaults when the fetch fails", async () => {
    const item_id = crypto.randomUUID();

    get_mail_item.mockResolvedValueOnce({ data: null, error: "network" });

    const result = await update_item_metadata(item_id, {}, { is_read: true });

    expect(result.success).toBe(false);
    expect(patch_mail_item_metadata).not.toHaveBeenCalled();
  });
});

describe("update_item_metadata stale-base replay", () => {
  it("rebases a stale-base replay on the latest written blob after an intervening write", async () => {
    const item_id = crypto.randomUUID();
    const original_blob = seed_blob({
      is_read: false,
      is_starred: false,
      item_type: "received",
    });
    const stale_base = {
      encrypted_metadata: original_blob,
      metadata_nonce: "nonce-0",
      metadata_version: 1,
    };

    const write_a = await update_item_metadata(item_id, stale_base, {
      is_read: true,
    });

    expect(write_a.success).toBe(true);

    const write_b = await update_item_metadata(
      item_id,
      {
        encrypted_metadata: write_a.encrypted?.encrypted_metadata,
        metadata_nonce: write_a.encrypted?.metadata_nonce,
        metadata_version: 2,
      },
      { is_starred: true },
    );

    expect(write_b.success).toBe(true);

    const replay = await update_item_metadata(item_id, stale_base, {
      is_read: true,
    });

    expect(replay.success).toBe(true);
    expect(patch_mail_item_metadata).toHaveBeenCalledTimes(3);

    const final_blob = blob_store.get(
      last_written_payload().encrypted_metadata,
    );

    expect(final_blob).toMatchObject({ is_read: true, is_starred: true });
  });

  it("still trusts a caller base that is as new as the last written version", async () => {
    const item_id = crypto.randomUUID();
    const original_blob = seed_blob({
      is_read: false,
      is_starred: false,
      item_type: "received",
    });

    const write_a = await update_item_metadata(
      item_id,
      {
        encrypted_metadata: original_blob,
        metadata_nonce: "nonce-0",
        metadata_version: 1,
      },
      { is_read: true },
    );

    const fresh_blob = seed_blob({
      is_read: true,
      is_starred: false,
      is_pinned: true,
      item_type: "received",
    });

    const write_b = await update_item_metadata(
      item_id,
      {
        encrypted_metadata: fresh_blob,
        metadata_nonce: "nonce-fresh",
        metadata_version: write_a.written_version,
      },
      { is_starred: true },
    );

    expect(write_b.success).toBe(true);

    const final_blob = blob_store.get(
      last_written_payload().encrypted_metadata,
    );

    expect(final_blob).toMatchObject({
      is_read: true,
      is_starred: true,
      is_pinned: true,
    });
  });
});
