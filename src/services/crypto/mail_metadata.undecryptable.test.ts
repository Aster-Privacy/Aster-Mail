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

import {
  blob_only_update_fields,
  bulk_update_items_metadata,
  update_item_metadata,
} from "./mail_metadata";

const patch_mail_item_metadata = vi.fn();
const get_mail_item = vi.fn();
const batched_bulk_patch_metadata = vi.fn();

vi.mock("@/services/api/mail", () => ({
  patch_mail_item_metadata: (...args: unknown[]) =>
    patch_mail_item_metadata(...args),
  get_mail_item: (...args: unknown[]) => get_mail_item(...args),
  batched_bulk_patch_metadata: (...args: unknown[]) =>
    batched_bulk_patch_metadata(...args),
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
  batched_bulk_patch_metadata.mockReset();
  batched_bulk_patch_metadata.mockImplementation(
    async (items: Array<{ id: string }>) => ({
      succeeded_ids: items.map((item) => item.id),
      failed_ids: [],
      was_cancelled: false,
    }),
  );
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

  it("fails a category write instead of dropping it silently", async () => {
    const item_id = crypto.randomUUID();

    const result = await update_item_metadata(
      item_id,
      {
        encrypted_metadata: "unreadable-blob",
        metadata_nonce: "unreadable-nonce",
        metadata_version: 4,
      },
      { category: "social", category_pinned: true },
    );

    expect(result.success).toBe(false);
    expect(result.undecryptable).toBe(true);
    expect(result.unapplied_fields).toEqual(["category", "category_pinned"]);
    expect(patch_mail_item_metadata).not.toHaveBeenCalled();
  });

  it("fails a mixed write rather than applying only the flag half", async () => {
    const item_id = crypto.randomUUID();

    const result = await update_item_metadata(
      item_id,
      {
        encrypted_metadata: "unreadable-blob",
        metadata_nonce: "unreadable-nonce",
        metadata_version: 2,
      },
      { is_read: true, snoozed_until: "2026-08-07T00:00:00.000Z" },
    );

    expect(result.success).toBe(false);
    expect(result.unapplied_fields).toEqual(["snoozed_until"]);
    expect(patch_mail_item_metadata).not.toHaveBeenCalled();
  });

  it("does not cache a failed blob write as a completed one", async () => {
    const item_id = crypto.randomUUID();
    const base = {
      encrypted_metadata: "unreadable-blob",
      metadata_nonce: "unreadable-nonce",
      metadata_version: 1,
    };

    const first = await update_item_metadata(item_id, base, {
      category: "social",
    });
    const second = await update_item_metadata(item_id, base, {
      category: "social",
    });

    expect(first.success).toBe(false);
    expect(second.success).toBe(false);
  });
});

describe("bulk_update_items_metadata on undecryptable items", () => {
  it("reports a blob-resident write as failed for the affected ids", async () => {
    const result = await bulk_update_items_metadata(
      [
        { id: "readable" },
        {
          id: "unreadable",
          encrypted_metadata: "unreadable-blob",
          metadata_nonce: "unreadable-nonce",
        },
      ],
      { category: "social" },
    );

    expect(result.failed_ids).toEqual(["unreadable"]);
    expect(result.undecryptable_ids).toEqual(["unreadable"]);
    expect(result.success).toBe(false);

    const sent = batched_bulk_patch_metadata.mock.calls[0]![0] as Array<{
      id: string;
    }>;

    expect(sent.map((item) => item.id)).toEqual(["readable"]);
  });

  it("still degrades to a flags-only patch when only flags were requested", async () => {
    const result = await bulk_update_items_metadata(
      [
        {
          id: "unreadable",
          encrypted_metadata: "unreadable-blob",
          metadata_nonce: "unreadable-nonce",
        },
      ],
      { is_trashed: true },
    );

    expect(result.success).toBe(true);
    expect(result.undecryptable_ids).toEqual([]);

    const sent = batched_bulk_patch_metadata.mock.calls[0]![0] as Array<
      Record<string, unknown>
    >;

    expect(sent[0]!.encrypted_metadata).toBeUndefined();
    expect(sent[0]!.is_trashed).toBe(true);
  });
});

describe("blob_only_update_fields", () => {
  it("treats every server flag as writable without the blob", () => {
    expect(
      blob_only_update_fields({
        is_read: true,
        is_starred: true,
        is_pinned: true,
        is_trashed: true,
        is_archived: true,
        is_spam: true,
      }),
    ).toEqual([]);
  });

  it("names the blob-resident fields in an update", () => {
    expect(
      blob_only_update_fields({
        is_read: true,
        category: "social",
        snoozed_until: undefined,
      }),
    ).toEqual(["category", "snoozed_until"]);
  });
});
