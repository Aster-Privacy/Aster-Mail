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
import type { DecryptedEnvelope, MailItemMetadata } from "@/types/email";

import { describe, it, expect } from "vitest";

import {
  matches_query,
  index_texts,
  type DecryptedIndexEntry,
} from "./use_search";

import { TextIndex } from "@/services/search/text_index";
import { parse_search_query } from "@/utils/search_operators";

function make_entry(
  id: string,
  subject: string,
  from_name: string,
  from_email: string,
  to: { name?: string; email?: string }[],
  body: string,
): { item: MailItem; entry: DecryptedIndexEntry } {
  const envelope: DecryptedEnvelope = {
    subject,
    from: { name: from_name, email: from_email },
    to,
    body_text: body,
  } as unknown as DecryptedEnvelope;
  const metadata: MailItemMetadata = {
    is_read: false,
    is_starred: false,
    is_pinned: false,
    is_trashed: false,
    is_archived: false,
    is_spam: false,
    size_bytes: body.length,
    has_attachments: false,
    attachment_count: 0,
    message_ts: "2026-07-20T10:00:00.000Z",
    created_at: "2026-07-20T10:00:00.000Z",
    updated_at: "2026-07-20T10:00:00.000Z",
    item_type: "received",
  };
  const item: MailItem = {
    id,
    item_type: "received",
    encrypted_envelope: "",
    envelope_nonce: "",
    folder_token: "",
    is_external: false,
    created_at: "2026-07-20T10:00:00.000Z",
    message_ts: "2026-07-20T10:00:00.000Z",
  } as MailItem;

  return {
    item,
    entry: {
      envelope,
      metadata,
      search_body_text: body.toLowerCase(),
      meta_fp: id,
      has_body: true,
    },
  };
}

const corpus = [
  make_entry(
    "1",
    "Invoice from Acme Corp",
    "Billing",
    "billing@acme.com",
    [{ email: "me@aster.test" }],
    "Your invoice of 200 dollars is attached. Payment due Friday.",
  ),
  make_entry(
    "2",
    "Weekly Newsletter",
    "News Team",
    "news@daily.io",
    [{ email: "me@aster.test" }],
    "This week we cover voice recognition and machine learning advances.",
  ),
  make_entry(
    "3",
    "Meeting notes",
    "Alice Johnson",
    "alice@example.com",
    [{ name: "Bob", email: "bob@example.com" }],
    "We discussed the invoice, the budget, and next quarter roadmap.",
  ),
  make_entry(
    "4",
    "Re: quarterly report",
    "Carlos",
    "carlos@corp.net",
    [{ email: "me@aster.test" }],
    "Attached is the quarterly report with revenue numbers.",
  ),
  make_entry(
    "5",
    "Welcome to Aster",
    "Aster Team",
    "hello@aster.test",
    [{ email: "me@aster.test" }],
    "Welcome aboard. Here is how to get started with your inbox.",
  ),
];

function full_scan(query: string): Set<string> {
  const parsed = parse_search_query(query);
  const terms = parsed.text_query
    .split(/\s+/)
    .filter((t) => t.length >= 2)
    .map((t) => t.toLowerCase());
  const out = new Set<string>();

  for (const { item, entry } of corpus) {
    if (
      matches_query(
        terms,
        parsed.operators,
        entry.envelope,
        entry.metadata,
        item,
        undefined,
        ["all"],
        true,
        entry.search_body_text,
      )
    ) {
      out.add(item.id);
    }
  }

  return out;
}

function candidate_scan(query: string): Set<string> {
  const parsed = parse_search_query(query);
  const terms = parsed.text_query
    .split(/\s+/)
    .filter((t) => t.length >= 2)
    .map((t) => t.toLowerCase());

  const idx = new TextIndex();

  for (let i = 0; i < corpus.length; i++) {
    idx.add_document(i, index_texts(corpus[i].entry));
  }

  const candidate_indices = idx.candidates(terms, terms.length > 0);
  const out = new Set<string>();
  const consider = (i: number) => {
    const { item, entry } = corpus[i];

    if (
      matches_query(
        terms,
        parsed.operators,
        entry.envelope,
        entry.metadata,
        item,
        undefined,
        ["all"],
        true,
        entry.search_body_text,
      )
    ) {
      out.add(item.id);
    }
  };

  if (candidate_indices) {
    for (const i of candidate_indices) consider(i);
  } else {
    for (let i = 0; i < corpus.length; i++) consider(i);
  }

  return out;
}

describe("candidate-driven search equals full linear scan", () => {
  const queries = [
    "invoice",
    "voice",
    "quarterly",
    "welcome",
    "budget roadmap",
    "invoice budget",
    "acme",
    "example.com",
    "report revenue",
    "from:alice",
    "from:acme invoice",
    "subject:invoice",
    "newsletter voice",
    "aster",
    "com",
    "net",
    "meeting notes",
    "nonexistentterm",
    "in:inbox invoice",
    "machine learning",
  ];

  for (const q of queries) {
    it(`identical results for "${q}"`, () => {
      const a = full_scan(q);
      const b = candidate_scan(q);

      expect([...b].sort()).toEqual([...a].sort());
    });
  }
});
