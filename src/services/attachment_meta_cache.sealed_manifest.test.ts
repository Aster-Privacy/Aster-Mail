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

const calls = vi.hoisted(() => ({ meta: 0, list: 0 }));

const server_meta = vi.hoisted(() =>
  btoa(
    JSON.stringify({
      filename: "server_named.png",
      content_type: "image/png",
      session_key: "x",
    }),
  ),
);

vi.mock("@/services/api/attachments", () => ({
  batch_attachment_meta: async (ids: string[]) => {
    calls.meta += 1;

    return {
      data: {
        items: Object.fromEntries(
          ids.map((id) => [
            id,
            [
              {
                id: `att-${id}`,
                mail_item_id: id,
                seq_num: 0,
                size_bytes: 10,
                encrypted_meta: server_meta,
                meta_nonce: "n",
              },
              {
                id: `att-${id}-extra`,
                mail_item_id: id,
                seq_num: 1,
                size_bytes: 10,
                encrypted_meta: server_meta,
                meta_nonce: "n",
              },
            ],
          ]),
        ),
      },
    };
  },
  list_attachments: async (id: string) => {
    calls.list += 1;

    return {
      data: {
        attachments: [0, 1].map((seq) => ({
          id: `att-${id}-${seq}`,
          mail_item_id: id,
          encrypted_data: "",
          data_nonce: "",
          encrypted_meta: server_meta,
          meta_nonce: "n",
          size_bytes: 10,
          seq_num: seq,
          created_at: "2026-11-01T00:00:00.000Z",
        })),
      },
    };
  },
}));

const {
  prefetch_attachment_meta,
  get_cached_attachment_meta,
  clear_attachment_meta_cache,
} = await import("@/services/attachment_meta_cache");
const { fetch_attachment_records, clear_attachment_preview_cache } =
  await import("@/services/attachment_preview_cache");
const { clear_attachment_keys, register_sealed_attachment_manifest } =
  await import("@/services/crypto/inbound_attachment_keys");

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

describe("cached attachment details after a sealed manifest registers", () => {
  beforeEach(() => {
    clear_attachment_meta_cache();
    clear_attachment_preview_cache();
    clear_attachment_keys();
    calls.meta = 0;
    calls.list = 0;
  });

  it("shows the sealed name and type instead of earlier cached values", async () => {
    await prefetch_attachment_meta(["mail_a"]);

    expect(get_cached_attachment_meta("mail_a")?.[0]?.filename).toBe(
      "server_named.png",
    );

    register_sealed_attachment_manifest("mail_a", manifest);

    const before_refetch = get_cached_attachment_meta("mail_a") ?? [];

    for (const item of before_refetch) {
      expect(item.filename).not.toBe("server_named.png");
    }

    await prefetch_attachment_meta(["mail_a"]);

    const cached = get_cached_attachment_meta("mail_a");

    expect(cached).toHaveLength(1);
    expect(cached?.[0]).toMatchObject({
      seq_num: 0,
      filename: "contract_v2.pdf",
      content_type: "application/pdf",
      content_id: "sealed-cid",
    });
    expect(calls.meta).toBe(2);
  });

  it("does not refetch when the same manifest registers again", async () => {
    register_sealed_attachment_manifest("mail_b", manifest);
    await prefetch_attachment_meta(["mail_b"]);
    register_sealed_attachment_manifest("mail_b", structuredClone(manifest));
    await prefetch_attachment_meta(["mail_b"]);

    expect(calls.meta).toBe(1);
    expect(get_cached_attachment_meta("mail_b")?.[0]?.filename).toBe(
      "contract_v2.pdf",
    );
  });

  it("drops cached attachment rows the manifest does not list", async () => {
    expect(await fetch_attachment_records("mail_c")).toHaveLength(2);

    register_sealed_attachment_manifest("mail_c", manifest);

    const records = await fetch_attachment_records("mail_c");

    expect(records.map((row) => row.seq_num)).toEqual([0]);
    expect(calls.list).toBe(2);
  });
});
