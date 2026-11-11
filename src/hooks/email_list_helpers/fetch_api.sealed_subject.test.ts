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

const h = vi.hoisted(() => ({
  items: [] as Record<string, unknown>[],
  served_subject: "Served subject",
  sealed: true,
  sealed_subject: "Sealed subject" as string | null,
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
    subject: h.served_subject,
    body_text: `body of ${encrypted}`,
    from: { email: "sender@example.test", name: "Sender" },
  })),
}));

vi.mock("@/services/crypto/mail_metadata", () => ({
  decrypt_mail_metadata: vi.fn(async () => ({
    is_read: false,
    is_starred: false,
  })),
}));

vi.mock("@/utils/email_crypto", () => ({
  decrypt_body_text_with_bundle: vi.fn(async (body: string) => ({
    body,
    subject: h.sealed_subject,
    sealed: h.sealed,
  })),
}));

vi.mock("./mapping", () => ({
  summarize_list_body: (_id: string, envelope: { body_text?: string }) => ({
    preview: envelope.body_text ?? "",
    is_undecryptable: false,
  }),
  mail_to_email_safe: (
    item: { id: string; item_type: string },
    envelope: { subject?: string } | null,
  ) => ({
    id: item.id,
    subject: envelope?.subject ?? "",
    preview: "",
    item_type: item.item_type,
    is_read: false,
    is_starred: false,
    folders: [],
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
const { clear_mail_cache } = await import("@/hooks/email_list_cache");
const { settle_bundle_subject } =
  await import("@/services/crypto/sealed_message_fields");

function make_item() {
  const ts = new Date(Date.UTC(2026, 10, 1)).toISOString();

  return {
    id: "m1",
    encrypted_envelope: "env-1",
    envelope_nonce: "nonce-1",
    encrypted_metadata: "meta-1",
    metadata_nonce: "meta-nonce-1",
    metadata_version: 1,
    message_ts: ts,
    created_at: ts,
    item_type: "received",
    is_read: false,
  };
}

async function row_subject(): Promise<string> {
  const result = await fetch_mail_from_api(
    "inbox",
    new AbortController().signal,
    {} as never,
    "me@example.test",
    10,
    undefined,
    0,
    false,
  );

  return result!.emails[0].subject;
}

describe("list row subject for sealed mail", () => {
  beforeEach(() => {
    clear_mail_cache();
    h.items = [make_item()];
    h.served_subject = "Served subject";
    h.sealed = true;
    h.sealed_subject = "Sealed subject";
  });

  it("shows the sealed subject when the served one differs", async () => {
    expect(await row_subject()).toBe("Sealed subject");
  });

  it("keeps an empty sealed subject", async () => {
    h.sealed_subject = "";

    expect(await row_subject()).toBe("");
  });

  it("keeps the served subject when the body is not sealed", async () => {
    h.sealed = false;

    expect(await row_subject()).toBe("Served subject");
  });

  it("fills a missing subject from a body that is not sealed", async () => {
    h.sealed = false;
    h.served_subject = "";

    expect(await row_subject()).toBe("Sealed subject");
  });

  it("leaves the subject alone when the body carries none", async () => {
    h.sealed_subject = null;

    expect(await row_subject()).toBe("Served subject");
  });
});

describe("settle_bundle_subject", () => {
  it("prefers the sealed subject", () => {
    const envelope = { subject: "Served" };

    settle_bundle_subject(envelope, { subject: "Sealed", sealed: true });

    expect(envelope.subject).toBe("Sealed");
  });

  it("treats a missing flag as not sealed", () => {
    const envelope = { subject: "Served" };

    settle_bundle_subject(envelope, { subject: "Other" });

    expect(envelope.subject).toBe("Served");
  });
});
