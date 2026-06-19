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
import { RATCHET_UNDECRYPTABLE_SENTINEL } from "@/utils/email_crypto";

const RAW_RATCHET_ENVELOPE = JSON.stringify({
  type: "double_ratchet_v2",
  sender_identity_key: "AAAA",
  recipients: { "me@astermail.org": { header: {}, ciphertext: "BBBB" } },
});

function make_item(): MailItem {
  return {
    id: "msg-1",
    created_at: "2026-06-19T00:00:00.000Z",
    is_external: false,
  } as unknown as MailItem;
}

function make_envelope(
  body_text: string,
  body_html: string,
): DecryptedEnvelope {
  return {
    from: { name: "Superhuman", email: "support@aster.cx" },
    to: [{ name: "", email: "me@astermail.org" }],
    cc: [],
    bcc: [],
    subject: "Password Issues when making changes",
    body_text,
    body_html,
  } as unknown as DecryptedEnvelope;
}

const FORMAT = { now: new Date("2026-06-19T01:00:00.000Z") } as never;

describe("mail_to_email ratchet preview", () => {
  it("shows the decrypted text, not the undecryptable sentinel, when body_html is still a raw ratchet envelope", () => {
    // Internal ratchet mail stores the SAME envelope in body_text and
    // body_html. The list path decrypts only body_text; body_html stays raw.
    const email = mail_to_email(
      make_item(),
      make_envelope("Hello, I am not sure whats going on", RAW_RATCHET_ENVELOPE),
      null,
      FORMAT,
    );

    expect(email.preview).not.toBe(RATCHET_UNDECRYPTABLE_SENTINEL);
    expect(email.preview).toContain("Hello, I am not sure");
  });

  it("still shows the sentinel when the decrypted text itself failed", () => {
    const email = mail_to_email(
      make_item(),
      make_envelope(RATCHET_UNDECRYPTABLE_SENTINEL, RAW_RATCHET_ENVELOPE),
      null,
      FORMAT,
    );

    expect(email.preview).toBe(RATCHET_UNDECRYPTABLE_SENTINEL);
  });

  it("shows the sentinel when there is no decrypted text and only a raw ratchet html body", () => {
    const email = mail_to_email(
      make_item(),
      make_envelope("", RAW_RATCHET_ENVELOPE),
      null,
      FORMAT,
    );

    expect(email.preview).toBe(RATCHET_UNDECRYPTABLE_SENTINEL);
  });
});
