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
  on_vault_stored: () => () => {},
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

function sent_copy(id: string, extra: Record<string, unknown>) {
  return {
    id,
    item_type: "sent",
    encrypted_envelope: "env",
    envelope_nonce: "nonce",
    created_at: "2026-11-20T09:00:00.000Z",
    is_external: true,
    ...extra,
  };
}

async function open_thread(messages: ReturnType<typeof sent_copy>[]) {
  api_mocks.get_thread_messages.mockResolvedValue({
    data: { thread_token: "thread-1", messages },
  });

  const result = await fetch_and_decrypt_thread_messages(
    "thread-1",
    "me@example.com",
  );

  return result.messages;
}

function readable_envelope() {
  return {
    subject: "Plans",
    body_text: "See you at noon.",
    from: { name: "Me", email: "me@example.com" },
    to: [{ name: "Friend", email: "friend@example.net" }],
    cc: [],
    bcc: [],
    sent_at: "2026-11-20T09:00:00.000Z",
  };
}

describe("thread messages carry the recipient key flag", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clear_thread_decrypt_cache();
  });

  it("keeps the flag the server sent for a readable message", async () => {
    envelope_mocks.decrypt_mail_envelope.mockResolvedValue(readable_envelope());

    const [with_key, without_key] = await open_thread([
      sent_copy("m1", { has_recipient_key: true }),
      sent_copy("m2", { has_recipient_key: false }),
    ]);

    expect(with_key.has_recipient_key).toBe(true);
    expect(without_key.has_recipient_key).toBe(false);
  });

  it("keeps the flag the server sent for a message that could not be opened", async () => {
    envelope_mocks.decrypt_mail_envelope.mockResolvedValue(null);

    const [message] = await open_thread([
      sent_copy("m3", { has_recipient_key: true }),
    ]);

    expect(message.has_recipient_key).toBe(true);
  });

  it("leaves the flag unset when an older server does not send it", async () => {
    envelope_mocks.decrypt_mail_envelope.mockResolvedValue(readable_envelope());

    const [message] = await open_thread([sent_copy("m4", {})]);

    expect(message.has_recipient_key).toBeUndefined();
    expect("has_recipient_key" in message).toBe(false);
  });
});
