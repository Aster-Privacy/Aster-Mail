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
import { describe, it, expect, beforeEach, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  get_mail_item: vi.fn(),
  decrypt_mail_envelope: vi.fn(),
  fetch_and_decrypt_thread_messages: vi.fn(),
  sanitize_inputs: [] as string[],
}));

vi.mock("@/lib/html_sanitizer", async (import_original) => {
  const actual = await import_original<typeof import("@/lib/html_sanitizer")>();

  return {
    ...actual,
    sanitize_html: (
      html: string,
      ...rest: Parameters<typeof actual.sanitize_html> extends [
        unknown,
        ...infer R,
      ]
        ? R
        : never
    ) => {
      mocks.sanitize_inputs.push(html);

      return actual.sanitize_html(html, ...rest);
    },
  };
});

vi.mock("@/services/api/mail", () => ({
  get_mail_item: mocks.get_mail_item,
}));

vi.mock("@/components/email/shared/decrypt_envelope", () => ({
  decrypt_mail_envelope: mocks.decrypt_mail_envelope,
}));

vi.mock("@/services/thread_service", () => ({
  fetch_and_decrypt_thread_messages: mocks.fetch_and_decrypt_thread_messages,
  resolve_reaction_emojis: vi.fn(async () => undefined),
}));

vi.mock("@/services/crypto/memory_key_store", () => ({
  get_vault_from_memory: () => null,
  wait_for_keys_ready: vi.fn(async () => undefined),
  are_keys_ready: () => true,
  get_vault_account_epoch: () => 0,
  on_vault_cleared: () => () => {},
}));

vi.mock("@/services/account_manager", () => ({
  get_current_account: vi.fn(async () => null),
}));

vi.mock("@/services/attachment_meta_cache", () => ({
  prefetch_attachment_meta: vi.fn(async () => undefined),
  clear_attachment_meta_cache: vi.fn(),
}));

vi.mock("@/services/attachment_preview_cache", () => ({
  prefetch_attachment_previews: vi.fn(async () => undefined),
  clear_attachment_preview_cache: vi.fn(),
}));

import {
  clear_preload_cache,
  get_preload_cache,
  preload_email_detail,
} from "./preload_cache";

const TARGET_HTML =
  '<div style="background:#fff"><p>Weekly <b>digest</b> for you.</p></div>';
const EARLIER_HTML = "<p>Earlier <i>message</i> in the thread.</p>";

function thread_message(id: string, html: string, timestamp: string) {
  return {
    id,
    item_type: "received",
    sender_name: "Sam Sender",
    sender_email: "sam@example.com",
    subject: "Digest",
    body: "",
    html_content: html,
    timestamp,
    is_read: false,
    is_starred: false,
    is_deleted: false,
    is_external: true,
    to_recipients: [],
    cc_recipients: [],
    bcc_recipients: [],
  };
}

function seed_server(thread_token: string | null) {
  mocks.get_mail_item.mockResolvedValue({
    data: {
      id: "msg_target",
      item_type: "received",
      thread_token,
      is_external: true,
      encrypted_envelope: "env",
      envelope_nonce: "nonce",
      created_at: "2026-01-02T10:00:00Z",
      message_ts: "2026-01-02T10:00:00Z",
      metadata: { is_read: false, is_starred: false, has_attachments: false },
    },
  });
  mocks.decrypt_mail_envelope.mockResolvedValue({
    subject: "Digest",
    body_html: TARGET_HTML,
    body_text: "",
    from: { name: "Sam Sender", email: "sam@example.com" },
    to: [],
    cc: [],
    bcc: [],
    sent_at: "2026-01-02T10:00:00Z",
  });
  mocks.fetch_and_decrypt_thread_messages.mockResolvedValue({
    messages: [
      thread_message("msg_earlier", EARLIER_HTML, "2026-01-01T10:00:00Z"),
      thread_message("msg_target", TARGET_HTML, "2026-01-02T10:00:00Z"),
    ],
  });
}

function sanitize_count(fragment: string): number {
  return mocks.sanitize_inputs.filter((html) => html.includes(fragment)).length;
}

describe("preload_email_detail sanitizing", () => {
  beforeEach(() => {
    clear_preload_cache();
    mocks.sanitize_inputs.length = 0;
    vi.clearAllMocks();
  });

  it("sanitizes each thread message once, including the target", async () => {
    seed_server("thread_1");

    await preload_email_detail("msg_target", undefined, true, true);

    const entry = get_preload_cache().get("msg_target");

    expect(entry?.thread_sanitized.get("msg_target")?.html).toContain("digest");
    expect(entry?.thread_sanitized.get("msg_earlier")?.html).toContain(
      "Earlier",
    );
    expect(sanitize_count("Weekly")).toBe(1);
    expect(sanitize_count("Earlier")).toBe(1);
  });

  it("sanitizes a message outside a conversation once", async () => {
    seed_server(null);

    await preload_email_detail("msg_target", undefined, true, false);

    expect(
      get_preload_cache().get("msg_target")?.thread_sanitized.get("msg_target")
        ?.html,
    ).toContain("digest");
    expect(sanitize_count("Weekly")).toBe(1);
  });
});
