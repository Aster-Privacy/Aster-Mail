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

async function first_request(
  view: string,
  conversation_grouping: boolean,
  offset?: number,
  cursor?: string,
) {
  await fetch_mail_from_api(
    view,
    new AbortController().signal,
    {} as never,
    "me@x.test",
    100,
    cursor,
    offset,
    conversation_grouping,
  );

  return vi.mocked(list_mail_items).mock.calls[0][0];
}

describe("fetch_mail_from_api conversation pages", () => {
  beforeEach(() => {
    h.items = [make_item("a")];
    vi.mocked(list_mail_items).mockClear();
  });

  it("asks for one row per conversation on numbered pages", async () => {
    expect(await first_request("starred", true, 4600)).toMatchObject({
      offset: 4600,
      group_by_thread: true,
      thread_pages: true,
    });
  });

  it("asks for one row per conversation when paging by cursor", async () => {
    expect(
      await first_request("starred", true, undefined, "next"),
    ).toMatchObject({ cursor: "next", thread_pages: true });
  });

  it("keeps message pages when grouping is off", async () => {
    const params = await first_request("starred", false, 0);

    expect(params).toMatchObject({ group_by_thread: false });
    expect(params?.thread_pages).toBeUndefined();
  });

  it("keeps message pages for views that never group", async () => {
    const params = await first_request("scheduled", true, 0);

    expect(params?.thread_pages).toBeUndefined();
  });
});
