//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
import { describe, it, expect } from "vitest";

import { build_single_thread_message } from "@/components/email/shared/build_email_from_envelope";
import { build_reply_recipient } from "@/components/email/build_reply_recipient";
import { matches_query } from "@/hooks/use_search";
import { parse_search_query } from "@/utils/search_operators";
import type { DecryptedEnvelope, MailItemMetadata } from "@/types/email";
import type { MailItem } from "@/services/api/mail";

const ALIAS_EMAIL = "reverse_alias_718jakwi@simplelogin.co";
const ORIGINAL_EMAIL = "hi@example.com";

// A decrypted envelope exactly as the client sees it after E2EE decryption of a
// SimpleLogin-forwarded message: From is rewritten to the reverse alias, the
// real sender survives only in the X-SimpleLogin-* headers.
function forwarded_envelope(): DecryptedEnvelope {
  return {
    subject: "Your receipt",
    body_text: "Thanks for your order.",
    body_html: "",
    from: { name: "Hi Example", email: ALIAS_EMAIL },
    to: [{ name: "Me", email: "me@astermail.org" }],
    cc: [],
    bcc: [],
    sent_at: "2026-05-30T00:00:00Z",
    raw_headers: [
      { name: "From", value: `Hi Example <${ALIAS_EMAIL}>` },
      { name: "X-SimpleLogin-Type", value: "Forward" },
      {
        name: "X-SimpleLogin-Original-From",
        value: `Real Sender <${ORIGINAL_EMAIL}>`,
      },
      { name: "Message-ID", value: "<abc@simplelogin.co>" },
    ],
  };
}

function build_message() {
  return build_single_thread_message(
    {
      id: "msg-1",
      item_type: "received",
      message_ts: "2026-05-30T00:00:00Z",
      created_at: "2026-05-30T00:00:00Z",
      is_external: true,
    },
    forwarded_envelope(),
    "Thanks for your order.",
    undefined,
    { is_read: false, is_starred: false },
  );
}

function search_metadata(): MailItemMetadata {
  return {
    is_read: false,
    is_starred: false,
    is_pinned: false,
    is_trashed: false,
    is_archived: false,
    is_spam: false,
    size_bytes: 512,
    has_attachments: false,
    attachment_count: 0,
    message_ts: "2026-05-30T00:00:00Z",
    item_type: "received",
  };
}

function search(query: string, envelope: DecryptedEnvelope): boolean {
  const parsed = parse_search_query(query);
  const terms = parsed.text_query
    .split(/\s+/)
    .filter((t) => t.length >= 2)
    .map((t) => t.toLowerCase());

  return matches_query(
    terms,
    parsed.operators,
    envelope,
    search_metadata(),
    { id: "msg-1", item_type: "received" } as MailItem,
    undefined,
    undefined,
    false,
  );
}

describe("forwarded reverse-alias end-to-end flow", () => {
  it("displays the original sender while keeping the alias as the literal sender", () => {
    const msg = build_message();

    // What the user SEES is the original sender...
    expect(msg.display_sender_email).toBe(ORIGINAL_EMAIL);
    expect(msg.display_sender_name).toBe("Real Sender");
    expect(msg.forwarding_service).toBe("simplelogin");

    // ...while the literal From (the alias) is retained for routing / block / DKIM.
    expect(msg.sender_email).toBe(ALIAS_EMAIL);
    expect(msg.raw_headers?.some((h) => h.name === "X-SimpleLogin-Type")).toBe(
      true,
    );
  });

  it("routes a reply to the reverse alias, never to the original sender", () => {
    const msg = build_message();
    const is_own_message = msg.item_type === "sent";
    const is_forwarded = !is_own_message && !!msg.display_sender_email;

    const { recipient_email } = build_reply_recipient(
      {
        sender_name: msg.sender_name,
        sender_email: msg.sender_email,
        first_to: msg.to_recipients?.[0],
        // A spoofed Reply-To pointing at the original must NOT win.
        reply_to: { name: "", email: ORIGINAL_EMAIL },
        reply_alias: is_forwarded
          ? { name: msg.sender_name, email: msg.sender_email }
          : undefined,
      },
      is_own_message,
    );

    expect(recipient_email).toBe(ALIAS_EMAIL);
    expect(recipient_email).not.toBe(ORIGINAL_EMAIL);
  });

  it("attributes the reply quote to the original sender, not the alias", () => {
    const msg = build_message();

    // The reply builder sets quote_sender_* from the display fields; the modal
    // renders `quote_sender_* ?? recipient_*`. Recipient is the alias, quote is
    // the original -> the quote shows the original sender.
    const quote_sender_email = msg.display_sender_email;
    const recipient_email = msg.sender_email;
    const attribution_email = quote_sender_email || recipient_email;

    expect(attribution_email).toBe(ORIGINAL_EMAIL);
    expect(attribution_email).not.toBe(ALIAS_EMAIL);
  });

  it("finds the message when searching the original sender AND the alias", () => {
    const env = forwarded_envelope();

    expect(search("hi@example.com", env)).toBe(true);
    expect(search("from:hi@example.com", env)).toBe(true);
    expect(search(ALIAS_EMAIL, env)).toBe(true);
    expect(search("someone@unrelated.test", env)).toBe(false);
  });

  it("leaves ordinary (non-forwarded) mail untouched", () => {
    const msg = build_single_thread_message(
      {
        id: "msg-2",
        item_type: "received",
        created_at: "2026-05-30T00:00:00Z",
        is_external: true,
      },
      {
        subject: "Hello",
        body_text: "hi",
        from: { name: "Real Person", email: "real@gmail.com" },
        to: [],
        cc: [],
        bcc: [],
        sent_at: "2026-05-30T00:00:00Z",
        raw_headers: [
          { name: "From", value: "Real Person <real@gmail.com>" },
        ],
      },
      "hi",
      undefined,
      null,
    );

    expect(msg.display_sender_email).toBeUndefined();
    expect(msg.forwarding_service).toBeUndefined();
    expect(msg.sender_email).toBe("real@gmail.com");
  });
});
