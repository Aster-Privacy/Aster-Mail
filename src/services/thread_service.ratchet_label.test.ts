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
  list_mail_items: vi.fn(),
}));

const envelope_mocks = vi.hoisted(() => ({
  decrypt_mail_envelope: vi.fn(),
}));

const ratchet_mocks = vi.hoisted(() => ({
  parse_ratchet_envelope: vi.fn(),
  decrypt_ratchet_message: vi.fn(),
}));

vi.mock("./api/mail", () => ({
  get_mail_item: vi.fn(),
  create_thread: vi.fn(),
  link_mail_to_thread: vi.fn(),
  ...api_mocks,
}));

vi.mock("./crypto/memory_key_store", () => ({
  on_vault_stored: () => () => {},
  get_passphrase_bytes: vi.fn(),
  get_vault_from_memory: vi.fn(() => ({ identity_key: "identity" })),
  get_passphrase_from_memory: vi.fn(() => null),
  wait_for_keys_ready: vi.fn(async () => undefined),
  on_vault_cleared: vi.fn(() => () => {}),
}));

vi.mock("./crypto/ratchet_manager", () => ratchet_mocks);

vi.mock("./crypto/mail_metadata", () => ({
  decrypt_mail_metadata: vi.fn(async () => null),
}));

vi.mock("@/services/locked_folders", () => ({
  filter_locked_mail_items: <T>(items: T[]) => items,
}));

vi.mock("@/components/email/shared/decrypt_envelope", () => envelope_mocks);

const { fetch_and_decrypt_thread_messages, fetch_and_decrypt_virtual_group } =
  await import("./thread_service");
const { clear_thread_decrypt_cache } = await import("./thread_decrypt_cache");
const {
  clear_ratchet_verification_status,
  mark_unauthenticated_plaintext,
  mark_unconfirmed_sender_plaintext,
} = await import("./crypto/ratchet_verification_status");

const RATCHET_BODY = JSON.stringify({
  type: "double_ratchet_v2",
  sender_identity_key: "sender-identity",
  recipients: {},
});

function received(id: string) {
  return {
    id,
    item_type: "received",
    encrypted_envelope: "env",
    envelope_nonce: "nonce",
    created_at: "2026-11-26T09:00:00.000Z",
    is_external: false,
    is_trashed: false,
  };
}

function ratchet_envelope() {
  return {
    subject: "Hello!",
    body_text: RATCHET_BODY,
    from: { name: "Findley", email: "findley@aster.cx" },
    to: [{ name: "Hello", email: "hello@astermail.org" }],
    cc: [],
    bcc: [],
    sent_at: "2026-11-26T09:00:00.000Z",
  };
}

async function thread_message(id: string) {
  api_mocks.get_thread_messages.mockResolvedValue({
    data: { thread_token: `thread-${id}`, messages: [received(id)] },
  });

  const result = await fetch_and_decrypt_thread_messages(
    `thread-${id}`,
    "hello@astermail.org",
  );

  return result.messages[0];
}

async function group_message(id: string) {
  api_mocks.list_mail_items.mockResolvedValue({
    data: { items: [received(id)] },
  });

  const [message] = await fetch_and_decrypt_virtual_group(
    [id],
    "hello@astermail.org",
  );

  return message;
}

describe("received ratchet mail encryption status in a thread", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clear_thread_decrypt_cache();
    clear_ratchet_verification_status();
    envelope_mocks.decrypt_mail_envelope.mockResolvedValue(ratchet_envelope());
    ratchet_mocks.parse_ratchet_envelope.mockReturnValue({
      version: "double_ratchet_v2",
    });
  });

  it("is end to end and sender bound for a known sender", async () => {
    ratchet_mocks.decrypt_ratchet_message.mockResolvedValue("Testing known");

    const message = await thread_message("known");

    expect(message.body).toContain("Testing known");
    expect(message.e2e_verified).toBe(true);
    expect(message.e2e_sender_bound).toBe(true);
  });

  it("is end to end without naming the sender on a first contact", async () => {
    ratchet_mocks.decrypt_ratchet_message.mockImplementation(async () => {
      mark_unconfirmed_sender_plaintext("Testing!", "first");

      return "Testing!";
    });

    const message = await thread_message("first");

    expect(message.body).toContain("Testing!");
    expect(message.e2e_verified).toBe(true);
    expect(message.e2e_sender_bound).toBe(false);
    expect(message.e2e_details_sealed).toBeFalsy();
  });

  it("follows the same rule in a grouped conversation", async () => {
    ratchet_mocks.decrypt_ratchet_message.mockImplementation(async () => {
      mark_unconfirmed_sender_plaintext("Grouped first", "grouped");

      return "Grouped first";
    });

    const message = await group_message("grouped");

    expect(message.body).toContain("Grouped first");
    expect(message.e2e_verified).toBe(true);
    expect(message.e2e_sender_bound).toBe(false);
  });

  it("does not claim end to end for an unauthenticated recovered plaintext", async () => {
    ratchet_mocks.decrypt_ratchet_message.mockImplementation(async () => {
      mark_unauthenticated_plaintext("Recovered copy", "recovered");

      return "Recovered copy";
    });

    const message = await thread_message("recovered");

    expect(message.body).toContain("Recovered copy");
    expect(message.e2e_verified).toBe(false);
    expect(message.e2e_sender_bound).toBe(false);
  });
});
