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

import { entry_haystack } from "./use_search/haystack";
import { build_search_haystack, matches_query } from "./use_search/matching";
import type { DecryptedIndexEntry } from "./use_search/types";

import type { MailItem } from "@/services/api/mail";
import type { DecryptedEnvelope } from "@/types/email";

const envelope = {
  subject: "Quarterly Report",
  body_text: "the body mentions Chris in passing",
  body_html: "",
  html_body: "",
  from: { name: "Chris Doe", email: "chris@sender.test" },
  to: [{ name: "Ada Lovelace", email: "ada@recipient.test" }],
  cc: [{ name: "Bob Stone", email: "bob@copied.test" }],
  bcc: [],
  sent_at: "2026-01-01T00:00:00.000Z",
} as unknown as DecryptedEnvelope;

const item = {
  id: "m1",
  item_type: "received",
  is_trashed: false,
  is_spam: false,
  is_archived: false,
  message_ts: "2026-01-01T00:00:00.000Z",
  created_at: "2026-01-01T00:00:00.000Z",
} as unknown as MailItem;

function entry_of(env: DecryptedEnvelope | null): DecryptedIndexEntry {
  return {
    envelope: env,
    metadata: { is_read: false, is_starred: false, has_attachments: false },
    search_body_text: "the body mentions chris in passing",
    meta_fp: "",
    has_body: true,
  } as unknown as DecryptedIndexEntry;
}

describe("build_search_haystack", () => {
  it("lowercases every field the matcher searches", () => {
    const hay = build_search_haystack(envelope);

    expect(hay.subject).toBe("quarterly report");
    expect(hay.sender_name).toBe("chris doe ");
    expect(hay.sender_email).toBe("chris@sender.test ");
    expect(hay.recipients).toContain("ada@recipient.test ada lovelace");
    expect(hay.recipients).toContain("bob@copied.test bob stone");
  });

  it("keeps the sender email ahead of the name for contact matching", () => {
    const hay = build_search_haystack(envelope);

    expect(hay.contact).toBe("chris@sender.test chris doe  ");
  });

  it("surfaces a forwarded alias sender in the sender fields", () => {
    const forwarded = {
      ...envelope,
      from: { name: "SimpleLogin", email: "relay@simplelogin.co" },
      raw_headers: [
        { name: "x-simplelogin-type", value: "Forward" },
        {
          name: "x-simplelogin-original-from",
          value: "Original Chris <chris@upstream.test>",
        },
      ],
    } as unknown as DecryptedEnvelope;
    const hay = build_search_haystack(forwarded);

    expect(hay.sender_email).toContain("chris@upstream.test");
    expect(hay.contact).toContain("chris@upstream.test");
  });
});

describe("entry_haystack", () => {
  it("memoizes the haystack on the entry", () => {
    const entry = entry_of(envelope);

    expect(entry.haystack).toBeUndefined();

    const first = entry_haystack(entry);

    expect(entry.haystack).toBe(first);
    expect(entry_haystack(entry)).toBe(first);
  });

  it("returns an empty haystack for an undecryptable entry", () => {
    const hay = entry_haystack(entry_of(null));

    expect(hay.subject).toBe("");
    expect(hay.contact).toBe("");
    expect(hay.recipients).toBe("");
  });
});

describe("matches_query with a precomputed haystack", () => {
  const run = (query: string, use_hay: boolean): boolean => {
    const entry = entry_of(envelope);
    const terms = query.includes(":") ? [] : [query];
    const operators = query.includes(":")
      ? [
          {
            type: query.split(":")[0],
            value: query.split(":")[1],
            negated: false,
          },
        ]
      : [];

    return matches_query(
      terms,
      operators as never,
      entry.envelope,
      entry.metadata,
      item,
      undefined,
      undefined,
      true,
      entry.search_body_text,
      use_hay ? entry_haystack(entry) : undefined,
    );
  };

  const queries = [
    "chris",
    "quarterly",
    "lovelace",
    "nomatchhere",
    "from:chris@sender.test",
    "from:chris doe",
    "to:ada@recipient.test",
    "to:bob stone",
    "contact:chris",
    "contact:ada",
    "subject:quarterly",
    "subject:missing",
  ];

  for (const query of queries) {
    it(`agrees with the recomputed path for ${query}`, () => {
      expect(run(query, true)).toBe(run(query, false));
    });
  }
});
