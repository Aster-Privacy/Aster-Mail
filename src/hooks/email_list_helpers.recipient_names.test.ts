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
import { describe, it, expect } from "vitest";

import type { DecryptedEnvelope } from "@/types/email";
import type { MailItem } from "@/services/api/mail";

import { mail_to_email } from "./email_list_helpers";

function make_item(): MailItem {
  return {
    id: "msg-1",
    item_type: "sent",
    created_at: "2026-06-19T00:00:00.000Z",
    is_external: false,
  } as unknown as MailItem;
}

function make_envelope(to: { name: string; email: string }[]): DecryptedEnvelope {
  return {
    from: { name: "Jesper", email: "jesper@astermail.org" },
    to,
    cc: [],
    bcc: [],
    subject: "Hi",
    body_text: "Body",
    body_html: "",
  } as unknown as DecryptedEnvelope;
}

const FORMAT = { now: new Date("2026-06-19T01:00:00.000Z") } as never;

describe("mail_to_email recipient_names", () => {
  it("uses the recipient display name when present", () => {
    const email = mail_to_email(
      make_item(),
      make_envelope([{ name: "Jesper Flo", email: "jf@example.com" }]),
      null,
      FORMAT,
    );

    expect(email.recipient_names).toEqual(["Jesper Flo"]);
    expect(email.recipient_addresses).toEqual(["jf@example.com"]);
  });

  it("falls back to the address username when there is no display name", () => {
    const email = mail_to_email(
      make_item(),
      make_envelope([{ name: "", email: "jesper@example.com" }]),
      null,
      FORMAT,
    );

    expect(email.recipient_names).toEqual(["jesper"]);
  });

  it("lists every recipient in order", () => {
    const email = mail_to_email(
      make_item(),
      make_envelope([
        { name: "Alice", email: "alice@example.com" },
        { name: "", email: "bob@example.com" },
      ]),
      null,
      FORMAT,
    );

    expect(email.recipient_names).toEqual(["Alice", "bob"]);
  });

  it("leaves recipient_names empty when there are no recipients", () => {
    const email = mail_to_email(make_item(), make_envelope([]), null, FORMAT);

    expect(email.recipient_names ?? []).toEqual([]);
  });

  it("does not populate recipient_names for an undecryptable envelope", () => {
    const email = mail_to_email(make_item(), null, null, FORMAT);

    expect(email.recipient_names).toBeUndefined();
  });
});
