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
import type { MailItem } from "@/services/api/mail";

import { describe, it, expect, vi, beforeEach } from "vitest";

import { fetch_mail_from_api } from "./email_list_helpers";

vi.mock("@/services/api/mail", async (import_original) => {
  const original =
    await import_original<typeof import("@/services/api/mail")>();

  return {
    ...original,
    list_mail_items: vi.fn(),
  };
});

vi.mock("@/services/locked_folders", async (import_original) => {
  const original =
    await import_original<typeof import("@/services/locked_folders")>();

  return {
    ...original,
    get_locked_folder_tokens: () => new Set(["vault"]),
    is_folder_token_locked: (token: string) => token === "vault",
    is_mail_item_locked: (item: { folder_token?: string }) =>
      item.folder_token === "vault",
    filter_locked_mail_items: <T extends { folder_token?: string }>(
      items: T[],
    ): T[] => items.filter((item) => item.folder_token !== "vault"),
  };
});

const { list_mail_items } = await import("@/services/api/mail");

function make_item(id: string, locked: boolean): MailItem {
  const envelope = {
    from: { email: `${id}@example.com`, name: id },
    to: [{ email: "me@example.com" }],
    subject: `subject ${id}`,
    body_text: `body ${id}`,
    sent_at: "2026-07-01T09:59:00Z",
  };

  return {
    id,
    item_type: "received",
    encrypted_envelope: btoa(JSON.stringify(envelope)),
    envelope_nonce: "",
    created_at: "2026-07-01T10:00:00Z",
    message_ts: "2026-07-01T10:00:00Z",
    is_read: false,
    is_external: false,
    is_reaction: false,
    ...(locked ? { folder_token: "vault" } : {}),
  } as unknown as MailItem;
}

function page(items: MailItem[], has_more: boolean) {
  return {
    data: { items, total: -1, has_more, next_cursor: undefined },
  } as never;
}

const format_options = {
  date_format: "MM/DD/YYYY" as const,
  time_format: "12h" as const,
};

function fetch_page(limit: number, offset: number) {
  return fetch_mail_from_api(
    "all",
    new AbortController().signal,
    format_options,
    "me@example.com",
    limit,
    undefined,
    offset,
    false,
  );
}

describe("locked folder mail during a top-up", () => {
  beforeEach(() => {
    vi.mocked(list_mail_items).mockReset();
  });

  it("never shows a locked message pulled in by the top-up request", async () => {
    vi.mocked(list_mail_items)
      .mockResolvedValueOnce(page([make_item("a", false)], true))
      .mockResolvedValueOnce(
        page([make_item("secret", true), make_item("b", false)], true),
      );

    const result = await fetch_page(2, 0);

    expect(result).not.toBeNull();
    expect(result!.emails.map((e) => e.id)).toEqual(["a", "b"]);
  });

  it("advances the server offset by the rows the server actually returned", async () => {
    vi.mocked(list_mail_items)
      .mockResolvedValueOnce(
        page([make_item("secret", true), make_item("a", false)], true),
      )
      .mockResolvedValueOnce(page([make_item("b", false)], true));

    const result = await fetch_page(2, 0);

    expect(result).not.toBeNull();
    expect(result!.raw_consumed).toBe(3);
  });
});
