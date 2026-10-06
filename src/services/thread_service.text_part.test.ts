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
import { beforeEach, describe, expect, it, vi } from "vitest";

const api_mocks = vi.hoisted(() => ({
  get_thread_messages: vi.fn(),
}));

const envelope_mocks = vi.hoisted(() => ({
  decrypt_mail_envelope: vi.fn(),
}));

vi.mock("./api/mail", () => ({
  get_mail_item: vi.fn(),
  create_thread: vi.fn(),
  link_mail_to_thread: vi.fn(),
  list_mail_items: vi.fn(),
  ...api_mocks,
}));

vi.mock("./crypto/memory_key_store", () => ({
  get_passphrase_bytes: vi.fn(),
  get_vault_from_memory: vi.fn(() => null),
  wait_for_keys_ready: vi.fn(async () => undefined),
  on_vault_cleared: vi.fn(() => () => {}),
}));

vi.mock("./crypto/ratchet_manager", () => ({
  parse_ratchet_envelope: vi.fn(() => null),
  decrypt_ratchet_message: vi.fn(),
}));

vi.mock("./crypto/mail_metadata", () => ({
  decrypt_mail_metadata: vi.fn(async () => null),
}));

vi.mock("@/components/email/shared/decrypt_envelope", () => envelope_mocks);

const { fetch_and_decrypt_thread_messages } = await import("./thread_service");
const { clear_thread_decrypt_cache } = await import("./thread_decrypt_cache");

const HTML =
  '<html><body><img src="https://cdn.news.example/banner.png"><p>Rich layout</p></body></html>';
const TEXT = "Plain text from the sender.";

function thread_with(id: string) {
  return {
    data: {
      thread_token: "thread-1",
      messages: [
        {
          id,
          item_type: "received",
          encrypted_envelope: "env",
          envelope_nonce: "nonce",
          created_at: "2026-10-01T07:12:00.000Z",
          is_external: true,
        },
      ],
    },
  };
}

async function open_thread(id: string) {
  api_mocks.get_thread_messages.mockResolvedValue(thread_with(id));
  const result = await fetch_and_decrypt_thread_messages(
    "thread-1",
    "me@example.com",
  );

  return result.messages[0];
}

describe("thread messages keep the sender's text part", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clear_thread_decrypt_cache();
  });

  it("keeps text/plain next to the HTML part", async () => {
    envelope_mocks.decrypt_mail_envelope.mockResolvedValue({
      subject: "Autumn",
      body_text: TEXT,
      body_html: HTML,
      from: { name: "Garden Weekly", email: "news@news.example" },
      to: [],
      cc: [],
      bcc: [],
      sent_at: "2026-10-01T07:12:00.000Z",
    });

    const message = await open_thread("m1");

    expect(message.html_content).toBe(HTML);
    expect(message.text_part).toBe(TEXT);
  });

  it("leaves text_part empty for HTML-only and text-only mail", async () => {
    envelope_mocks.decrypt_mail_envelope.mockResolvedValue({
      subject: "Autumn",
      body_text: "",
      body_html: HTML,
      from: { name: "Garden Weekly", email: "news@news.example" },
      to: [],
      cc: [],
      bcc: [],
      sent_at: "2026-10-01T07:12:00.000Z",
    });

    expect((await open_thread("m2")).text_part).toBe(undefined);

    envelope_mocks.decrypt_mail_envelope.mockResolvedValue({
      subject: "Hello",
      body_text: TEXT,
      from: { name: "Friend", email: "friend@example.com" },
      to: [],
      cc: [],
      bcc: [],
      sent_at: "2026-10-01T07:12:00.000Z",
    });

    const text_only = await open_thread("m3");

    expect(text_only.body).toBe(TEXT);
    expect(text_only.text_part).toBe(undefined);
  });
});
