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

function run(
  query: string,
  envelope: DecryptedEnvelope,
  search_body: boolean,
): boolean {
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
    undefined,
    undefined,
    search_body,
  );
}

describe("matches_query - encrypted content search toggle", () => {
  it("matches subject regardless of search_body flag", () => {
    const env = make_envelope({ subject: "Hello world" });

    expect(run("hello", env, false)).toBe(true);
    expect(run("hello", env, true)).toBe(true);
  });

  it("matches sender name and email regardless of search_body flag", () => {
    const env = make_envelope();

    expect(run("alice", env, false)).toBe(true);
    expect(run("alice", env, true)).toBe(true);
    expect(run("alice@example.com", env, false)).toBe(true);
  });

  it("matches body text ONLY when search_body is true", () => {
    const env = make_envelope({
      subject: "Status update",
      body_text: "Quarterly revenue increased by twenty percent",
    });

    expect(run("quarterly", env, true)).toBe(true);
    expect(run("revenue", env, true)).toBe(true);

    expect(run("quarterly", env, false)).toBe(false);
    expect(run("revenue", env, false)).toBe(false);
  });

  it("ignores empty body_text when search_body is true (real-world: index built without body)", () => {
    const env = make_envelope({ body_text: "" });

    expect(run("revenue", env, true)).toBe(false);
    expect(run("revenue", env, false)).toBe(false);
  });

  it("still matches the from: operator with body disabled", () => {
    const env = make_envelope();

    expect(run("from:alice@example.com", env, false)).toBe(true);
  });

  it("still matches subject when explicit body-only term would not match with body off", () => {
    const env = make_envelope({
      subject: "Quarterly results",
      body_text: "Revenue increased",
    });

    expect(run("quarterly", env, false)).toBe(true);
    expect(run("revenue", env, false)).toBe(false);
  });
});

describe("matches_query - sent mail is found by recipient", () => {
  const sent_envelope = (overrides: Partial<DecryptedEnvelope> = {}) =>
    make_envelope({
      subject: "Contract",
      body_text: "attached",
      from: { name: "", email: "me@astermail.org" },
      to: [{ name: "Dana Reyes", email: "dana@partner.com" }],
      ...overrides,
    });

  it("finds a sent email by the recipient name with plain terms", () => {
    expect(run("dana", sent_envelope(), true)).toBe(true);
    expect(run("reyes", sent_envelope(), true)).toBe(true);
  });

  it("finds a sent email by the recipient address with plain terms", () => {
    expect(run("dana@partner.com", sent_envelope(), true)).toBe(true);
    expect(run("partner.com", sent_envelope(), true)).toBe(true);
  });

  it("finds a sent email by recipient even with content search disabled", () => {
    expect(run("dana", sent_envelope(), false)).toBe(true);
  });

  it("finds a sent email addressed only via cc or bcc", () => {
    const cc_only = sent_envelope({
      to: [],
      cc: [{ name: "Priya Nair", email: "priya@partner.com" }],
    });
    const bcc_only = sent_envelope({
      to: [],
      bcc: [{ name: "Omar Diaz", email: "omar@partner.com" }],
    });

    expect(run("priya", cc_only, true)).toBe(true);
    expect(run("omar", bcc_only, true)).toBe(true);
  });

  it("matches the to: operator against cc and bcc recipients", () => {
    const cc_only = sent_envelope({
      to: [],
      cc: [{ name: "Priya Nair", email: "priya@partner.com" }],
    });

    expect(run("to:priya@partner.com", cc_only, true)).toBe(true);
    expect(run("to:nobody@nowhere.com", cc_only, true)).toBe(false);
  });

  it("does not match an unrelated recipient", () => {
    expect(run("zzzznotarecipient", sent_envelope(), true)).toBe(false);
  });
});

describe("matches_query - string form senders and recipients", () => {
  const as_unknown = (value: unknown) =>
    value as DecryptedEnvelope["to"] & DecryptedEnvelope["from"];

  it("finds mail whose recipients are plain address strings", () => {
    const env = make_envelope({
      from: { name: "", email: "me@astermail.org" },
      to: as_unknown(["Dana Reyes <dana@partner.com>"]),
    });

    expect(run("dana", env, true)).toBe(true);
    expect(run("reyes", env, true)).toBe(true);
    expect(run("to:dana@partner.com", env, true)).toBe(true);
  });

  it("finds mail whose cc is a bare address string", () => {
    const env = make_envelope({
      to: [],
      cc: as_unknown(["priya@partner.com"]),
    });

    expect(run("priya@partner.com", env, true)).toBe(true);
  });

  it("finds mail whose sender is a display-name string", () => {
    const env = make_envelope({
      from: as_unknown("Cassie Lang <cassie@example.com>"),
    });

    expect(run("cassie", env, true)).toBe(true);
    expect(run("from:cassie@example.com", env, true)).toBe(true);
  });
});

describe("matches_query - html only bodies", () => {
  it("matches body words carried only in html", () => {
    const env = make_envelope({
      subject: "Invoice",
      body_text: "",
      body_html: "<p>Payment <b>reference</b> QX-4471 is due</p>",
    });

    expect(run("reference", env, true)).toBe(true);
    expect(run("qx-4471", env, true)).toBe(true);
  });

  it("matches body words carried only in text_body", () => {
    const env = make_envelope({
      body_text: "",
      text_body: "shipment leaves rotterdam on friday",
    });

    expect(run("rotterdam", env, true)).toBe(true);
  });

  it("does not match html-only body words when content search is off", () => {
    const env = make_envelope({
      subject: "Invoice",
      body_text: "",
      body_html: "<p>Payment reference QX-4471 is due</p>",
    });

    expect(run("reference", env, false)).toBe(false);
  });
});

describe("matches_query - in operator mailbox scopes", () => {
  function run_in(
    query: string,
    item_overrides: Partial<MailItem>,
    metadata_overrides: Partial<MailItemMetadata> = {},
  ): boolean {
    const parsed = parse_search_query(query);
    const terms = parsed.text_query
      .split(/\s+/)
      .filter((t) => t.length >= 2)
      .map((t) => t.toLowerCase());

    return matches_query(
      terms,
      parsed.operators,
      make_envelope(),
      { ...make_metadata(), ...metadata_overrides },
      { ...make_item(), ...item_overrides } as MailItem,
      undefined,
      undefined,
      true,
    );
  }

  it("finds archived mail with in:archive", () => {
    expect(run_in("in:archive project", { is_archived: true })).toBe(true);
  });

  it("accepts in:archived as an alias", () => {
    expect(run_in("in:archived project", { is_archived: true })).toBe(true);
  });

  it("excludes unarchived mail from in:archive", () => {
    expect(run_in("in:archive project", { is_archived: false })).toBe(false);
  });

  it("excludes trashed mail from in:archive", () => {
    expect(
      run_in("in:archive project", { is_archived: true, is_trashed: true }),
    ).toBe(false);
  });

  it("excludes archived mail from in:inbox", () => {
    expect(run_in("in:inbox project", { is_archived: true })).toBe(false);
  });

  it("keeps unarchived received mail in in:inbox", () => {
    expect(run_in("in:inbox project", { is_archived: false })).toBe(true);
  });

  it("matches every mailbox with in:anywhere", () => {
    expect(
      run_in("in:anywhere project", { is_archived: true, is_spam: true }),
    ).toBe(true);
  });

  it("finds starred mail with in:starred", () => {
    expect(run_in("in:starred project", {}, { is_starred: true })).toBe(true);
    expect(run_in("in:starred project", {}, { is_starred: false })).toBe(false);
  });
});
