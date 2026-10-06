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

vi.mock("@/services/crypto/memory_key_store", () => ({
  on_vault_cleared: vi.fn(),
}));

function stored_rows(mail_item_id: string) {
  return [0, 1, 2].map((seq_num) => ({
    id: `att-${mail_item_id}-${seq_num}`,
    mail_item_id,
    seq_num,
    size_bytes: 10,
    encrypted_meta: `meta-${seq_num}`,
    meta_nonce: "n",
    encrypted_data: `data-${seq_num}`,
    data_nonce: "dn",
  }));
}

vi.mock("@/services/api/attachments", () => ({
  batch_attachment_meta: async (ids: string[]) => ({
    data: {
      items: Object.fromEntries(ids.map((id) => [id, stored_rows(id)])),
    },
  }),
  list_attachments: async (id: string) => ({
    data: { attachments: stored_rows(id), total: 3 },
  }),
}));

vi.mock("@/services/crypto/attachment_crypto", () => ({
  DEFAULT_ATTACHMENT_CONTENT_TYPE: "application/octet-stream",
  decrypt_attachment_meta: vi.fn(),
  decrypt_attachment_data: vi.fn(),
  resolve_attachment_meta: async ({
    encrypted_meta,
    size_bytes,
  }: {
    encrypted_meta: string;
    size_bytes: number;
  }) => ({
    filename: `${encrypted_meta}.pdf`,
    content_type: "application/pdf",
    session_key: "",
    size_bytes,
    is_placeholder: false,
  }),
}));

const {
  prefetch_attachment_meta,
  get_cached_attachment_meta,
  clear_attachment_meta_cache,
} = await import("@/services/attachment_meta_cache");
const {
  fetch_attachment_records,
  get_cached_attachment_bytes,
  clear_attachment_preview_cache,
} = await import("@/services/attachment_preview_cache");
const { register_envelope_attachment_keys, clear_attachment_keys } =
  await import("@/services/crypto/inbound_attachment_keys");

const listed_key = btoa(String.fromCharCode(...new Uint8Array(32).fill(1)));

function list_keys(mail_item_id: string, seqs: number[]): void {
  register_envelope_attachment_keys(mail_item_id, {
    attachment_keys: seqs.map((seq) => ({ seq, key: listed_key })),
  });
}

describe("attachment rows of mail whose envelope lists keys", () => {
  beforeEach(() => {
    clear_attachment_keys();
    clear_attachment_meta_cache();
    clear_attachment_preview_cache();
  });

  it("caches metadata only for the listed rows", async () => {
    list_keys("m1", [0, 2]);

    await prefetch_attachment_meta(["m1"]);

    expect(
      get_cached_attachment_meta("m1")?.map((meta) => meta.filename),
    ).toEqual(["meta-0.pdf", "meta-2.pdf"]);
  });

  it("caches metadata for every row when the envelope lists no keys", async () => {
    list_keys("m1", [0]);

    await prefetch_attachment_meta(["m2"]);

    expect(get_cached_attachment_meta("m2")).toHaveLength(3);
  });

  it("hands out records and bytes only for the listed rows", async () => {
    list_keys("m1", [1]);

    const records = await fetch_attachment_records("m1");

    expect(records.map((record) => record.seq_num)).toEqual([1]);
    expect([...(get_cached_attachment_bytes("m1")?.keys() ?? [])]).toEqual([
      "att-m1-1",
    ]);
  });

  it("hands out every record when the envelope lists no keys", async () => {
    list_keys("m1", [1]);

    const records = await fetch_attachment_records("m2");

    expect(records.map((record) => record.seq_num)).toEqual([0, 1, 2]);
  });
});
