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

import { list_mail_items } from "@/services/api/mail";

const h = vi.hoisted(() => ({
  pages: [] as { items: Record<string, unknown>[]; has_more: boolean }[],
}));

vi.mock("@/services/api/mail", () => ({
  list_mail_items: vi.fn(async () => {
    const page = h.pages.shift() ?? { items: [], has_more: false };

    return {
      data: {
        items: page.items,
        total: 23,
        has_more: page.has_more,
        next_cursor: undefined,
      },
      error: null,
    };
  }),
}));

vi.mock("./decrypt", () => ({
  decrypt_envelope: vi.fn(async () => ({
    subject: "readable",
    from: { email: "s@x.test" },
  })),
}));

vi.mock("@/services/crypto/mail_metadata", () => ({
  decrypt_mail_metadata: vi.fn(async () => null),
}));

vi.mock("@/utils/email_crypto", () => ({
  decrypt_body_text_with_bundle: vi.fn(async (body: string) => ({
    body,
    subject: null,
  })),
}));

vi.mock("./mapping", () => ({
  mail_to_email_safe: (item: { id: string; item_type: string }) => ({
    id: item.id,
    subject: "",
    item_type: item.item_type,
    is_trashed: false,
    is_spam: false,
    is_archived: false,
    snoozed_until: null,
  }),
}));

vi.mock("@/services/api/sender_profiles", () => ({
  resolve_sender_profiles: vi.fn(async () => undefined),
}));

vi.mock("@/services/locked_folders", () => ({
  filter_locked_mail_items: (items: Record<string, unknown>[]) =>
    items.filter((item) => item.locked !== true),
  is_folder_token_locked: () => false,
  request_folder_unlock: vi.fn(),
}));

const { fetch_mail_from_api } = await import("./fetch_api");

function make_item(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    encrypted_envelope: "env",
    envelope_nonce: "nonce",
    message_ts: "2026-08-01T00:00:00Z",
    created_at: "2026-08-01T00:00:00Z",
    item_type: "received",
    is_read: false,
    ...extra,
  };
}

function fetch_page(options?: { is_read?: boolean }) {
  return fetch_mail_from_api(
    "starred",
    new AbortController().signal,
    {} as never,
    "me@x.test",
    2,
    undefined,
    0,
    true,
    "newest_first",
    undefined,
    options,
  );
}

describe("fetch_mail_from_api read filter", () => {
  beforeEach(() => {
    h.pages = [{ items: [make_item("a")], has_more: false }];
    vi.mocked(list_mail_items).mockClear();
  });

  it("sends no read state unless a filter is active", async () => {
    await fetch_page();

    expect(vi.mocked(list_mail_items).mock.calls[0][0]).not.toHaveProperty(
      "is_read",
    );
  });

  it("asks the server for unread mail only", async () => {
    const result = await fetch_page({ is_read: false });

    expect(vi.mocked(list_mail_items).mock.calls[0][0]).toMatchObject({
      is_read: false,
      offset: 0,
    });
    expect(result?.total).toBe(23);
  });

  it("asks the server for read mail only", async () => {
    await fetch_page({ is_read: true });

    expect(vi.mocked(list_mail_items).mock.calls[0][0]).toMatchObject({
      is_read: true,
    });
  });

  it("keeps the read state on the requests that top a short page up", async () => {
    h.pages = [
      {
        items: [make_item("a"), make_item("hidden", { locked: true })],
        has_more: true,
      },
      { items: [make_item("b")], has_more: false },
    ];

    const result = await fetch_page({ is_read: false });

    expect(vi.mocked(list_mail_items).mock.calls).toHaveLength(2);
    expect(vi.mocked(list_mail_items).mock.calls[1][0]).toMatchObject({
      is_read: false,
      offset: 2,
    });
    expect(result?.emails.map((e) => e.id).sort()).toEqual(["a", "b"]);
  });
});
