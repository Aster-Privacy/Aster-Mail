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

vi.mock("@/services/api/attachments", () => ({
  list_attachments: vi.fn(),
}));

vi.mock("@/services/crypto/attachment_crypto", () => ({
  decrypt_attachment_meta: vi.fn(),
  decrypt_attachment_data: vi.fn(),
}));

import { resolve_cid_references } from "./cid_resolver";

import { list_attachments } from "@/services/api/attachments";
import {
  decrypt_attachment_meta,
  decrypt_attachment_data,
} from "@/services/crypto/attachment_crypto";

function attachment_row(seq_num: number) {
  return {
    mail_item_id: "mail_1",
    seq_num,
    encrypted_meta: `meta_${seq_num}`,
    meta_nonce: "meta_nonce",
    encrypted_data: `data_${seq_num}`,
    data_nonce: "data_nonce",
  };
}

function setup_attachments(): void {
  vi.mocked(list_attachments).mockResolvedValue({
    data: {
      attachments: [attachment_row(0), attachment_row(1), attachment_row(2)],
    },
  } as never);

  vi.mocked(decrypt_attachment_meta).mockImplementation(
    (_meta: unknown, _nonce: unknown, _mail_id: unknown, seq_num: unknown) =>
      Promise.resolve({
        filename: `part${seq_num}.png`,
        content_type: "image/png",
        content_id:
          seq_num === 0
            ? "<header001@mail.example.com>"
            : seq_num === 1
              ? "<footer002@mail.example.com>"
              : "<spare003@mail.example.com>",
        session_key: "key",
      }) as never,
  );

  vi.mocked(decrypt_attachment_data).mockImplementation(
    (
      _data: unknown,
      _nonce: unknown,
      _key: unknown,
      _mail_id: unknown,
      seq_num: unknown,
    ) =>
      Promise.resolve(
        new Uint8Array(seq_num === 0 ? [1, 2] : [3, 4]).buffer as ArrayBuffer,
      ) as never,
  );
}

describe("resolve_cid_references percent-encoded references", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setup_attachments();
  });

  it("resolves inline images whose cid is percent-encoded", async () => {
    const html =
      '<img src="cid:header001%40mail.example.com"><img src="cid:footer002%40mail.example.com">';
    const result = await resolve_cid_references(html, "mail_1", "data");

    expect(result.unresolved).toBe(0);
    expect(result.html).toContain("data:image/png;base64,AQI=");
    expect(result.html).toContain("data:image/png;base64,AwQ=");
    expect(result.html).not.toContain("cid:");
  });

  it("still resolves plain unencoded references", async () => {
    const html =
      '<img src="cid:header001@mail.example.com"><img src="cid:footer002@mail.example.com">';
    const result = await resolve_cid_references(html, "mail_1", "data");

    expect(result.unresolved).toBe(0);
    expect(result.html).not.toContain("cid:");
  });
});
