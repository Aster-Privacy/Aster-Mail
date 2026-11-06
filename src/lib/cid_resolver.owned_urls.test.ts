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
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/services/api/attachments", () => ({
  list_attachments: vi.fn(),
}));

vi.mock("@/services/crypto/attachment_crypto", () => ({
  decrypt_attachment_meta: vi.fn(),
  decrypt_attachment_data: vi.fn(),
}));

import { resolve_cid_references, revoke_cid_blob_urls } from "./cid_resolver";

import { list_attachments } from "@/services/api/attachments";
import {
  decrypt_attachment_meta,
  decrypt_attachment_data,
} from "@/services/crypto/attachment_crypto";
import {
  clear_attachment_preview_cache,
  get_cached_preview_url,
  set_cached_preview_url,
} from "@/services/attachment_preview_cache";

const OLD_MAIL_BODY =
  '<div class="WordSection1"><p class="MsoNormal">Quarterly numbers below.</p>' +
  '<p class="MsoNormal"><img width="602" height="341" style="width:6.27in;height:3.55in" ' +
  'id="Picture_x0020_1" src="cid:image001.png@01DAF1C2.5E3B7A40" alt="cid:image001.png"></p>' +
  '<p class="MsoNormal"><img width="120" height="40" src="cid:image002.jpg@01DAF1C2.5E3B7A40"></p></div>';

const RECORDS = [
  {
    id: "att_0",
    mail_item_id: "mail_old",
    seq_num: 0,
    encrypted_meta: "meta_0",
    meta_nonce: "AAAAAAAAAAAAAAAA",
    encrypted_data: "data_0",
    data_nonce: "nonce_0",
  },
  {
    id: "att_1",
    mail_item_id: "mail_old",
    seq_num: 1,
    encrypted_meta: "meta_1",
    meta_nonce: "AAAAAAAAAAAAAAAA",
    encrypted_data: "data_1",
    data_nonce: "nonce_1",
  },
];

const METAS: Record<string, Record<string, unknown>> = {
  meta_0: {
    filename: "image001.png",
    content_type: "image/png",
    content_id: "image001.png@01DAF1C2.5E3B7A40",
    session_key: "key_0",
  },
  meta_1: {
    filename: "image002.jpg",
    content_type: "image/jpeg",
    content_id: "image002.jpg@01DAF1C2.5E3B7A40",
    session_key: "key_1",
  },
};

function body_blob_urls(html: string): string[] {
  return Array.from(html.matchAll(/src="(blob:[^"]+)"/g), (m) => m[1]);
}

describe("resolve_cid_references blob urls for old received mail", () => {
  let next_url = 0;
  const revoked = new Set<string>();
  const original_create = URL.createObjectURL;
  const original_revoke = URL.revokeObjectURL;

  beforeEach(() => {
    vi.clearAllMocks();
    clear_attachment_preview_cache();
    revoked.clear();
    URL.createObjectURL = vi.fn(() => `blob:test/${(next_url += 1)}`);
    URL.revokeObjectURL = vi.fn((url: string) => {
      revoked.add(url);
    });
    vi.mocked(list_attachments).mockResolvedValue({
      data: { attachments: RECORDS },
    } as never);
    vi.mocked(decrypt_attachment_meta).mockImplementation(
      async (encrypted_meta: string) => METAS[encrypted_meta] as never,
    );
    vi.mocked(decrypt_attachment_data).mockResolvedValue(
      new Uint8Array([137, 80, 78, 71]).buffer as never,
    );
  });

  afterEach(() => {
    clear_attachment_preview_cache();
    URL.createObjectURL = original_create;
    URL.revokeObjectURL = original_revoke;
  });

  it("keeps the body images alive when the preview cache is cleared", async () => {
    const result = await resolve_cid_references(OLD_MAIL_BODY, "mail_old");
    const in_body = body_blob_urls(result.html);

    expect(result.unresolved).toBe(0);
    expect(in_body).toHaveLength(2);

    clear_attachment_preview_cache();

    for (const url of in_body) {
      expect(revoked.has(url)).toBe(false);
    }
  });

  it("keeps the body images alive when the preview cache evicts them", async () => {
    const result = await resolve_cid_references(OLD_MAIL_BODY, "mail_old");
    const in_body = body_blob_urls(result.html);

    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 60_000);
    try {
      for (let i = 0; i < 500; i++) {
        set_cached_preview_url(`other_${i}`, `blob:other/${i}`);
      }
    } finally {
      vi.useRealTimers();
    }

    for (const url of in_body) {
      expect(revoked.has(url)).toBe(false);
    }
  });

  it("hands the body urls to the caller to revoke", async () => {
    const result = await resolve_cid_references(OLD_MAIL_BODY, "mail_old");

    expect(result.blob_urls.sort()).toEqual(body_blob_urls(result.html).sort());
    expect(get_cached_preview_url("att_0")).toBeUndefined();
  });

  it("does not reuse a preview url the attachment list owns", async () => {
    set_cached_preview_url("att_0", "blob:preview/att_0");

    const result = await resolve_cid_references(OLD_MAIL_BODY, "mail_old");

    expect(result.html).not.toContain("blob:preview/att_0");
    expect(body_blob_urls(result.html)).toHaveLength(2);
  });

  it("gives each concurrent view its own urls", async () => {
    const [first, second] = await Promise.all([
      resolve_cid_references(OLD_MAIL_BODY, "mail_old"),
      resolve_cid_references(OLD_MAIL_BODY, "mail_old"),
    ]);

    expect(first.blob_urls).toHaveLength(2);
    expect(second.blob_urls).toHaveLength(2);
    expect(first.blob_urls.some((u) => second.blob_urls.includes(u))).toBe(
      false,
    );

    revoke_cid_blob_urls(first.blob_urls);

    for (const url of body_blob_urls(second.html)) {
      expect(revoked.has(url)).toBe(false);
    }
    expect(decrypt_attachment_data).toHaveBeenCalledTimes(2);
  });
});
