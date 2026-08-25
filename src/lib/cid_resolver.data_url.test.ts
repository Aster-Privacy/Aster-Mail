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

const PNG_BYTES = new Uint8Array([1, 2, 3, 4]);

function setup_single_attachment(): void {
  vi.mocked(list_attachments).mockResolvedValue({
    data: {
      attachments: [
        {
          mail_item_id: "mail_1",
          seq_num: 0,
          encrypted_meta: "meta",
          meta_nonce: "meta_nonce",
          encrypted_data: "data",
          data_nonce: "data_nonce",
        },
      ],
    },
  } as never);

  vi.mocked(decrypt_attachment_meta).mockResolvedValue({
    filename: "logo.png",
    content_type: "image/png",
    content_id: "<logo@example.com>",
    session_key: "key",
  } as never);

  vi.mocked(decrypt_attachment_data).mockResolvedValue(
    PNG_BYTES.buffer as ArrayBuffer,
  );
}

describe("resolve_cid_references url_mode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setup_single_attachment();
  });

  it("returns a data url and no blob urls in data mode", async () => {
    const result = await resolve_cid_references(
      '<img src="cid:logo@example.com">',
      "mail_1",
      "data",
    );

    expect(result.blob_urls).toEqual([]);
    expect(result.html).toContain('src="data:image/png;base64,AQIDBA=="');
    expect(result.html).not.toContain("cid:");
  });

  it("returns blob urls by default", async () => {
    const create_object_url = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:mock-url");

    const result = await resolve_cid_references(
      '<img src="cid:logo@example.com">',
      "mail_1",
    );

    expect(create_object_url).toHaveBeenCalled();
    expect(result.blob_urls).toEqual(["blob:mock-url"]);
    expect(result.html).toContain('src="blob:mock-url"');

    create_object_url.mockRestore();
  });

  it("reports unresolved references when the meta cannot be opened", async () => {
    vi.mocked(decrypt_attachment_meta).mockRejectedValue(new Error("sealed"));

    const result = await resolve_cid_references(
      '<img src="cid:logo@example.com">',
      "mail_1",
      "data",
    );

    expect(result.unresolved).toBe(1);
    expect(result.blob_urls).toEqual([]);
  });

  it("reports zero unresolved references on a full resolve", async () => {
    const result = await resolve_cid_references(
      '<img src="cid:logo@example.com">',
      "mail_1",
      "data",
    );

    expect(result.unresolved).toBe(0);
  });

  it("leaves html untouched when no cid references exist", async () => {
    const html = '<img src="https://example.com/a.png">';
    const result = await resolve_cid_references(html, "mail_1", "data");

    expect(result.html).toBe(html);
    expect(list_attachments).not.toHaveBeenCalled();
  });
});
