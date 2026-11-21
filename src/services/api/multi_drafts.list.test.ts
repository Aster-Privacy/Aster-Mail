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

const { get_mock } = vi.hoisted(() => ({
  get_mock: vi.fn(),
}));

vi.mock("./client", () => ({
  api_client: {
    get: get_mock,
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("@/services/crypto/legacy_keks", () => ({
  get_account_data_crypto_keys: () => [],
}));

vi.mock("@/services/crypto/account_data_writer", () => ({
  account_data_write_key: async () => null,
  retry_after_account_key_load: (call: () => unknown) => call(),
}));

vi.mock("@/hooks/use_mail_stats", () => ({
  invalidate_mail_stats: vi.fn(),
}));

import { list_drafts_with_content } from "./multi_drafts";

const vault = { identity_key: "test-identity" } as never;

interface Sealed {
  encrypted_content: string;
  content_nonce: string;
}

const UNREADABLE: Sealed = { encrypted_content: "AAAA", content_nonce: "AAAA" };

function to_base64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

async function seal(content: object): Promise<Sealed> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode("test-identity" + "astermail-draft-v2"),
  );
  const key = await crypto.subtle.importKey(
    "raw",
    digest,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"],
  );
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    key,
    new TextEncoder().encode(JSON.stringify(content)),
  );

  return {
    encrypted_content: to_base64(new Uint8Array(ciphertext)),
    content_nonce: to_base64(nonce),
  };
}

function api_item(id: string, sealed: Sealed) {
  return {
    id,
    draft_type: "new",
    ...sealed,
    version: 1,
    content_hash: "",
    size_bytes: 0,
    has_attachments: false,
    attachment_count: 0,
    created_at: "",
    updated_at: "",
    expires_at: "",
  };
}

describe("list_drafts_with_content - single request, no N+1", () => {
  beforeEach(() => {
    get_mock.mockReset();
  });

  it("decrypts every draft from one list call, never per-draft", async () => {
    const sealed = await seal({
      to_recipients: ["a@b.com"],
      cc_recipients: [],
      bcc_recipients: [],
      subject: "Hi",
      message: "body",
    });

    get_mock.mockResolvedValueOnce({
      data: {
        items: [api_item("d1", sealed), api_item("d2", sealed)],
        has_more: false,
      },
    });

    const res = await list_drafts_with_content(50, vault);

    expect(get_mock).toHaveBeenCalledTimes(1);
    expect(String(get_mock.mock.calls[0][0])).toContain("/mail/v1/drafts");
    expect(res.data?.drafts).toHaveLength(2);
    expect(res.data?.drafts[0].content.subject).toBe("Hi");
    expect(res.data?.drafts[0].content.to_recipients).toEqual(["a@b.com"]);
  });

  it("keeps a draft as an empty placeholder when its content fails to decrypt", async () => {
    get_mock.mockResolvedValueOnce({
      data: { items: [api_item("d1", UNREADABLE)], has_more: false },
    });

    const res = await list_drafts_with_content(50, vault);

    expect(get_mock).toHaveBeenCalledTimes(1);
    expect(res.data?.drafts).toHaveLength(1);
    expect(res.data?.drafts[0].id).toBe("d1");
    expect(res.data?.drafts[0].is_undecryptable).toBe(true);
    expect(res.data?.drafts[0].content.subject).toBe("");
    expect(res.data?.drafts[0].content.to_recipients).toEqual([]);
  });
});
