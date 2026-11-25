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

const pgp_mocks = vi.hoisted(() => ({
  resolve_inbound_pgp_body: vi.fn(),
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

vi.mock("@/services/locked_folders", () => ({
  filter_locked_mail_items: <T>(items: T[]) => items,
}));

vi.mock("@/components/email/shared/decrypt_envelope", () => envelope_mocks);

vi.mock("@/utils/email_crypto", async (import_original) => ({
  ...(await import_original<Record<string, unknown>>()),
  ...pgp_mocks,
}));

const { fetch_and_decrypt_thread_messages, fetch_and_decrypt_virtual_group } =
  await import("./thread_service");
const { clear_thread_decrypt_cache } = await import("./thread_decrypt_cache");

const PGP_BODY = [
  "-----BEGIN PGP MESSAGE-----",
  "",
  "wcBMA0AAAAAAAAAAAQf/placeholder",
  "-----END PGP MESSAGE-----",
].join("\n");

function received(id: string) {
  return {
    id,
    item_type: "received",
    encrypted_envelope: "env",
    envelope_nonce: "nonce",
    created_at: "2026-11-20T09:00:00.000Z",
    is_external: true,
    is_trashed: false,
  };
}

function pgp_envelope() {
  return {
    subject: "Plans",
    body_text: PGP_BODY,
    from: { name: "Friend", email: "friend@example.net" },
    to: [{ name: "Me", email: "me@example.com" }],
    cc: [],
    bcc: [],
    sent_at: "2026-11-20T09:00:00.000Z",
  };
}

function opened(verified: boolean) {
  return {
    body: "See you at noon.",
    decrypted: true,
    verified,
    sender_verification: verified ? "verified" : "no_keys",
  };
}

async function thread_message(verified: boolean) {
  pgp_mocks.resolve_inbound_pgp_body.mockResolvedValue(opened(verified));
  api_mocks.get_thread_messages.mockResolvedValue({
    data: { thread_token: "thread-1", messages: [received("t1")] },
  });

  const result = await fetch_and_decrypt_thread_messages(
    "thread-1",
    "me@example.com",
  );

  return result.messages[0];
}

async function group_message(verified: boolean) {
  pgp_mocks.resolve_inbound_pgp_body.mockResolvedValue(opened(verified));
  api_mocks.list_mail_items.mockResolvedValue({
    data: { items: [received("g1")] },
  });

  const [message] = await fetch_and_decrypt_virtual_group(
    ["g1"],
    "me@example.com",
  );

  return message;
}

describe("received PGP mail in a thread", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clear_thread_decrypt_cache();
    envelope_mocks.decrypt_mail_envelope.mockResolvedValue(pgp_envelope());
  });

  it("is end-to-end only when the sender signature verifies", async () => {
    const unverified = await thread_message(false);

    expect(unverified.body).toContain("See you at noon.");
    expect(unverified.e2e_verified).toBe(false);

    clear_thread_decrypt_cache();
    const verified = await thread_message(true);

    expect(verified.e2e_verified).toBe(true);
  });

  it("follows the same rule in a grouped conversation", async () => {
    const unverified = await group_message(false);

    expect(unverified.body).toContain("See you at noon.");
    expect(unverified.e2e_verified).toBe(false);

    const verified = await group_message(true);

    expect(verified.e2e_verified).toBe(true);
  });
});
