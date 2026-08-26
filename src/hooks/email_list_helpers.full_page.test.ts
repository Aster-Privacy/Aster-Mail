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

function fetch_page(limit: number, offset?: number) {
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

describe("full page top-up", () => {
  beforeEach(() => {
    vi.mocked(list_mail_items).mockReset();
  });

  it("tops up a page that lost rows to client-side drops", async () => {
    vi.mocked(list_mail_items)
      .mockResolvedValueOnce(
        page(
          [
            make_item("a", false),
            make_item("b", true),
            make_item("c", false),
            make_item("d", true),
            make_item("e", false),
          ],
          true,
        ),
      )
      .mockResolvedValueOnce(
        page([make_item("f", false), make_item("g", false)], true),
      );

    const result = await fetch_page(5, 0);

    expect(result).not.toBeNull();
    expect(result!.emails.length).toBe(5);
    expect(result!.raw_consumed).toBe(7);
    expect(vi.mocked(list_mail_items)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(list_mail_items).mock.calls[1][0]).toMatchObject({
      limit: 2,
      offset: 5,
      skip_total: true,
    });
  });

  it("does not refetch when the first page is already full", async () => {
    vi.mocked(list_mail_items).mockResolvedValueOnce(
      page(
        [make_item("a", false), make_item("b", false), make_item("c", false)],
        true,
      ),
    );

    const result = await fetch_page(3, 0);

    expect(result!.emails.length).toBe(3);
    expect(result!.raw_consumed).toBe(3);
    expect(vi.mocked(list_mail_items)).toHaveBeenCalledTimes(1);
  });

  it("stops at the end of the list instead of looping", async () => {
    vi.mocked(list_mail_items).mockResolvedValueOnce(
      page([make_item("a", false), make_item("b", true)], false),
    );

    const result = await fetch_page(5, 0);

    expect(result!.emails.length).toBe(1);
    expect(result!.has_more).toBe(false);
    expect(vi.mocked(list_mail_items)).toHaveBeenCalledTimes(1);
  });

  it("bounds the number of top-up rounds", async () => {
    vi.mocked(list_mail_items).mockResolvedValue(
      page([make_item("r", true)], true),
    );

    const result = await fetch_page(5, 0);

    expect(result!.emails.length).toBe(0);
    expect(vi.mocked(list_mail_items)).toHaveBeenCalledTimes(4);
  });

  it("does not top up when paginating by cursor", async () => {
    vi.mocked(list_mail_items).mockResolvedValueOnce(
      page([make_item("a", false), make_item("b", true)], true),
    );

    const result = await fetch_page(5);

    expect(result!.emails.length).toBe(1);
    expect(vi.mocked(list_mail_items)).toHaveBeenCalledTimes(1);
  });

  it("drops duplicates the top-up round returns", async () => {
    vi.mocked(list_mail_items)
      .mockResolvedValueOnce(
        page([make_item("a", false), make_item("b", true)], true),
      )
      .mockResolvedValueOnce(
        page([make_item("a", false), make_item("c", false)], false),
      );

    const result = await fetch_page(3, 0);

    expect(result!.emails.map((e) => e.id).sort()).toEqual(["a", "c"]);
  });
});
