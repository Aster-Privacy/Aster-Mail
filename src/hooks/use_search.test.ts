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

import { matches_query } from "@/hooks/use_search";
import { parse_search_query } from "@/utils/search_operators";
import type { DecryptedEnvelope, MailItemMetadata } from "@/types/email";
import type { MailItem } from "@/services/api/mail";

function make_envelope(overrides: Partial<DecryptedEnvelope> = {}): DecryptedEnvelope {
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

function run(query: string, envelope: DecryptedEnvelope, search_body: boolean): boolean {
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
