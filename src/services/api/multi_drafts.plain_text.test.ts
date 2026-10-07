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

const { post_mock, get_mock } = vi.hoisted(() => ({
  post_mock: vi.fn(),
  get_mock: vi.fn(),
}));

vi.mock("./client", () => ({
  api_client: {
    get: get_mock,
    post: post_mock,
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("./session_recovery", () => ({
  with_session_recovery: (call: () => unknown) => call(),
}));

vi.mock("@/services/crypto/account_data_writer", () => ({
  account_data_write_key: async () => null,
  retry_after_account_key_load: (call: () => unknown) => call(),
}));

vi.mock("@/services/crypto/legacy_keks", () => ({
  decrypt_aes_gcm_with_fallback: (
    key: CryptoKey,
    ciphertext: Uint8Array,
    nonce: Uint8Array,
  ) => crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce }, key, ciphertext),
}));

vi.mock("@/hooks/use_mail_stats", () => ({
  invalidate_mail_stats: vi.fn(),
}));

vi.mock("@/hooks/mail_events", () => ({
  emit_drafts_changed: vi.fn(),
  emit_draft_updated: vi.fn(),
  emit_thread_draft_changed: vi.fn(),
}));

import {
  list_drafts_with_content,
  normalize_draft_content,
} from "./multi_drafts";

import { escape_html } from "@/hooks/editor_utils";
import {
  draft_manager,
  type DraftData,
} from "@/services/crypto/encrypted_drafts";

const vault = { identity_key: "plain-draft-identity" } as never;

const typed_text =
  "Use <project> & \"quotes\" 'here'\n\n  indented line\ttab\nÁgua, ação";
const stored_message = escape_html(typed_text).replace(/\n/g, "<br>");

function draft(overrides: Partial<DraftData> = {}): DraftData {
  return {
    to_recipients: ["alice@example.com"],
    cc_recipients: [],
    bcc_recipients: [],
    subject: "Notes",
    message: stored_message,
    ...overrides,
  };
}

function base64_to_bytes(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
}

async function open_request(request: {
  encrypted_content: string;
  content_nonce: string;
}): Promise<Record<string, unknown>> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode("plain-draft-identity" + "astermail-draft-v2"),
  );
  const key = await crypto.subtle.importKey(
    "raw",
    digest,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"],
  );
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64_to_bytes(request.content_nonce) },
    key,
    base64_to_bytes(request.encrypted_content),
  );

  return JSON.parse(new TextDecoder().decode(plaintext));
}

async function save(data: DraftData) {
  post_mock.mockResolvedValueOnce({
    data: { id: "d1", version: 1, success: true },
  });
  const context_id = draft_manager.create_context();

  await draft_manager.save_draft(context_id, data, vault);
  draft_manager.clear_context(context_id);

  return post_mock.mock.calls[0][1] as {
    encrypted_content: string;
    content_nonce: string;
  } & Record<string, unknown>;
}

function list_with(request: {
  encrypted_content: string;
  content_nonce: string;
}) {
  get_mock.mockResolvedValueOnce({
    data: {
      items: [
        {
          id: "d1",
          draft_type: "new",
          encrypted_content: request.encrypted_content,
          content_nonce: request.content_nonce,
          version: 1,
          content_hash: "",
          size_bytes: 0,
          has_attachments: false,
          attachment_count: 0,
          created_at: "",
          updated_at: "",
          expires_at: "",
        },
      ],
      has_more: false,
    },
  });

  return list_drafts_with_content(20, vault);
}

beforeEach(() => {
  post_mock.mockReset();
  get_mock.mockReset();
  draft_manager.clear_all_contexts();
});

describe("plain text mode in the encrypted draft content", () => {
  it("is stored only inside the encrypted content", async () => {
    const request = await save(draft({ is_plain_text: true }));

    expect(Object.keys(request)).not.toContain("is_plain_text");
    expect(JSON.stringify(request)).not.toMatch(/plain/i);

    const content = await open_request(request);

    expect(content.is_plain_text).toBe(true);
    expect(content.message).toBe(stored_message);
  });

  it("comes back with the identical message when the draft is listed", async () => {
    const request = await save(draft({ is_plain_text: true }));
    const listed = await list_with(request);
    const content = listed.data?.drafts[0].content;

    expect(content?.is_plain_text).toBe(true);
    expect(content?.message).toBe(stored_message);
  });

  it("is left out of a rich draft, which lists as rich", async () => {
    const request = await save(draft({ message: "<p>Hello</p>" }));
    const content = await open_request(request);

    expect(content).not.toHaveProperty("is_plain_text");

    const listed = await list_with(request);

    expect(listed.data?.drafts[0].content.is_plain_text).toBeUndefined();
  });
});

describe("normalize_draft_content", () => {
  it("reads a draft saved before the field existed as rich", () => {
    const content = normalize_draft_content({
      to_recipients: ["alice@example.com"],
      subject: "Old",
      message: "Hello<br>there",
    });

    expect(content.is_plain_text).toBeUndefined();
    expect(content.message).toBe("Hello<br>there");
  });

  it("reads an envelope written by another client as rich", () => {
    const content = normalize_draft_content({
      subject: "From the phone",
      body_text: "",
      body_html: "<p>Hi</p>",
      to: [{ name: "", email: "alice@example.com" }],
    });

    expect(content.is_plain_text).toBeUndefined();
    expect(content.message).toBe("<p>Hi</p>");
  });

  it.each([["true"], [1], [null], [{}]])(
    "ignores a non boolean value %j",
    (value) => {
      expect(
        normalize_draft_content({ message: "x", is_plain_text: value })
          .is_plain_text,
      ).toBeUndefined();
    },
  );
});
