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
import {
  build_contact_mail_query,
  normalize_contact_addresses,
} from "@/utils/contact_mail_search";

function make_envelope(
  overrides: Partial<DecryptedEnvelope> = {},
): DecryptedEnvelope {
  return {
    subject: "Project sync notes",
    body_text: "Quarterly revenue increased by twenty percent last month",
    body_html: "",
    from: { name: "Alice", email: "alice@example.com" },
    to: [{ name: "Bob", email: "bob@example.com" }],
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

describe("build_contact_mail_query", () => {
  it("emits one contact operator per address", () => {
    expect(build_contact_mail_query(["Alice@Example.com", "a2@example.com"]))
      .toBe("contact:alice@example.com contact:a2@example.com");
  });

  it("drops blanks and duplicates", () => {
    expect(
      normalize_contact_addresses([
        "alice@example.com",
        " ALICE@example.com ",
        "",
        null,
        undefined,
      ]),
    ).toEqual(["alice@example.com"]);
    expect(build_contact_mail_query([" ", null])).toBe("");
  });

  it("quotes an address that contains whitespace", () => {
    expect(build_contact_mail_query(["a b@example.com"])).toBe(
      'contact:"a b@example.com"',
    );
  });
});

describe("contact operator", () => {
  it("matches mail received from the contact", () => {
    expect(run("contact:alice@example.com", make_envelope())).toBe(true);
  });

  it("matches mail sent to the contact", () => {
    const env = make_envelope({
      from: { name: "Me", email: "me@astermail.org" },
      to: [{ name: "Alice", email: "alice@example.com" }],
    });

    expect(run("contact:alice@example.com", env)).toBe(true);
  });

  it("matches mail where the contact is only in cc or bcc", () => {
    const cc_env = make_envelope({
      from: { name: "Me", email: "me@astermail.org" },
      to: [{ name: "Bob", email: "bob@example.com" }],
      cc: [{ name: "Alice", email: "alice@example.com" }],
    });
    const bcc_env = make_envelope({
      from: { name: "Me", email: "me@astermail.org" },
      to: [{ name: "Bob", email: "bob@example.com" }],
      bcc: [{ name: "Alice", email: "alice@example.com" }],
    });

    expect(run("contact:alice@example.com", cc_env)).toBe(true);
    expect(run("contact:alice@example.com", bcc_env)).toBe(true);
  });

  it("excludes mail that involves neither side of the contact", () => {
    const env = make_envelope({
      from: { name: "Carol", email: "carol@example.com" },
      to: [{ name: "Dave", email: "dave@example.com" }],
    });

    expect(run("contact:alice@example.com", env)).toBe(false);
  });

  it("treats several contact operators as any-of, not all-of", () => {
    const query = build_contact_mail_query([
      "alice@example.com",
      "alice.work@example.org",
    ]);
    const primary = make_envelope();
    const secondary = make_envelope({
      from: { name: "Alice", email: "alice.work@example.org" },
    });
    const unrelated = make_envelope({
      from: { name: "Carol", email: "carol@example.com" },
      to: [{ name: "Dave", email: "dave@example.com" }],
    });

    expect(run(query, primary)).toBe(true);
    expect(run(query, secondary)).toBe(true);
    expect(run(query, unrelated)).toBe(false);
  });

  it("treats several from operators as any-of", () => {
    expect(
      run("from:alice@example.com from:carol@example.com", make_envelope()),
    ).toBe(true);
  });

  it("treats several to operators as any-of", () => {
    expect(
      run("to:bob@example.com to:dave@example.com", make_envelope()),
    ).toBe(true);
  });

  it("still ands a contact operator with other operators", () => {
    const env = make_envelope({ subject: "Invoice" });

    expect(run("contact:alice@example.com subject:invoice", env)).toBe(true);
    expect(run("contact:alice@example.com subject:receipt", env)).toBe(false);
  });

  it("honors a negated contact operator", () => {
    expect(run("-contact:alice@example.com", make_envelope())).toBe(false);
    expect(
      run(
        "-contact:zoe@example.com",
        make_envelope({ subject: "Project sync notes" }),
      ),
    ).toBe(true);
  });
});
