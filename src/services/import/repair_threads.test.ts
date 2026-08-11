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
import type { MailItem, RethreadItem } from "@/services/api/mail";

import { describe, it, expect, vi, beforeEach } from "vitest";

import { thread_token_from_root } from "@/services/threading/threading_rules";

const USER_ID = "11111111-2222-3333-4444-555555555555";

function encode_envelope(obj: Record<string, unknown>): string {
  const json = JSON.stringify(obj);
  const bytes = new TextEncoder().encode(json);
  let binary = "";

  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }

  return btoa(binary);
}

function make_item(overrides: Partial<MailItem> & { id: string }): MailItem {
  return {
    item_type: "received",
    encrypted_envelope: "",
    envelope_nonce: "",
    folder_token: "folder1",
    is_external: false,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function envelope(options: {
  subject: string;
  message_id?: string;
  references?: string;
  in_reply_to?: string;
  sent_at?: string;
}): string {
  const raw_headers: { name: string; value: string }[] = [];

  if (options.message_id)
    raw_headers.push({ name: "Message-ID", value: options.message_id });
  if (options.references)
    raw_headers.push({ name: "References", value: options.references });
  if (options.in_reply_to)
    raw_headers.push({ name: "In-Reply-To", value: options.in_reply_to });

  return encode_envelope({
    subject: options.subject,
    sent_at: options.sent_at ?? "2026-01-01T00:00:00Z",
    raw_headers,
  });
}

const mock_list_mail_items = vi.fn();
const mock_rethread_items = vi.fn();
const mock_decrypt_mail_envelope = vi.fn();
const mock_get_passphrase_bytes = vi.fn();
const mock_get_vault_from_memory = vi.fn();
const mock_zero_uint8_array = vi.fn();
const mock_get_cached_user_info = vi.fn();

vi.mock("@/services/api/mail", () => ({
  list_mail_items: (...args: unknown[]) => mock_list_mail_items(...args),
  rethread_items: (...args: unknown[]) => mock_rethread_items(...args),
}));

vi.mock("@/services/api/client", () => ({
  api_client: {
    get_cached_user_info: () => mock_get_cached_user_info(),
  },
}));

vi.mock("@/components/email/shared/decrypt_envelope", () => ({
  decrypt_mail_envelope: (...args: unknown[]) =>
    mock_decrypt_mail_envelope(...args),
}));

vi.mock("@/services/crypto/memory_key_store", () => ({
  get_passphrase_bytes: () => mock_get_passphrase_bytes(),
  get_vault_from_memory: () => mock_get_vault_from_memory(),
}));

vi.mock("@/services/crypto/secure_memory", () => ({
  zero_uint8_array: (...args: unknown[]) => mock_zero_uint8_array(...args),
}));

function setup_crypto_mocks() {
  mock_get_cached_user_info.mockReturnValue({ user_id: USER_ID });
  mock_get_passphrase_bytes.mockReturnValue(new Uint8Array([1, 2, 3]));
  mock_get_vault_from_memory.mockReturnValue({ identity_key: "test-key" });

  mock_decrypt_mail_envelope.mockImplementation(async (encrypted: string) => {
    try {
      return JSON.parse(
        new TextDecoder().decode(
          Uint8Array.from(atob(encrypted), (c) => c.charCodeAt(0)),
        ),
      );
    } catch {
      return null;
    }
  });

  mock_rethread_items.mockImplementation(async (items: RethreadItem[]) => ({
    data: { success: true, updated: items.length, skipped: 0 },
  }));
}

function setup_mail_items(items: MailItem[]) {
  mock_list_mail_items.mockResolvedValue({
    data: {
      items,
      has_more: false,
      next_cursor: null,
    },
  });
}

function submitted(): RethreadItem[] {
  return mock_rethread_items.mock.calls.flatMap(
    (call) => call[0] as RethreadItem[],
  );
}

async function reimport_fresh() {
  vi.resetModules();
  const mod = await import("@/services/import/repair_threads");

  return mod.thread_imported_emails;
}

describe("thread_imported_emails", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-28T12:00:00Z"));
    setup_crypto_mocks();
  });

  it("does nothing when every item already has a conversation", async () => {
    setup_mail_items([
      make_item({
        id: "a",
        thread_token: "existing",
        encrypted_envelope: envelope({
          subject: "Invoice",
          message_id: "<a@example.com>",
        }),
      }),
    ]);

    const run = await reimport_fresh();

    expect(await run()).toBe(0);
    expect(mock_rethread_items).not.toHaveBeenCalled();
  });

  it("links a reply to the conversation its references point at", async () => {
    setup_mail_items([
      make_item({
        id: "parent",
        thread_token: "parent-token",
        encrypted_envelope: envelope({
          subject: "Invoice",
          message_id: "<parent@example.com>",
          sent_at: "2026-01-01T00:00:00Z",
        }),
      }),
      make_item({
        id: "reply",
        encrypted_envelope: envelope({
          subject: "Re: Invoice",
          message_id: "<reply@example.com>",
          in_reply_to: "<parent@example.com>",
          sent_at: "2026-01-02T00:00:00Z",
        }),
      }),
    ]);

    const run = await reimport_fresh();

    expect(await run()).toBe(1);
    expect(submitted()).toEqual([
      expect.objectContaining({ item_id: "reply", thread_token: "parent-token" }),
    ]);
  });

  it("never links two unrelated messages that only share a subject", async () => {
    setup_mail_items([
      make_item({
        id: "one",
        encrypted_envelope: envelope({
          subject: "Verify your device",
          message_id: "<one@pcloud.com>",
        }),
      }),
      make_item({
        id: "two",
        encrypted_envelope: envelope({
          subject: "Verify your device",
          message_id: "<two@pcloud.com>",
        }),
      }),
    ]);

    const run = await reimport_fresh();

    expect(await run()).toBe(2);

    const items = submitted();

    expect(items).toHaveLength(2);
    expect(items[0].thread_token).not.toBe(items[1].thread_token);
  });

  it("gives an unthreaded message a token derived from its own message id", async () => {
    setup_mail_items([
      make_item({
        id: "solo",
        encrypted_envelope: envelope({
          subject: "Welcome",
          message_id: "<solo@example.com>",
        }),
      }),
    ]);

    const run = await reimport_fresh();

    await run();

    expect(submitted()).toEqual([
      expect.objectContaining({
        item_id: "solo",
        thread_token: thread_token_from_root(USER_ID, "<solo@example.com>"),
      }),
    ]);
  });

  it("does not link a reply whose subject was changed", async () => {
    setup_mail_items([
      make_item({
        id: "parent",
        thread_token: "parent-token",
        encrypted_envelope: envelope({
          subject: "Invoice",
          message_id: "<parent@example.com>",
        }),
      }),
      make_item({
        id: "reply",
        encrypted_envelope: envelope({
          subject: "Re: Something else",
          message_id: "<reply@example.com>",
          in_reply_to: "<parent@example.com>",
          sent_at: "2026-01-02T00:00:00Z",
        }),
      }),
    ]);

    const run = await reimport_fresh();

    await run();

    expect(submitted()).toEqual([
      expect.objectContaining({
        item_id: "reply",
        thread_token: thread_token_from_root(USER_ID, "<reply@example.com>"),
      }),
    ]);
  });

  it("leaves a message with no usable message id alone", async () => {
    setup_mail_items([
      make_item({
        id: "headerless",
        encrypted_envelope: envelope({ subject: "Notice" }),
      }),
    ]);

    const run = await reimport_fresh();

    expect(await run()).toBe(0);
    expect(mock_rethread_items).not.toHaveBeenCalled();
  });

  it("skips the run when the vault is locked", async () => {
    mock_get_vault_from_memory.mockReturnValue(null);
    setup_mail_items([make_item({ id: "a" })]);

    const run = await reimport_fresh();

    expect(await run()).toBe(0);
    expect(mock_list_mail_items).not.toHaveBeenCalled();
  });

  it("skips the run when the user is unknown", async () => {
    mock_get_cached_user_info.mockReturnValue(null);
    setup_mail_items([make_item({ id: "a" })]);

    const run = await reimport_fresh();

    expect(await run()).toBe(0);
    expect(mock_list_mail_items).not.toHaveBeenCalled();
  });

  it("honors the cooldown between runs", async () => {
    setup_mail_items([
      make_item({
        id: "solo",
        encrypted_envelope: envelope({
          subject: "Welcome",
          message_id: "<solo@example.com>",
        }),
      }),
    ]);

    const run = await reimport_fresh();

    await run();
    mock_rethread_items.mockClear();

    expect(await run()).toBe(0);
    expect(mock_rethread_items).not.toHaveBeenCalled();
  });
});
