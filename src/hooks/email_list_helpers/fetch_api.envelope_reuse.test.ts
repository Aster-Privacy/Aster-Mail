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

interface ListCall {
  ids?: string[];
  include_envelope?: boolean;
}

const h = vi.hoisted(() => ({
  items: [] as Record<string, unknown>[],
  fail_batch: false,
  hide_from_batch: new Set<string>(),
  response_chars: 0,
}));

vi.mock("@/services/api/mail", () => ({
  list_mail_items: vi.fn(async (params: ListCall) => {
    if (params.ids && h.fail_batch) {
      return { data: null, error: "failed" };
    }

    const source = params.ids
      ? h.items.filter(
          (item) =>
            params.ids!.includes(item.id as string) &&
            !h.hide_from_batch.has(item.id as string),
        )
      : h.items;
    const items = source.map((item) =>
      params.include_envelope === false
        ? { ...item, encrypted_envelope: "", envelope_nonce: "" }
        : { ...item },
    );

    h.response_chars += JSON.stringify(items).length;

    return {
      data: {
        items,
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
    subject: `subject of ${encrypted.slice(0, 12)}`,
    body_text: `body of ${encrypted.slice(0, 12)}`,
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
      encrypted_envelope?: string;
    },
    envelope: { subject?: string; body_text?: string } | null,
    metadata: { is_starred?: boolean } | null,
    _format_options: unknown,
    options?: { body_summary?: { preview: string }; envelope_chars?: number },
  ) => ({
    id: item.id,
    subject: envelope?.subject ?? "",
    preview: options?.body_summary?.preview ?? envelope?.body_text ?? "",
    item_type: item.item_type,
    is_read: item.is_read ?? false,
    is_starred: metadata?.is_starred ?? false,
    size_bytes: Math.ceil(
      (options?.envelope_chars ?? item.encrypted_envelope?.length ?? 0) * 0.75,
    ),
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
const { clear_list_decrypt_cache } = await import("./decrypt_cache");
const { decrypt_envelope } = await import("./decrypt");
const { list_mail_items } = await import("@/services/api/mail");

const ROW_COUNT = 50;
const ENVELOPE_PADDING = "x".repeat(4000);

function make_item(index: number, item_type = "received") {
  const ts = new Date(Date.UTC(2026, 7, 1) - index * 60_000).toISOString();

  return {
    id: `m${index}`,
    encrypted_envelope: `env-${index}-${ENVELOPE_PADDING}`,
    envelope_nonce: `nonce-${index}`,
    encrypted_metadata: `meta-${index}`,
    metadata_nonce: `meta-nonce-${index}`,
    metadata_version: 1,
    message_ts: ts,
    created_at: ts,
    item_type,
    is_read: false,
  };
}

async function fetch_view(
  view: string,
  reuse_known_envelopes: boolean,
): Promise<InboxEmail[]> {
  const result = await fetch_mail_from_api(
    view,
    new AbortController().signal,
    {} as never,
    "me@example.test",
    ROW_COUNT + 10,
    undefined,
    0,
    false,
    "newest_first",
    undefined,
    { reuse_known_envelopes },
  );

  return result!.emails;
}

function list_calls(): ListCall[] {
  return vi.mocked(list_mail_items).mock.calls.map((call) => call[0] ?? {});
}

function reset_calls() {
  vi.mocked(list_mail_items).mockClear();
  vi.mocked(decrypt_envelope).mockClear();
  h.response_chars = 0;
}

describe("silent refresh without envelopes", () => {
  beforeEach(() => {
    clear_list_decrypt_cache();
    h.items = Array.from({ length: ROW_COUNT }, (_, i) => make_item(i));
    h.fail_batch = false;
    h.hide_from_batch = new Set();
    reset_calls();
  });

  it("downloads full envelopes when nothing is known yet", async () => {
    const emails = await fetch_view("inbox", true);

    expect(emails).toHaveLength(ROW_COUNT);
    expect(list_calls()).toHaveLength(1);
    expect(list_calls()[0].include_envelope).toBeUndefined();
  });

  it("keeps the full listing when reuse is not requested", async () => {
    await fetch_view("inbox", false);
    reset_calls();

    await fetch_view("inbox", false);

    expect(list_calls()).toHaveLength(1);
    expect(list_calls()[0].include_envelope).toBeUndefined();
  });

  it("returns the same rows from a listing without envelopes", async () => {
    const first = await fetch_view("inbox", false);
    const full_chars = h.response_chars;

    reset_calls();

    const second = await fetch_view("inbox", true);

    expect(list_calls()).toHaveLength(1);
    expect(list_calls()[0].include_envelope).toBe(false);
    expect(decrypt_envelope).not.toHaveBeenCalled();
    expect(second).toEqual(first);
    expect(h.response_chars).toBeLessThan(full_chars / 10);
  });

  it("fetches only the new message when one arrives", async () => {
    const first = await fetch_view("inbox", false);

    h.items = [make_item(-1), ...h.items];
    reset_calls();

    const second = await fetch_view("inbox", true);
    const calls = list_calls();

    expect(calls).toHaveLength(2);
    expect(calls[0].include_envelope).toBe(false);
    expect(calls[1].ids).toEqual(["m-1"]);
    expect(decrypt_envelope).toHaveBeenCalledTimes(1);
    expect(second[0].id).toBe("m-1");
    expect(second[0].subject).toBe("subject of env--1-xxxxx");
    expect(second.slice(1)).toEqual(first);

    reset_calls();
    await fetch_view("inbox", true);

    expect(list_calls()).toHaveLength(1);
  });

  it("picks up read state and metadata changes from another client", async () => {
    await fetch_view("inbox", false);

    h.items[3] = { ...h.items[3], is_read: true };
    h.items[5] = {
      ...h.items[5],
      encrypted_metadata: "meta-5-starred",
      metadata_nonce: "meta-nonce-5b",
    };
    reset_calls();

    const second = await fetch_view("inbox", true);
    const calls = list_calls();

    expect(calls).toHaveLength(2);
    expect(calls[1].ids).toEqual(["m5"]);
    expect(second[3].is_read).toBe(true);
    expect(second[5].is_starred).toBe(true);
  });

  it("drops a message that left the view", async () => {
    await fetch_view("inbox", false);

    h.items = h.items.filter((item) => item.id !== "m7");
    reset_calls();

    const second = await fetch_view("inbox", true);

    expect(second).toHaveLength(ROW_COUNT - 1);
    expect(second.some((email) => email.id === "m7")).toBe(false);
    expect(list_calls()).toHaveLength(1);
  });

  it("always fetches the envelope of a message that is not received mail", async () => {
    h.items[2] = make_item(2, "sent");
    await fetch_view("all", false);
    reset_calls();

    const second = await fetch_view("all", true);
    const calls = list_calls();

    expect(calls).toHaveLength(2);
    expect(calls[1].ids).toEqual(["m2"]);
    expect(second[2].subject).toBe("subject of env-2-xxxxxx");
  });

  it("falls back to the full listing when envelopes cannot be fetched", async () => {
    const first = await fetch_view("inbox", false);

    h.items = [make_item(-1), ...h.items];
    h.fail_batch = true;
    reset_calls();

    const second = await fetch_view("inbox", true);
    const calls = list_calls();

    expect(calls).toHaveLength(3);
    expect(calls[2].include_envelope).toBeUndefined();
    expect(calls[2].ids).toBeUndefined();
    expect(second[0].id).toBe("m-1");
    expect(second.slice(1)).toEqual(first);
  });

  it("falls back to the full listing when an envelope is missing", async () => {
    await fetch_view("inbox", false);

    h.items = [make_item(-1), ...h.items];
    h.hide_from_batch = new Set(["m-1"]);
    reset_calls();

    const second = await fetch_view("inbox", true);
    const calls = list_calls();

    expect(calls[calls.length - 1].include_envelope).toBeUndefined();
    expect(second).toHaveLength(ROW_COUNT + 1);
    expect(second[0].subject).toBe("subject of env--1-xxxxx");
  });

  it("splits unknown envelopes into batches the server accepts", async () => {
    await fetch_view("inbox", false);

    h.items = [
      ...Array.from({ length: 150 }, (_, i) => make_item(-1 - i)).reverse(),
      ...h.items,
    ];
    reset_calls();

    const result = await fetch_mail_from_api(
      "inbox",
      new AbortController().signal,
      {} as never,
      "me@example.test",
      300,
      undefined,
      0,
      false,
      "newest_first",
      undefined,
      { reuse_known_envelopes: true },
    );
    const calls = list_calls();

    expect(calls).toHaveLength(3);
    expect(calls[1].ids).toHaveLength(100);
    expect(calls[2].ids).toHaveLength(50);
    expect(result!.emails).toHaveLength(ROW_COUNT + 150);
  });

  it("keeps the full listing for outgoing views", async () => {
    await fetch_view("inbox", false);
    h.items = h.items.map((_item, i) => make_item(i, "sent"));
    reset_calls();

    await fetch_view("sent", true);

    expect(list_calls()).toHaveLength(1);
    expect(list_calls()[0].include_envelope).toBeUndefined();
  });

  it("does not reuse rows cached for another account", async () => {
    await fetch_view("inbox", false);
    reset_calls();

    await fetch_mail_from_api(
      "inbox",
      new AbortController().signal,
      {} as never,
      "other@example.test",
      ROW_COUNT + 10,
      undefined,
      0,
      false,
      "newest_first",
      undefined,
      { reuse_known_envelopes: true },
    );

    const calls = list_calls();

    expect(calls).toHaveLength(2);
    expect(calls[1].ids).toHaveLength(ROW_COUNT);
    expect(decrypt_envelope).toHaveBeenCalledTimes(ROW_COUNT);
  });
});
