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
import type { InboxEmail } from "@/types/email";

import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  items: [] as Record<string, unknown>[],
}));

vi.mock("@/services/api/mail", () => ({
  list_mail_items: vi.fn(async (params: { ids?: string[] }) => {
    const items = params.ids
      ? h.items.filter((item) => params.ids!.includes(item.id as string))
      : h.items;

    return {
      data: {
        items: items.map((item) => ({ ...item })),
        total: items.length,
        has_more: false,
        next_cursor: undefined,
      },
      error: null,
    };
  }),
}));

vi.mock("./decrypt", () => ({
  decrypt_envelope: vi.fn(async (encrypted: string) => ({
    subject: `subject of ${encrypted}`,
    body_text: `body of ${encrypted}`,
    from: { email: "sender@example.test", name: "Sender" },
  })),
}));

vi.mock("@/services/crypto/mail_metadata", () => ({
  decrypt_mail_metadata: vi.fn(async (encrypted: string) => ({
    is_read: false,
    is_starred: encrypted.endsWith("starred"),
  })),
}));

vi.mock("@/utils/email_crypto", () => ({
  decrypt_body_text_with_bundle: vi.fn(async (body: string) => ({
    body,
    subject: null,
  })),
}));

vi.mock("./mapping", () => ({
  summarize_list_body: (_id: string, envelope: { body_text?: string }) => ({
    preview: envelope.body_text ?? "",
    is_undecryptable: false,
  }),
  mail_to_email_safe: (
    item: {
      id: string;
      item_type: string;
      is_read?: boolean;
      labels?: { token: string }[];
    },
    envelope: { subject?: string; body_text?: string } | null,
    metadata: { is_starred?: boolean } | null,
    _format_options: unknown,
    options?: { body_summary?: { preview: string } },
  ) => ({
    id: item.id,
    subject: envelope?.subject ?? "",
    preview: options?.body_summary?.preview ?? envelope?.body_text ?? "",
    item_type: item.item_type,
    is_read: item.is_read ?? false,
    is_starred: metadata?.is_starred ?? false,
    folders: (item.labels ?? []).map((label) => ({
      folder_token: label.token,
    })),
    is_pinned: false,
    is_trashed: false,
    is_spam: false,
    is_archived: false,
    snoozed_until: undefined,
  }),
}));

vi.mock("@/services/api/sender_profiles", () => ({
  resolve_sender_profiles: vi.fn(async () => undefined),
}));

vi.mock("@/services/locked_folders", () => ({
  filter_locked_mail_items: (items: unknown[]) => items,
  is_folder_token_locked: () => false,
  request_folder_unlock: vi.fn(),
}));

const { fetch_mail_from_api } = await import("./fetch_api");
const { fetch_mail_by_ids_reconciled } = await import("./fetch_ids");
const { merge_silent_refresh_emails } = await import("./silent_refresh");
const { decrypt_envelope } = await import("./decrypt");
const { decrypt_body_text_with_bundle } = await import("@/utils/email_crypto");
const { decrypt_mail_metadata } =
  await import("@/services/crypto/mail_metadata");
const { clear_mail_cache } = await import("@/hooks/email_list_cache");
const { clear_vault_from_memory } =
  await import("@/services/crypto/memory_key_store");

const ROW_COUNT = 50;

function make_item(index: number) {
  const ts = new Date(Date.UTC(2026, 7, 1) - index * 60_000).toISOString();

  return {
    id: `m${index}`,
    encrypted_envelope: `env-${index}`,
    envelope_nonce: `nonce-${index}`,
    encrypted_metadata: `meta-${index}`,
    metadata_nonce: `meta-nonce-${index}`,
    metadata_version: 1,
    message_ts: ts,
    created_at: ts,
    item_type: "received",
    is_read: false,
  };
}

function decrypt_counts() {
  return {
    envelopes: vi.mocked(decrypt_envelope).mock.calls.length,
    metadata: vi.mocked(decrypt_mail_metadata).mock.calls.length,
  };
}

function reset_counts() {
  vi.mocked(decrypt_envelope).mockClear();
  vi.mocked(decrypt_mail_metadata).mockClear();
}

async function refresh(): Promise<InboxEmail[]> {
  const result = await fetch_mail_from_api(
    "inbox",
    new AbortController().signal,
    {} as never,
    "me@example.test",
    ROW_COUNT + 10,
    undefined,
    0,
    false,
  );

  return result!.emails;
}

describe("list refresh decrypt cache", () => {
  beforeEach(() => {
    clear_mail_cache();
    h.items = Array.from({ length: ROW_COUNT }, (_, i) => make_item(i));
    reset_counts();
  });

  it("does not decrypt again or replace rows when nothing changed", async () => {
    const first = merge_silent_refresh_emails([], await refresh(), Date.now());

    expect(first).toHaveLength(ROW_COUNT);
    expect(decrypt_counts()).toEqual({
      envelopes: ROW_COUNT,
      metadata: ROW_COUNT,
    });

    reset_counts();

    const second = merge_silent_refresh_emails(
      first,
      await refresh(),
      Date.now(),
    );

    expect(decrypt_counts()).toEqual({ envelopes: 0, metadata: 0 });
    expect(second).toHaveLength(ROW_COUNT);
    expect(second.every((row, index) => row === first[index])).toBe(true);
  });

  it("decrypts only the new message when one arrives", async () => {
    const first = merge_silent_refresh_emails([], await refresh(), Date.now());

    h.items = [make_item(-1), ...h.items];
    reset_counts();

    const second = merge_silent_refresh_emails(
      first,
      await refresh(),
      Date.now(),
    );

    expect(decrypt_counts()).toEqual({ envelopes: 1, metadata: 1 });
    expect(second[0].id).toBe("m-1");
    expect(second.slice(1).every((row, index) => row === first[index])).toBe(
      true,
    );
  });

  it("shows read, folder and starred changes from another client", async () => {
    const first = merge_silent_refresh_emails([], await refresh(), Date.now());

    h.items[3] = { ...h.items[3], is_read: true };
    h.items[4] = { ...h.items[4], labels: [{ token: "work" }] };
    h.items[5] = {
      ...h.items[5],
      encrypted_metadata: "meta-5-starred",
      metadata_nonce: "meta-nonce-5b",
    };
    reset_counts();

    const second = merge_silent_refresh_emails(
      first,
      await refresh(),
      Date.now(),
    );

    expect(decrypt_counts()).toEqual({ envelopes: 1, metadata: 1 });
    expect(second[3].is_read).toBe(true);
    expect(second[3]).not.toBe(first[3]);
    expect(second[4].folders).toEqual([{ folder_token: "work" }]);
    expect(second[4]).not.toBe(first[4]);
    expect(second[5].is_starred).toBe(true);
    expect(second[5]).not.toBe(first[5]);
    expect(second[6]).toBe(first[6]);
  });

  it("drops a message deleted elsewhere", async () => {
    const first = merge_silent_refresh_emails([], await refresh(), Date.now());

    h.items = h.items.filter((item) => item.id !== "m2");

    const second = merge_silent_refresh_emails(
      first,
      await refresh(),
      Date.now(),
    );

    expect(second.map((row) => row.id)).not.toContain("m2");
    expect(second).toHaveLength(ROW_COUNT - 1);
  });

  it("decrypts again when the envelope ciphertext changes", async () => {
    await refresh();

    h.items[0] = {
      ...h.items[0],
      encrypted_envelope: "env-0-edited",
      envelope_nonce: "nonce-0b",
    };
    reset_counts();

    const rows = await refresh();

    expect(decrypt_counts().envelopes).toBe(1);
    expect(rows[0].subject).toBe("subject of env-0-edited");
  });

  it("decrypts again after the vault is cleared", async () => {
    await refresh();

    clear_vault_from_memory();
    reset_counts();
    await refresh();

    expect(decrypt_counts()).toEqual({
      envelopes: ROW_COUNT,
      metadata: ROW_COUNT,
    });
  });

  it("decrypts again after the mail cache is cleared", async () => {
    await refresh();

    clear_mail_cache();
    reset_counts();
    await refresh();

    expect(decrypt_counts().envelopes).toBe(ROW_COUNT);
  });

  it("does not keep an envelope that failed to decrypt", async () => {
    vi.mocked(decrypt_envelope).mockResolvedValueOnce(null);

    await refresh();
    reset_counts();
    await refresh();

    expect(decrypt_counts().envelopes).toBe(1);
  });

  it("does not keep a body whose PGP block could not be decrypted yet", async () => {
    vi.mocked(decrypt_body_text_with_bundle).mockResolvedValueOnce({
      body: "list footer",
      subject: null,
      pgp_undecrypted: true,
    });

    await refresh();
    reset_counts();
    await refresh();

    expect(decrypt_counts().envelopes).toBe(1);
  });

  it("does not keep a by-id body whose PGP block could not be decrypted yet", async () => {
    vi.mocked(decrypt_body_text_with_bundle).mockResolvedValueOnce({
      body: "list footer",
      subject: null,
      pgp_undecrypted: true,
    });

    await fetch_mail_by_ids_reconciled(["m0"], {} as never, "me@example.test");
    reset_counts();
    await fetch_mail_by_ids_reconciled(["m0"], {} as never, "me@example.test");

    expect(decrypt_counts().envelopes).toBe(1);
  });

  it("reuses the same results when fetching by id", async () => {
    await refresh();
    reset_counts();

    const result = await fetch_mail_by_ids_reconciled(
      ["m0", "m1"],
      {} as never,
      "me@example.test",
    );

    expect(decrypt_counts()).toEqual({ envelopes: 0, metadata: 0 });
    expect(result.emails.map((row) => row.subject)).toEqual([
      "subject of env-0",
      "subject of env-1",
    ]);
  });
});
