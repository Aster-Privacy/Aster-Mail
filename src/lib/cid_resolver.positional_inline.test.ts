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

const SERVER_BODY =
  '<html><head></head><body dir="auto">Here is the photo<div></div>' +
  '<div><img src="cid:aster-inline-7" alt="IMG_0001.jpeg" style="max-width:100%;height:auto"></div>' +
  '<div><br><div dir="ltr">Sent from my phone</div></div></body></html>';

describe("resolve_cid_references for images placed between body parts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(list_attachments).mockResolvedValue({
      data: {
        attachments: [
          {
            mail_item_id: "mail_1",
            seq_num: 0,
            encrypted_meta: "meta_0",
            meta_nonce: "meta_nonce",
            encrypted_data: "data_0",
            data_nonce: "data_nonce",
          },
        ],
      },
    } as never);
    vi.mocked(decrypt_attachment_meta).mockResolvedValue({
      filename: "IMG_0001.jpeg",
      content_type: "image/jpeg",
      content_id: "aster-inline-7",
      session_key: "key",
    } as never);
    vi.mocked(decrypt_attachment_data).mockResolvedValue(
      new Uint8Array([255, 216, 255]).buffer as never,
    );
  });

  it("swaps the server-assigned cid for the decrypted image", async () => {
    const result = await resolve_cid_references(SERVER_BODY, "mail_1", "data");

    expect(result.unresolved).toBe(0);
    expect(result.html).not.toContain("cid:");
    expect(result.html).toContain("data:image/jpeg;base64,/9j/");
    expect(result.html.indexOf("Here is the photo")).toBeLessThan(
      result.html.indexOf("data:image/jpeg"),
    );
    expect(result.html.indexOf("data:image/jpeg")).toBeLessThan(
      result.html.indexOf("Sent from my phone"),
    );
  });
});
