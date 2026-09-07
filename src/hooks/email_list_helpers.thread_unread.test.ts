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

import type { DecryptedEnvelope } from "@/types/email";
import type { MailItem } from "@/services/api/mail";

import { describe, it, expect } from "vitest";

import { mail_to_email } from "./email_list_helpers";

function make_item(overrides: Partial<MailItem> = {}): MailItem {
  return {
    id: "msg-1",
    item_type: "received",
    created_at: "2026-09-07T00:00:00.000Z",
    is_external: false,
    is_read: true,
    thread_token: "thread-1",
    thread_message_count: 2,
    ...overrides,
  } as unknown as MailItem;
}

function make_envelope(): DecryptedEnvelope {
  return {
    from: { name: "Annie", email: "annie@example.com" },
    to: [{ name: "Hello", email: "hello@astermail.org" }],
    cc: [],
    bcc: [],
    subject: "Hi",
    body_text: "Body",
    body_html: "",
  } as unknown as DecryptedEnvelope;
}

const FORMAT = { now: new Date("2026-09-07T01:00:00.000Z") } as never;

describe("mail_to_email thread unread siblings", () => {
  it("shows a collapsed thread row unread when an older sibling is unread", () => {
    const email = mail_to_email(
      make_item({ thread_unread_count: 1 }),
      make_envelope(),
      null,
      FORMAT,
      { collapsed_threads: true },
    );

    expect(email.is_read).toBe(false);
  });

  it("keeps the row read when the whole thread is read", () => {
    const email = mail_to_email(
      make_item({ thread_unread_count: 0 }),
      make_envelope(),
      null,
      FORMAT,
      { collapsed_threads: true },
    );

    expect(email.is_read).toBe(true);
  });

  it("ignores sibling unread state for ungrouped rows", () => {
    const email = mail_to_email(
      make_item({ thread_unread_count: 1 }),
      make_envelope(),
      null,
      FORMAT,
    );

    expect(email.is_read).toBe(true);
  });

  it("falls back to the row's own state when the server omits the count", () => {
    const email = mail_to_email(
      make_item(),
      make_envelope(),
      null,
      FORMAT,
      { collapsed_threads: true },
    );

    expect(email.is_read).toBe(true);
  });

  it("applies the same rule to rows without an envelope", () => {
    const email = mail_to_email(
      make_item({ thread_unread_count: 1 }),
      null,
      null,
      FORMAT,
      { collapsed_threads: true },
    );

    expect(email.is_read).toBe(false);
  });
});
