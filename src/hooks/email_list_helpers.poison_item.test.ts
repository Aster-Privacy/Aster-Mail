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

import { fetch_mail_from_api, mail_to_email_safe } from "./email_list_helpers";

vi.mock("@/services/api/mail", async (import_original) => {
  const original =
    await import_original<typeof import("@/services/api/mail")>();

  return {
    ...original,
    list_mail_items: vi.fn(),
  };
});

const { list_mail_items } = await import("@/services/api/mail");

function encode_envelope(envelope: unknown): string {
  return btoa(JSON.stringify(envelope));
}

function make_item(id: string, envelope: unknown): MailItem {
  return {
    id,
    item_type: "received",
    encrypted_envelope: encode_envelope(envelope),
    envelope_nonce: "",
    created_at: "2026-07-01T10:00:00Z",
    message_ts: "2026-07-01T10:00:00Z",
    is_read: false,
    is_external: false,
  } as unknown as MailItem;
}

const good_envelope = {
  from: { email: "sender@example.com", name: "Sender" },
  to: [{ email: "me@example.com" }],
  subject: "hello",
  body_text: "plain body",
  sent_at: "2026-07-01T09:59:00Z",
};

const poison_envelope = {
  from: { email: "broken@example.com" },
  to: { email: "me@example.com" },
  subject: "bad",
  body_html: 12345,
  sent_at: "2026-07-01T09:58:00Z",
};

const format_options = {
  date_format: "MM/DD/YYYY" as const,
  time_format: "12h" as const,
};

describe("poison item resilience", () => {
  beforeEach(() => {
    vi.mocked(list_mail_items).mockReset();
  });

  it("mail_to_email_safe returns a placeholder row for an unconvertible envelope", () => {
    const item = make_item("poison-1", poison_envelope);
    const email = mail_to_email_safe(
      item,
      poison_envelope as never,
      null,
      format_options,
    );

    expect(email).not.toBeNull();
    expect(email!.id).toBe("poison-1");
    expect(email!.is_encrypted).toBe(true);
  });

  it("fetch_mail_from_api keeps healthy items when one item is unconvertible", async () => {
    vi.mocked(list_mail_items).mockResolvedValue({
      data: {
        items: [
          make_item("good-1", good_envelope),
          make_item("poison-1", poison_envelope),
          make_item("good-2", good_envelope),
        ],
        total: 3,
        has_more: false,
        next_cursor: undefined,
      },
    } as never);

    const result = await fetch_mail_from_api(
      "all",
      new AbortController().signal,
      format_options,
    );

    expect(result).not.toBeNull();
    expect(result!.total).toBe(3);
    expect(result!.emails.length).toBe(3);

    const poison = result!.emails.find((e) => e.id === "poison-1");

    expect(poison).toBeDefined();
    expect(poison!.is_encrypted).toBe(true);

    const good = result!.emails.filter((e) => e.id.startsWith("good-"));

    expect(good.length).toBe(2);
    expect(good[0].subject).toBe("hello");
  });

  it("fetch_mail_from_api previously failed wholesale on a single poison item", async () => {
    vi.mocked(list_mail_items).mockResolvedValue({
      data: {
        items: [make_item("poison-1", poison_envelope)],
        total: 1,
        has_more: false,
        next_cursor: undefined,
      },
    } as never);

    const result = await fetch_mail_from_api(
      "folder-work",
      new AbortController().signal,
      format_options,
    );

    expect(result).not.toBeNull();
    expect(result!.emails.length).toBe(1);
    expect(result!.emails[0].is_encrypted).toBe(true);
  });
});
