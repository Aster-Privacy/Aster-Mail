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
  items: [] as Record<string, unknown>[],
}));

vi.mock("@/services/api/mail", () => ({
  list_mail_items: vi.fn(async () => ({
    data: {
      items: h.items,
      total: h.items.length,
      has_more: false,
      next_cursor: undefined,
    },
    error: null,
  })),
}));

vi.mock("./decrypt", () => ({
  decrypt_envelope: vi.fn(async (_encrypted: string, _nonce: string, id) => {
    if (id === "bad") throw new Error("envelope decrypt failed");

    return { subject: "readable", from: { email: "s@x.test" } };
  }),
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
  mail_to_email_safe: (
    item: { id: string; item_type: string },
    envelope: { subject?: string } | null,
  ) => ({
    id: item.id,
    subject: envelope?.subject ?? "",
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
  filter_locked_mail_items: (items: unknown[]) => items,
  is_folder_token_locked: () => false,
  request_folder_unlock: vi.fn(),
}));

const { fetch_mail_from_api } = await import("./fetch_api");

function make_item(id: string) {
  return {
    id,
    encrypted_envelope: "env",
    envelope_nonce: "nonce",
    message_ts: "2026-08-01T00:00:00Z",
    created_at: "2026-08-01T00:00:00Z",
    item_type: "received",
    is_read: false,
  };
}

describe("fetch_mail_from_api pinned ordering", () => {
  beforeEach(() => {
    h.items = [make_item("a")];
    vi.mocked(list_mail_items).mockClear();
  });

  it("requests pinned mail first for numbered pages", async () => {
    await fetch_mail_from_api(
      "starred",
      new AbortController().signal,
      {} as never,
      "me@x.test",
      50,
      undefined,
      0,
      true,
    );

    expect(vi.mocked(list_mail_items).mock.calls[0][0]).toMatchObject({
      offset: 0,
      pinned_first: true,
    });
  });

  it("requests pinned mail first when paging by cursor", async () => {
    await fetch_mail_from_api(
      "starred",
      new AbortController().signal,
      {} as never,
      "me@x.test",
      50,
      "next",
    );

    expect(vi.mocked(list_mail_items).mock.calls[0][0]).toMatchObject({
      cursor: "next",
      pinned_first: true,
    });
  });
});
