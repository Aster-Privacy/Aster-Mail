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
import type { DecryptedEnvelope, MailItemMetadata } from "@/types/email";
import type { MailItem } from "@/services/api/mail";

import { describe, it, expect } from "vitest";

import { matches_query } from "@/hooks/use_search";
import { parse_search_query } from "@/utils/search_operators";
import { build_sender_mail_query } from "@/utils/contact_mail_search";

function make_envelope(
  sender_email: string,
  overrides: Partial<DecryptedEnvelope> = {},
): DecryptedEnvelope {
  return {
    subject: "Weekly update",
    body_text: "Nothing to report",
    body_html: "",
    from: { name: "Sender", email: sender_email },
    to: [{ name: "Me", email: "me@astermail.org" }],
    cc: [],
    bcc: [],
    sent_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function make_item(): MailItem {
  return {
    id: "msg-1",
    item_type: "received",
    encrypted_envelope: "",
    envelope_nonce: "",
    folder_token: "inbox",
    is_external: false,
    created_at: "2026-01-01T00:00:00Z",
    message_ts: "2026-01-01T00:00:00Z",
    is_trashed: false,
    is_spam: false,
  } as MailItem;
}

function make_metadata(): MailItemMetadata {
  return {
    is_read: false,
    is_starred: false,
    is_pinned: false,
    is_trashed: false,
    is_archived: false,
    is_spam: false,
    size_bytes: 1024,
    has_attachments: false,
    attachment_count: 0,
    message_ts: "2026-01-01T00:00:00Z",
    item_type: "received",
  };
}

function run(query: string, envelope: DecryptedEnvelope): boolean {
  const parsed = parse_search_query(query);
  const terms = parsed.text_query
    .split(/\s+/)
    .filter((t) => t.length >= 2)
    .map((t) => t.toLowerCase());

  return matches_query(
    terms,
    parsed.operators,
    envelope,
    make_metadata(),
    make_item(),
  );
}

describe("build_sender_mail_query", () => {
  it("trims and lowercases the address", () => {
    expect(build_sender_mail_query("  Ann@Example.COM ")).toBe(
      "from:ann@example.com",
    );
  });

  it("returns an empty query for a blank sender", () => {
    expect(build_sender_mail_query("   ")).toBe("");
    expect(build_sender_mail_query(null)).toBe("");
    expect(build_sender_mail_query(undefined)).toBe("");
  });

  it("keeps plus addressing and unicode intact", () => {
    expect(build_sender_mail_query("Ann+News@Example.com")).toBe(
      "from:ann+news@example.com",
    );
    expect(build_sender_mail_query("JÖRG@Exämple.de")).toBe(
      "from:jörg@exämple.de",
    );
  });

  it("quotes a value with whitespace so it parses as one operator", () => {
    const query = build_sender_mail_query('Ann "Smith"@example.com');
    const parsed = parse_search_query(query);

    expect(parsed.operators).toHaveLength(1);
    expect(parsed.operators[0].type).toBe("from");
    expect(parsed.operators[0].value).toBe("ann smith@example.com");
    expect(parsed.text_query).toBe("");
  });

  it("parses commas in the address as part of the value", () => {
    const parsed = parse_search_query(
      build_sender_mail_query("a,b@example.com"),
    );

    expect(parsed.operators[0].value).toBe("a,b@example.com");
  });
});

describe("from operator with a full address", () => {
  it("matches the exact sender regardless of case", () => {
    expect(
      run(
        build_sender_mail_query("Ann@Example.com"),
        make_envelope("ANN@example.COM"),
      ),
    ).toBe(true);
  });

  it("does not match a longer local part that contains the address", () => {
    expect(
      run("from:ann@example.com", make_envelope("joann@example.com")),
    ).toBe(false);
  });

  it("does not match a longer domain that starts with the address domain", () => {
    expect(
      run("from:ann@example.com", make_envelope("ann@example.community")),
    ).toBe(false);
  });

  it("keeps plus-addressed senders distinct", () => {
    expect(
      run("from:ann+news@example.com", make_envelope("ann+news@example.com")),
    ).toBe(true);
    expect(
      run("from:ann@example.com", make_envelope("ann+news@example.com")),
    ).toBe(false);
  });

  it("matches a unicode address after case folding", () => {
    expect(
      run(
        build_sender_mail_query("JÖRG@exämple.de"),
        make_envelope("jörg@EXÄMPLE.de"),
      ),
    ).toBe(true);
  });

  it("still matches a partial name or domain as a substring", () => {
    expect(run("from:send", make_envelope("x@example.com"))).toBe(true);
    expect(run("from:@example.com", make_envelope("x@example.com"))).toBe(
      true,
    );
  });

  it("does not let the contact operator over-match a similar recipient", () => {
    const env = make_envelope("me@astermail.org", {
      to: [{ name: "Jo", email: "joann@example.com" }],
    });

    expect(run("contact:ann@example.com", env)).toBe(false);
    expect(run("contact:joann@example.com", env)).toBe(true);
  });
});
