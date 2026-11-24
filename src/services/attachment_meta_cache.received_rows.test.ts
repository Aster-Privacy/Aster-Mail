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

const RECEIVED_NONCE = vi.hoisted(() => btoa("\0".repeat(12)));

const received_meta = vi.hoisted(() =>
  btoa(
    JSON.stringify({
      filename: "invoice.pdf",
      content_type: "application/pdf",
      session_key: "c2Vzc2lvbg==",
    }),
  ),
);

vi.mock("@/services/api/attachments", () => ({
  batch_attachment_meta: async (ids: string[]) => ({
    data: {
      items: Object.fromEntries(
        ids.map((id) => [
          id,
          [0, 1].map((seq) => ({
            id: `att-${id}-${seq}`,
            mail_item_id: id,
            seq_num: seq,
            size_bytes: 10,
            encrypted_meta: received_meta,
            meta_nonce: RECEIVED_NONCE,
          })),
        ]),
      ),
    },
  }),
  list_attachments: async (id: string) => ({
    data: {
      attachments: [0, 1].map((seq) => ({
        id: `att-${id}-${seq}`,
        mail_item_id: id,
        encrypted_data: "",
        data_nonce: "",
        encrypted_meta: received_meta,
        meta_nonce: RECEIVED_NONCE,
        size_bytes: 10,
        seq_num: seq,
        created_at: "2026-11-01T00:00:00.000Z",
      })),
    },
  }),
}));

const {
  prefetch_attachment_meta,
  get_cached_attachment_meta,
  clear_attachment_meta_cache,
} = await import("@/services/attachment_meta_cache");
const { fetch_attachment_records, clear_attachment_preview_cache } =
  await import("@/services/attachment_preview_cache");
const {
  clear_attachment_keys,
  get_attachment_entry,
  has_sealed_attachment_manifest,
  register_sealed_attachment_manifest,
} = await import("@/services/crypto/inbound_attachment_keys");

const manifest = [
  {
    seq: 0,
    key: "c2VhbGVkLWtleQ==",
    filename: "contract_v2.pdf",
    content_type: "application/pdf",
    content_id: "sealed-cid",
    size: 10,
    sha256: "a".repeat(64),
  },
];

describe("received attachment rows", () => {
  beforeEach(() => {
    clear_attachment_meta_cache();
    clear_attachment_preview_cache();
    clear_attachment_keys();
  });

  it("keeps received rows without a sealed manifest available", async () => {
    await prefetch_attachment_meta(["mail_r"]);

    const cached = get_cached_attachment_meta("mail_r") ?? [];

    expect(cached.map((row) => row.seq_num)).toEqual([0, 1]);
    expect(cached.map((row) => row.filename)).toEqual([
      "invoice.pdf",
      "invoice.pdf",
    ]);
    expect(has_sealed_attachment_manifest("mail_r")).toBe(false);
    expect(get_attachment_entry("mail_r", 0)?.sealed).not.toBe(true);
    expect(await fetch_attachment_records("mail_r")).toHaveLength(2);
  });

  it("shows the sealed manifest name and type over a received row", async () => {
    await prefetch_attachment_meta(["mail_s"]);
    expect(await fetch_attachment_records("mail_s")).toHaveLength(2);

    register_sealed_attachment_manifest("mail_s", manifest);

    for (const row of get_cached_attachment_meta("mail_s") ?? []) {
      expect(row.filename).not.toBe("invoice.pdf");
    }

    await prefetch_attachment_meta(["mail_s"]);

    const cached = get_cached_attachment_meta("mail_s");

    expect(cached).toHaveLength(1);
    expect(cached?.[0]).toMatchObject({
      seq_num: 0,
      filename: "contract_v2.pdf",
      content_type: "application/pdf",
      content_id: "sealed-cid",
    });
    expect(
      (await fetch_attachment_records("mail_s")).map((row) => row.seq_num),
    ).toEqual([0]);
  });
});
