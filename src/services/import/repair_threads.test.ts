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
const PARENT_TOKEN = btoa("p".repeat(16));
const REPLY_TOKEN = btoa("r".repeat(16));
const IMPORT_TOKEN = btoa("i".repeat(32));

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
  from?: string;
  to?: string;
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
    from: options.from ? { email: options.from } : undefined,
    to: options.to ? [{ email: options.to }] : [],
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

async function reimport_module() {
  vi.resetModules();

  return import("@/services/import/repair_threads");
}

async function reimport_fresh() {
  vi.resetModules();
  const mod = await import("@/services/import/repair_threads");

  return mod.thread_imported_emails;
}

describe("thread_imported_emails", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
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
        thread_token: PARENT_TOKEN,
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
      expect.objectContaining({
        item_id: "reply",
        thread_token: PARENT_TOKEN,
      }),
    ]);
  });

  it("merges a reply that was given its own conversation into its parent's", async () => {
    setup_mail_items([
      make_item({
        id: "reply",
        thread_token: REPLY_TOKEN,
        encrypted_envelope: envelope({
          subject: "Re: Invoice",
          message_id: "<reply@example.com>",
          references: "<parent@example.com>",
          sent_at: "2026-01-02T00:00:00Z",
        }),
      }),
      make_item({
        id: "parent",
        thread_token: PARENT_TOKEN,
        encrypted_envelope: envelope({
          subject: "Invoice",
          message_id: "<parent@example.com>",
          sent_at: "2026-01-01T00:00:00Z",
        }),
      }),
    ]);

    const run = await reimport_fresh();

    expect(await run({ relink_all: true })).toBe(1);
    expect(submitted()).toEqual([
      expect.objectContaining({
        item_id: "reply",
        thread_token: PARENT_TOKEN,
      }),
    ]);
  });

  it("links sent replies into the conversation they answer", async () => {
    const received = make_item({
      id: "parent",
      encrypted_envelope: envelope({
        subject: "Plans",
        message_id: "<parent@example.com>",
        sent_at: "2026-01-01T00:00:00Z",
      }),
    });
    const sent = make_item({
      id: "sent-reply",
      item_type: "sent",
      encrypted_envelope: envelope({
        subject: "RE: Plans",
        message_id: "<sent@aster.cx>",
        in_reply_to: "<parent@example.com>",
        sent_at: "2026-01-02T00:00:00Z",
      }),
    });

    setup_mail_items([received, sent]);

    const run = await reimport_fresh();

    await run({ relink_all: true });

    const root = thread_token_from_root(USER_ID, "<parent@example.com>");

    expect(submitted()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ item_id: "parent", thread_token: root }),
        expect.objectContaining({ item_id: "sent-reply", thread_token: root }),
      ]),
    );
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
        thread_token: PARENT_TOKEN,
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

  it("reads every folder, including archived mail, and skips drafts", async () => {
    setup_mail_items([
      make_item({
        id: "archived-parent",
        encrypted_envelope: envelope({
          subject: "Lease",
          message_id: "<lease@example.com>",
        }),
      }),
      make_item({
        id: "draft",
        item_type: "draft",
        encrypted_envelope: envelope({
          subject: "Re: Lease",
          message_id: "<draft@aster.cx>",
          in_reply_to: "<lease@example.com>",
        }),
      }),
      make_item({
        id: "folder-reply",
        encrypted_envelope: envelope({
          subject: "Re: Lease",
          message_id: "<lease-reply@example.com>",
          in_reply_to: "<lease@example.com>",
          sent_at: "2026-01-02T00:00:00Z",
        }),
      }),
    ]);

    const run = await reimport_fresh();

    await run();

    expect(mock_list_mail_items).toHaveBeenCalledWith(
      expect.objectContaining({ item_type: "all", skip_total: true }),
    );

    const root = thread_token_from_root(USER_ID, "<lease@example.com>");
    const items = submitted();

    expect(items.map((item) => item.item_id).sort()).toEqual([
      "archived-parent",
      "folder-reply",
    ]);
    expect(items.every((item) => item.thread_token === root)).toBe(true);
  });

  it("follows every page of results", async () => {
    mock_list_mail_items
      .mockResolvedValueOnce({
        data: {
          items: [
            make_item({
              id: "parent",
              encrypted_envelope: envelope({
                subject: "Trip",
                message_id: "<trip@example.com>",
              }),
            }),
          ],
          has_more: true,
          next_cursor: "next",
        },
      })
      .mockResolvedValueOnce({
        data: {
          items: [
            make_item({
              id: "reply",
              encrypted_envelope: envelope({
                subject: "Re: Trip",
                message_id: "<trip-reply@example.com>",
                in_reply_to: "<trip@example.com>",
                sent_at: "2026-01-02T00:00:00Z",
              }),
            }),
          ],
          has_more: false,
          next_cursor: null,
        },
      });

    const run = await reimport_fresh();

    await run();

    const root = thread_token_from_root(USER_ID, "<trip@example.com>");

    expect(mock_list_mail_items).toHaveBeenLastCalledWith(
      expect.objectContaining({ cursor: "next" }),
    );
    expect(submitted()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ item_id: "parent", thread_token: root }),
        expect.objectContaining({ item_id: "reply", thread_token: root }),
      ]),
    );
  });

  it("groups replies whose shared parent was never imported", async () => {
    setup_mail_items([
      make_item({
        id: "first",
        encrypted_envelope: envelope({
          subject: "Re: Budget",
          message_id: "<first@example.com>",
          references: "<missing-root@example.com>",
          sent_at: "2026-01-02T00:00:00Z",
        }),
      }),
      make_item({
        id: "second",
        encrypted_envelope: envelope({
          subject: "Re: Budget",
          message_id: "<second@example.com>",
          references: "<missing-root@example.com>",
          sent_at: "2026-01-03T00:00:00Z",
        }),
      }),
    ]);

    const run = await reimport_fresh();

    await run();

    const items = submitted();

    expect(items).toHaveLength(2);
    expect(items[0].thread_token).toBe(items[1].thread_token);
  });

  it("reads message ids that have no angle brackets", async () => {
    setup_mail_items([
      make_item({
        id: "parent",
        encrypted_envelope: envelope({
          subject: "Keys",
          message_id: "<keys@example.com>",
        }),
      }),
      make_item({
        id: "reply",
        encrypted_envelope: envelope({
          subject: "Re: Keys",
          message_id: "<keys-reply@example.com>",
          in_reply_to: "keys@example.com",
          sent_at: "2026-01-02T00:00:00Z",
        }),
      }),
    ]);

    const run = await reimport_fresh();

    await run();

    const root = thread_token_from_root(USER_ID, "<keys@example.com>");

    expect(submitted()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ item_id: "reply", thread_token: root }),
      ]),
    );
  });

  it("links replies whose subject gained a list tag or a counted prefix", async () => {
    setup_mail_items([
      make_item({
        id: "parent",
        encrypted_envelope: envelope({
          subject: "Meeting notes",
          message_id: "<notes@example.com>",
        }),
      }),
      make_item({
        id: "tagged",
        encrypted_envelope: envelope({
          subject: "Re[2]: [team] Meeting notes",
          message_id: "<tagged@example.com>",
          in_reply_to: "<notes@example.com>",
          sent_at: "2026-01-02T00:00:00Z",
        }),
      }),
    ]);

    const run = await reimport_fresh();

    await run();

    const root = thread_token_from_root(USER_ID, "<notes@example.com>");

    expect(submitted()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ item_id: "tagged", thread_token: root }),
      ]),
    );
  });

  it("never reuses an import token the server cannot accept", async () => {
    setup_mail_items([
      make_item({
        id: "parent",
        thread_token: IMPORT_TOKEN,
        encrypted_envelope: envelope({
          subject: "Quote",
          message_id: "<quote@example.com>",
        }),
      }),
      make_item({
        id: "reply",
        encrypted_envelope: envelope({
          subject: "Re: Quote",
          message_id: "<quote-reply@example.com>",
          in_reply_to: "<quote@example.com>",
          sent_at: "2026-01-02T00:00:00Z",
        }),
      }),
    ]);

    const run = await reimport_fresh();

    await run();

    const root = thread_token_from_root(USER_ID, "<quote@example.com>");
    const items = submitted();

    expect(items).toHaveLength(2);
    expect(items.every((item) => item.thread_token === root)).toBe(true);
  });

  it("keeps messages the import grouped together in one conversation", async () => {
    setup_mail_items([
      make_item({
        id: "parent",
        thread_token: IMPORT_TOKEN,
        encrypted_envelope: envelope({
          subject: "Move",
          message_id: "<move@example.com>",
        }),
      }),
      make_item({
        id: "reply",
        thread_token: IMPORT_TOKEN,
        encrypted_envelope: envelope({
          subject: "Re: Move",
          message_id: "<move-reply@example.com>",
          in_reply_to: "<move@example.com>",
          sent_at: "2026-01-02T00:00:00Z",
        }),
      }),
      make_item({
        id: "headerless",
        thread_token: IMPORT_TOKEN,
        encrypted_envelope: envelope({
          subject: "Re: Move",
          sent_at: "2026-01-03T00:00:00Z",
        }),
      }),
    ]);

    const run = await reimport_fresh();

    await run({ relink_all: true });

    const root = thread_token_from_root(USER_ID, "<move@example.com>");
    const items = submitted();

    expect(items).toHaveLength(3);
    expect(items.every((item) => item.thread_token === root)).toBe(true);
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
  it("runs again after the cooldown when imported mail is still split", async () => {
    setup_mail_items([
      make_item({
        id: "parent",
        thread_token: PARENT_TOKEN,
        encrypted_envelope: envelope({
          subject: "Invoice",
          message_id: "<parent@example.com>",
        }),
      }),
      make_item({
        id: "reply",
        thread_token: REPLY_TOKEN,
        encrypted_envelope: envelope({
          subject: "Re[2]: Invoice",
          message_id: "<reply@example.com>",
          in_reply_to: "<parent@example.com>",
          sent_at: "2026-01-02T00:00:00Z",
        }),
      }),
    ]);

    const run = await reimport_fresh();

    expect(await run()).toBe(1);

    vi.advanceTimersByTime(60_000);
    mock_rethread_items.mockClear();

    expect(await run()).toBe(0);
    expect(mock_rethread_items).not.toHaveBeenCalled();
    expect(mock_decrypt_mail_envelope).toHaveBeenCalledTimes(2);
  });

  it("relinks again after the local state is reset", async () => {
    const items = [
      make_item({
        id: "parent",
        thread_token: PARENT_TOKEN,
        encrypted_envelope: envelope({
          subject: "Plans",
          message_id: "<parent@example.com>",
        }),
      }),
      make_item({
        id: "reply",
        thread_token: REPLY_TOKEN,
        encrypted_envelope: envelope({
          subject: "RE: FW: Fwd: Plans",
          message_id: "<reply@example.com>",
          references: "<parent@example.com>",
          sent_at: "2026-01-02T00:00:00Z",
        }),
      }),
    ];

    setup_mail_items(items);
    expect(await (await reimport_fresh())()).toBe(1);

    localStorage.clear();
    mock_rethread_items.mockClear();
    setup_mail_items(items);

    expect(await (await reimport_fresh())()).toBe(1);
  });

  it("runs again when new mail arrives after a settled run", async () => {
    const parent = make_item({
      id: "parent",
      thread_token: PARENT_TOKEN,
      encrypted_envelope: envelope({
        subject: "Plans",
        message_id: "<parent@example.com>",
      }),
    });

    setup_mail_items([parent]);

    const run = await reimport_fresh();

    expect(await run()).toBe(0);

    vi.advanceTimersByTime(60_000);
    setup_mail_items([
      parent,
      make_item({
        id: "reply",
        thread_token: REPLY_TOKEN,
        encrypted_envelope: envelope({
          subject: "Re:Re: Plans",
          message_id: "<reply@example.com>",
          in_reply_to: "<parent@example.com>",
          sent_at: "2026-01-02T00:00:00Z",
        }),
      }),
    ]);

    expect(await run()).toBe(1);
  });

  it("does not settle a run when the mail list could not be read", async () => {
    mock_list_mail_items.mockResolvedValueOnce({ error: "offline" });

    const run = await reimport_fresh();

    expect(await run()).toBe(0);

    vi.advanceTimersByTime(60_000);
    setup_mail_items([
      make_item({
        id: "parent",
        thread_token: PARENT_TOKEN,
        encrypted_envelope: envelope({
          subject: "Plans",
          message_id: "<parent@example.com>",
        }),
      }),
      make_item({
        id: "reply",
        thread_token: REPLY_TOKEN,
        encrypted_envelope: envelope({
          subject: "Re: Plans",
          message_id: "<reply@example.com>",
          in_reply_to: "<parent@example.com>",
          sent_at: "2026-01-02T00:00:00Z",
        }),
      }),
    ]);

    expect(await run()).toBe(1);
  });

  it("groups a reply without references when it shares a participant", async () => {
    setup_mail_items([
      make_item({
        id: "parent",
        thread_token: PARENT_TOKEN,
        encrypted_envelope: envelope({
          subject: "Quarterly report",
          message_id: "<parent@example.com>",
          from: "ana@example.com",
          to: "me@aster.cx",
          sent_at: "2026-01-01T00:00:00Z",
        }),
      }),
      make_item({
        id: "reply",
        thread_token: REPLY_TOKEN,
        encrypted_envelope: envelope({
          subject: "AW: Quarterly report",
          message_id: "<reply@example.com>",
          from: "me@aster.cx",
          to: "ana@example.com",
          sent_at: "2026-01-02T00:00:00Z",
        }),
      }),
      make_item({
        id: "stranger",
        thread_token: btoa("s".repeat(16)),
        encrypted_envelope: envelope({
          subject: "Re: Quarterly report",
          message_id: "<stranger@example.org>",
          from: "bob@example.org",
          to: "carol@example.org",
          sent_at: "2026-01-02T06:00:00Z",
        }),
      }),
    ]);

    const run = await reimport_fresh();

    expect(await run()).toBe(1);
    expect(submitted()).toEqual([
      expect.objectContaining({ item_id: "reply", thread_token: PARENT_TOKEN }),
    ]);
  });

  it("does not group a reply by subject outside the time window", async () => {
    setup_mail_items([
      make_item({
        id: "parent",
        thread_token: PARENT_TOKEN,
        encrypted_envelope: envelope({
          subject: "Status",
          message_id: "<parent@example.com>",
          from: "ana@example.com",
          sent_at: "2026-01-01T00:00:00Z",
        }),
      }),
      make_item({
        id: "reply",
        thread_token: REPLY_TOKEN,
        encrypted_envelope: envelope({
          subject: "Re: Status",
          message_id: "<reply@example.com>",
          to: "ana@example.com",
          sent_at: "2026-02-01T00:00:00Z",
        }),
      }),
    ]);

    const run = await reimport_fresh();

    expect(await run()).toBe(0);
  });

  it("lets regroup run past the cooldown and a settled state", async () => {
    setup_mail_items([
      make_item({
        id: "solo",
        encrypted_envelope: envelope({
          subject: "Welcome",
          message_id: "<solo@example.com>",
        }),
      }),
    ]);

    const mod = await reimport_module();

    expect(await mod.thread_imported_emails()).toBe(1);
    mock_list_mail_items.mockClear();

    const result = await mod.regroup_conversations();

    expect(mock_list_mail_items).toHaveBeenCalled();
    expect(result.status).toBe("linked");
  });

  it("reports a locked vault from regroup", async () => {
    mock_get_vault_from_memory.mockReturnValue(null);

    const mod = await reimport_module();

    expect(await mod.regroup_conversations()).toEqual({
      status: "locked",
      linked: 0,
    });
  });

  it("retries a scheduled run while the vault is locked", async () => {
    mock_get_vault_from_memory.mockReturnValue(null);
    setup_mail_items([
      make_item({
        id: "parent",
        thread_token: PARENT_TOKEN,
        encrypted_envelope: envelope({
          subject: "Plans",
          message_id: "<parent@example.com>",
        }),
      }),
      make_item({
        id: "reply",
        thread_token: REPLY_TOKEN,
        encrypted_envelope: envelope({
          subject: "Re: Plans",
          message_id: "<reply@example.com>",
          in_reply_to: "<parent@example.com>",
          sent_at: "2026-01-02T00:00:00Z",
        }),
      }),
    ]);

    const random_spy = vi.spyOn(Math, "random").mockReturnValue(0);

    const mod = await reimport_module();
    const on_linked = vi.fn();

    mod.schedule_thread_repair(on_linked);
    await vi.advanceTimersByTimeAsync(mod.AUTO_FIRST_DELAY_MS);
    expect(mock_list_mail_items).not.toHaveBeenCalled();

    mock_get_vault_from_memory.mockReturnValue({ identity_key: "test-key" });
    await vi.advanceTimersByTimeAsync(mod.AUTO_LOCKED_RETRY_MS * 2);

    expect(on_linked).toHaveBeenCalledWith(1);
    mod.cancel_thread_repair();
    random_spy.mockRestore();
  });

  it("keeps a single scheduled run and cancels it", async () => {
    setup_mail_items([]);

    const mod = await reimport_module();
    const on_linked = vi.fn();

    mod.schedule_thread_repair(on_linked);
    mod.schedule_thread_repair(on_linked);
    mod.cancel_thread_repair();
    await vi.advanceTimersByTimeAsync(mod.AUTO_FIRST_DELAY_MS * 4);

    expect(mock_list_mail_items).not.toHaveBeenCalled();
  });

  it("waits longer between automatic runs when nothing changed", async () => {
    setup_mail_items([]);

    const mod = await reimport_module();

    const first = mod.next_auto_delay();

    expect(first).toBeGreaterThanOrEqual(mod.AUTO_FIRST_DELAY_MS);
    expect(first).toBeLessThan(
      mod.AUTO_FIRST_DELAY_MS + mod.AUTO_FIRST_JITTER_MS,
    );

    await mod.thread_imported_emails();

    expect(mod.next_auto_delay()).toBe(mod.AUTO_IDLE_INTERVAL_MS);
  });

  it("runs the automatic walk once and records completion", async () => {
    setup_mail_items([]);

    const random_spy = vi.spyOn(Math, "random").mockReturnValue(0);

    const mod = await reimport_module();
    const on_linked = vi.fn();

    mod.schedule_thread_repair(on_linked);
    await vi.advanceTimersByTimeAsync(mod.AUTO_FIRST_DELAY_MS);

    expect(mock_list_mail_items).toHaveBeenCalledTimes(1);
    expect(mod.has_completed_auto_repair(USER_ID)).toBe(true);

    mod.schedule_thread_repair(on_linked);
    await vi.advanceTimersByTimeAsync(mod.AUTO_FIRST_DELAY_MS * 10);

    expect(mock_list_mail_items).toHaveBeenCalledTimes(1);
    random_spy.mockRestore();
  });

  it("skips the automatic walk on a later load once it completed", async () => {
    setup_mail_items([]);

    const first = await reimport_module();

    await first.thread_imported_emails();
    mock_list_mail_items.mockClear();

    const second = await reimport_module();

    second.schedule_thread_repair(vi.fn());
    await vi.advanceTimersByTimeAsync(second.AUTO_FIRST_DELAY_MS * 10);

    expect(mock_list_mail_items).not.toHaveBeenCalled();
  });

  it("remembers the last run across reloads so a new page load does not walk the mailbox again", async () => {
    setup_mail_items([]);

    const first_mod = await reimport_module();

    await first_mod.thread_imported_emails();
    mock_list_mail_items.mockClear();

    const mod = await reimport_module();
    const on_linked = vi.fn();

    expect(mod.next_auto_delay()).toBe(mod.AUTO_IDLE_INTERVAL_MS);

    mod.schedule_thread_repair(on_linked);
    await vi.advanceTimersByTimeAsync(
      mod.AUTO_FIRST_DELAY_MS + mod.AUTO_FIRST_JITTER_MS,
    );

    expect(mock_list_mail_items).not.toHaveBeenCalled();
    mod.cancel_thread_repair();
  });

  it("skips a scheduled run when another tab already ran", async () => {
    setup_mail_items([]);

    const mod = await reimport_module();
    const on_linked = vi.fn();

    mod.schedule_thread_repair(on_linked);
    localStorage.setItem(
      `aster_thread_relink_last_run:${USER_ID}`,
      String(Date.now()),
    );
    await vi.advanceTimersByTimeAsync(
      mod.AUTO_FIRST_DELAY_MS + mod.AUTO_FIRST_JITTER_MS,
    );

    expect(mock_list_mail_items).not.toHaveBeenCalled();
    mod.cancel_thread_repair();
  });
});
