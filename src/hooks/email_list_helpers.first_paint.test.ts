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

const { list_mail_items } = await import("@/services/api/mail");

function make_item(id: string, is_reaction: boolean): MailItem {
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
    is_reaction,
  } as unknown as MailItem;
}

function page(items: MailItem[], has_more: boolean, total = -1) {
  return {
    data: { items, total, has_more, next_cursor: undefined },
  } as never;
}

const format_options = {
  date_format: "MM/DD/YYYY" as const,
  time_format: "12h" as const,
};

function fetch_page(
  limit: number,
  offset: number | undefined,
  on_partial?: (emails: { id: string }[]) => void,
) {
  return fetch_mail_from_api(
    "all",
    new AbortController().signal,
    format_options,
    "me@example.com",
    limit,
    undefined,
    offset,
    false,
    "newest_first",
    on_partial,
  );
}

describe("first paint before the full page decrypts", () => {
  beforeEach(() => {
    vi.mocked(list_mail_items).mockReset();
  });

  it("emits the head of a large page before returning the whole page", async () => {
    const items = Array.from({ length: 40 }, (_, i) =>
      make_item(`m${i}`, false),
    );

    vi.mocked(list_mail_items).mockResolvedValueOnce(page(items, false));

    const partials: number[] = [];
    const result = await fetch_page(40, 0, (emails) =>
      partials.push(emails.length),
    );

    expect(partials).toEqual([15]);
    expect(result!.emails.length).toBe(40);
  });

  it("emits the first batch before running top-up rounds", async () => {
    vi.mocked(list_mail_items)
      .mockResolvedValueOnce(
        page([make_item("a", false), make_item("b", true)], true),
      )
      .mockResolvedValueOnce(page([make_item("c", false)], false));

    const partials: string[][] = [];
    const result = await fetch_page(2, 0, (emails) =>
      partials.push(emails.map((e) => e.id)),
    );

    expect(partials).toEqual([["a"]]);
    expect(result!.emails.map((e) => e.id).sort()).toEqual(["a", "c"]);
  });

  it("does not emit when the page is small and full", async () => {
    vi.mocked(list_mail_items).mockResolvedValueOnce(
      page([make_item("a", false), make_item("b", false)], true),
    );

    const on_partial = vi.fn();
    const result = await fetch_page(2, 0, on_partial);

    expect(on_partial).not.toHaveBeenCalled();
    expect(result!.emails.length).toBe(2);
  });
});
