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

const { list_attachments, decrypt_attachment_meta, decrypt_attachment_data } =
  vi.hoisted(() => ({
    list_attachments: vi.fn(),
    decrypt_attachment_meta: vi.fn(),
    decrypt_attachment_data: vi.fn(),
  }));

vi.mock("@/services/api/attachments", () => ({ list_attachments }));

vi.mock("@/services/crypto/attachment_crypto", () => ({
  decrypt_attachment_meta,
  decrypt_attachment_data,
}));

import { load_forward_attachments } from "./forward_attachments";

interface StoredAttachment {
  filename: string;
  content_type: string;
  bytes: number;
  content_id?: string;
  is_inline?: boolean;
  fails?: boolean;
}

function stub_source_attachments(stored: StoredAttachment[]): void {
  list_attachments.mockResolvedValue({
    data: {
      attachments: stored.map((entry, index) => ({
        id: `att-${index}`,
        mail_item_id: "mail-1",
        seq_num: index,
        size_bytes: entry.bytes,
        encrypted_data: `data-${index}`,
        data_nonce: `nonce-${index}`,
        encrypted_meta: `meta-${index}`,
        meta_nonce: `meta-nonce-${index}`,
        created_at: new Date(0).toISOString(),
      })),
      total: stored.length,
    },
  });

  decrypt_attachment_meta.mockImplementation(async (encrypted_meta: string) => {
    const index = Number(encrypted_meta.split("-")[1]);
    const entry = stored[index];

    return {
      filename: entry.filename,
      content_type: entry.content_type,
      session_key: `key-${index}`,
      content_id: entry.content_id,
      is_inline: entry.is_inline,
    };
  });

  decrypt_attachment_data.mockImplementation(async (encrypted_data: string) => {
    const index = Number(encrypted_data.split("-")[1]);
    const entry = stored[index];

    if (entry.fails) throw new Error("decrypt failed");

    return new ArrayBuffer(entry.bytes);
  });
}

describe("load_forward_attachments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("carries non-inline attachments of the forwarded message", async () => {
    stub_source_attachments([
      { filename: "report.pdf", content_type: "application/pdf", bytes: 2048 },
    ]);

    const carried = await load_forward_attachments("mail-1", {
      body_html: "<p>original body</p>",
    });

    expect(carried).toHaveLength(1);
    expect(carried[0].name).toBe("report.pdf");
    expect(carried[0].mime_type).toBe("application/pdf");
    expect(carried[0].size_bytes).toBe(2048);
    expect(carried[0].data.byteLength).toBe(2048);
  });

  it("skips only inline images the forwarded body references", async () => {
    stub_source_attachments([
      {
        filename: "logo.png",
        content_type: "image/png",
        bytes: 512,
        content_id: "<logo123>",
      },
      {
        filename: "signature.png",
        content_type: "image/png",
        bytes: 256,
        is_inline: true,
      },
      { filename: "invoice.pdf", content_type: "application/pdf", bytes: 4096 },
    ]);

    const carried = await load_forward_attachments("mail-1", {
      body_html: '<img src="cid:logo123"> hello',
    });

    expect(carried.map((a) => a.name)).toEqual([
      "signature.png",
      "invoice.pdf",
    ]);
  });

  it("keeps the forward when a single attachment fails to decrypt", async () => {
    stub_source_attachments([
      {
        filename: "broken.bin",
        content_type: "application/octet-stream",
        bytes: 100,
        fails: true,
      },
      { filename: "notes.txt", content_type: "text/plain", bytes: 64 },
    ]);

    const carried = await load_forward_attachments("mail-1");

    expect(carried.map((a) => a.name)).toEqual(["notes.txt"]);
  });

  it("drops attachments that would exceed the total size budget", async () => {
    stub_source_attachments([
      {
        filename: "huge.zip",
        content_type: "application/zip",
        bytes: 60 * 1024 * 1024,
      },
      { filename: "small.txt", content_type: "text/plain", bytes: 32 },
    ]);

    const carried = await load_forward_attachments("mail-1");

    expect(carried.map((a) => a.name)).toEqual(["small.txt"]);
  });

  it("returns nothing when the source message has no attachments", async () => {
    list_attachments.mockResolvedValue({ data: { attachments: [], total: 0 } });

    await expect(load_forward_attachments("mail-1")).resolves.toEqual([]);
  });

  it("returns nothing when the attachment listing fails", async () => {
    list_attachments.mockRejectedValue(new Error("network down"));

    await expect(load_forward_attachments("mail-1")).resolves.toEqual([]);
  });
});
