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

interface Fixture {
  item: MailItem;
  entry: DecryptedIndexEntry;
}

function make(
  id: string,
  opts: {
    subject: string;
    from_name?: string;
    from_email: string;
    to?: { name?: string; email?: string }[];
    body: string;
    ts: string;
    meta?: Partial<MailItemMetadata>;
    item_type?: MailItem["item_type"];
    is_trashed?: boolean;
    is_spam?: boolean;
  },
): Fixture {
  const envelope = {
    subject: opts.subject,
    from: { name: opts.from_name ?? "", email: opts.from_email },
    to: opts.to ?? [{ email: "me@aster.test" }],
    body_text: opts.body,
  } as unknown as DecryptedEnvelope;
  const metadata: MailItemMetadata = {
    is_read: false,
    is_starred: false,
    is_pinned: false,
    is_trashed: false,
    is_archived: false,
    is_spam: false,
    size_bytes: opts.body.length,
    has_attachments: false,
    attachment_count: 0,
    message_ts: opts.ts,
    created_at: opts.ts,
    updated_at: opts.ts,
    item_type: opts.item_type ?? "received",
    ...opts.meta,
  };
  const item = {
    id,
    item_type: opts.item_type ?? "received",
    encrypted_envelope: "",
    envelope_nonce: "",
    folder_token: "",
    is_external: false,
    created_at: opts.ts,
    message_ts: opts.ts,
    is_trashed: opts.is_trashed ?? false,
    is_spam: opts.is_spam ?? false,
  } as MailItem;

  return {
    item,
    entry: {
      envelope,
      metadata,
      search_body_text: opts.body.toLowerCase(),
      meta_fp: id,
      has_body: true,
    },
  };
}

const corpus: Fixture[] = [
  make("1", {
    subject: "Invoice #204 from Acme",
    from_name: "Billing",
    from_email: "billing@acme.com",
    body: "Payment due. Invoice attached as PDF.",
    ts: "2026-01-10T09:00:00.000Z",
    meta: {
      has_attachments: true,
      attachment_count: 1,
      size_bytes: 240000,
      is_read: true,
    },
  }),
  make("2", {
    subject: "Café meeting recap",
    from_name: "Renée Dubois",
    from_email: "renee@bistro.fr",
    body: "We met at the café to discuss the naïve rollout plan.",
    ts: "2026-03-02T12:00:00.000Z",
    meta: { is_starred: true, size_bytes: 1200 },
  }),
  make("3", {
    subject: "Weekly newsletter",
    from_email: "news@daily.io",
    body: "voice recognition, machine learning, and more this week.",
    ts: "2026-05-20T08:00:00.000Z",
    meta: { size_bytes: 5000, is_read: true },
  }),
  make("4", {
    subject: "Big report",
    from_email: "carlos@corp.net",
    body: "lorem ipsum ".repeat(5000) + " secretmarker budget",
    ts: "2026-06-01T10:00:00.000Z",
    meta: { has_attachments: true, size_bytes: 9000000 },
  }),
  make("5", {
    subject: "Trashed thing",
    from_email: "old@acme.com",
    body: "obsolete invoice content",
    ts: "2025-12-01T10:00:00.000Z",
    is_trashed: true,
    meta: { is_trashed: true },
  }),
  make("6", {
    subject: "Sent proposal",
    from_email: "me@aster.test",
    to: [{ email: "client@corp.net" }],
    body: "Here is the proposal you requested.",
    ts: "2026-04-15T10:00:00.000Z",
    item_type: "sent",
  }),
];

function parse(query: string) {
  const parsed = parse_search_query(query);
  const terms = parsed.text_query
    .split(/\s+/)
    .filter((t) => t.length >= 2)
    .map((t) => t.toLowerCase());

  return { terms, operators: parsed.operators };
}

function full_scan(query: string): Set<string> {
  const { terms, operators } = parse(query);
  const out = new Set<string>();

  for (const { item, entry } of corpus) {
    if (
      matches_query(
        terms,
        operators,
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

function candidate_scan(query: string, body_budget?: number): Set<string> {
  const { terms, operators } = parse(query);
  const idx = new TextIndex(body_budget);

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
        operators,
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

const queries = [
  "invoice",
  "budget",
  "secretmarker",
  "café",
  "naïve rollout",
  "voice",
  "proposal",
  "from:acme",
  "from:acme invoice",
  "-from:acme invoice",
  "subject:report",
  "subject:invoice payment",
  "has:attachment",
  "has:attachment invoice",
  "has:pdf",
  "is:read",
  "is:unread",
  "is:starred",
  "is:unstarred invoice",
  "in:inbox invoice",
  "in:sent",
  "in:trash",
  "larger:100kb",
  "smaller:2kb",
  "before:2026-04-01",
  "after:2026-05-01",
  "after:2026-01-01 before:2026-12-31 report",
  "newsletter voice machine",
  "nonexistentzzz",
  "proposal client",
];

describe("operator-level candidate/full-scan equivalence", () => {
  for (const q of queries) {
    it(`identical results for "${q}"`, () => {
      const a = full_scan(q);
      const b = candidate_scan(q);

      expect([...b].sort()).toEqual([...a].sort());
    });
  }
});

describe("attachment detection falls back to envelope.attachment_keys", () => {
  const meta_no_attach: MailItemMetadata = {
    is_read: false,
    is_starred: false,
    is_pinned: false,
    is_trashed: false,
    is_archived: false,
    is_spam: false,
    size_bytes: 100,
    has_attachments: false,
    attachment_count: 0,
    message_ts: "2026-07-20T10:00:00.000Z",
    created_at: "2026-07-20T10:00:00.000Z",
    updated_at: "2026-07-20T10:00:00.000Z",
    item_type: "received",
  };
  const item = {
    id: "x",
    item_type: "received",
    encrypted_envelope: "",
    envelope_nonce: "",
    folder_token: "",
    is_external: false,
    created_at: "2026-07-20T10:00:00.000Z",
    message_ts: "2026-07-20T10:00:00.000Z",
  } as MailItem;
  const base_env = {
    subject: "doc",
    body_text: "hello",
    from: { name: "", email: "a@b.com" },
    to: [{ email: "me@aster.test" }],
  };
  const env_with_keys = {
    ...base_env,
    attachment_keys: [{ seq: 0, key: "k1" }],
  } as unknown as DecryptedEnvelope;
  const env_no_keys = base_env as unknown as DecryptedEnvelope;
  const { operators } = parse("has:attachment");

  it("matches has:attachment when attachment_keys present but metadata says false", () => {
    expect(
      matches_query([], operators, env_with_keys, meta_no_attach, item, undefined, ["all"], true, ""),
    ).toBe(true);
  });

  it("does not match has:attachment when no keys and metadata false", () => {
    expect(
      matches_query([], operators, env_no_keys, meta_no_attach, item, undefined, ["all"], true, ""),
    ).toBe(false);
  });
});

describe("equivalence holds when body index falls back (tiny budget)", () => {
  const body_queries = [
    "budget",
    "secretmarker",
    "voice",
    "invoice",
    "café",
    "has:attachment budget",
    "proposal",
  ];

  for (const q of body_queries) {
    it(`identical with body_budget=1 for "${q}"`, () => {
      const idx = new TextIndex(1);

      for (let i = 0; i < corpus.length; i++) {
        idx.add_document(i, index_texts(corpus[i].entry));
      }
      expect(idx.body_indexed).toBe(false);

      const a = full_scan(q);
      const b = candidate_scan(q, 1);

      expect([...b].sort()).toEqual([...a].sort());
    });
  }
});
