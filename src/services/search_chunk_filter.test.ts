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

import { parse_search_query } from "@/utils/search_operators";
import {
  build_chunk_skip_plan,
  build_gram_filter,
  collect_grams,
  normalize_chunk_summary,
  parse_gram_filter,
  summarize_chunk,
  type ChunkSummary,
  type SummarizableEntry,
} from "@/services/search_chunk_filter";

interface ItemOverrides {
  id?: string;
  item_type?: string;
  message_ts?: string;
  created_at?: string;
  is_trashed?: boolean;
  is_spam?: boolean;
  labels?: { token: string; name: string }[];
  folders?: { token: string; name: string }[];
  tag_tokens?: string[];
}

interface EntryOverrides {
  subject?: string;
  from_name?: string;
  from_email?: string;
  to?: { name?: string; email?: string }[];
  cc?: { name?: string; email?: string }[];
  bcc?: { name?: string; email?: string }[];
  is_read?: boolean;
  is_starred?: boolean;
  has_attachments?: boolean;
  size_bytes?: number;
}

function make_item(overrides: ItemOverrides = {}): MailItem {
  return {
    id: overrides.id ?? "item-1",
    item_type: overrides.item_type ?? "received",
    encrypted_envelope: "",
    envelope_nonce: "",
    folder_token: "inbox",
    is_external: false,
    created_at: overrides.created_at ?? "2026-03-01T12:00:00Z",
    message_ts: overrides.message_ts,
    is_trashed: overrides.is_trashed,
    is_spam: overrides.is_spam,
    labels: overrides.labels,
    folders: overrides.folders,
    tag_tokens: overrides.tag_tokens,
  } as MailItem;
}

function make_entry(overrides: EntryOverrides = {}): SummarizableEntry {
  return {
    envelope: {
      subject: overrides.subject ?? "",
      body_text: "",
      body_html: "",
      from: {
        name: overrides.from_name ?? "",
        email: overrides.from_email ?? "",
      },
      to: overrides.to ?? [],
      cc: overrides.cc ?? [],
      bcc: overrides.bcc ?? [],
      sent_at: "2026-03-01T12:00:00Z",
    } as DecryptedEnvelope,
    metadata: {
      is_read: overrides.is_read ?? false,
      is_starred: overrides.is_starred ?? false,
      has_attachments: overrides.has_attachments ?? false,
      size_bytes: overrides.size_bytes ?? 0,
    } as MailItemMetadata,
  };
}

function summarize(
  pairs: { item?: ItemOverrides; entry?: EntryOverrides }[],
): ChunkSummary {
  return summarize_chunk(
    pairs.map((pair, i) => make_item({ id: `item-${i}`, ...pair.item })),
    pairs.map((pair) => make_entry(pair.entry)),
  ).summary;
}

function skip_query(
  query: string,
  summary: ChunkSummary,
  label_name_to_tokens?: Map<string, string[]>,
): boolean {
  const parsed = parse_search_query(query);
  const plan = build_chunk_skip_plan({
    terms: [],
    operators: parsed.operators,
    label_name_to_tokens,
    probe_terms: false,
  });

  return plan.uses_summary && plan.skip_by_summary(summary);
}

function next_random(state: number): number {
  return (state * 1664525 + 1013904223) >>> 0;
}

describe("collect_grams", () => {
  it("emits every gram inside an alphanumeric run", () => {
    const grams = new Set<string>();

    collect_grams("abcdef", grams);

    expect([...grams]).toEqual(["abcd", "bcde", "cdef"]);
  });

  it("never spans a non-alphanumeric boundary", () => {
    const grams = new Set<string>();

    collect_grams("ab-cd", grams);

    expect([...grams]).toEqual([]);
  });

  it("lowercases before slicing", () => {
    const grams = new Set<string>();

    collect_grams("ABCD", grams);

    expect([...grams]).toEqual(["abcd"]);
  });

  it("handles email-shaped text as separate runs", () => {
    const grams = new Set<string>();

    collect_grams("alice@example.com", grams);

    expect(grams.has("alic")).toBe(true);
    expect(grams.has("exam")).toBe(true);
    expect(grams.has("e@ex")).toBe(false);
  });
});

describe("gram filter", () => {
  it("round-trips through the stored representation", () => {
    const grams = new Set<string>();

    collect_grams("quarterly report", grams);

    const filter = parse_gram_filter(build_gram_filter(grams));

    expect(filter).not.toBeNull();

    const plan = build_chunk_skip_plan({
      terms: ["quarterly"],
      operators: [],
      probe_terms: true,
    });

    expect(plan.uses_grams).toBe(true);
    expect(plan.skip_by_grams(filter!)).toBe(false);
  });

  it("rejects a malformed stored filter", () => {
    expect(parse_gram_filter(null)).toBeNull();
    expect(parse_gram_filter({ bits: "!!!!", m: 12 })).toBeNull();
    expect(parse_gram_filter({ bits: "AAAA", m: 1024 })).toBeNull();
  });

  it("never skips a chunk that contains the searched substring", () => {
    const alphabet = "abcdefghijklm";
    let state = 20260726;
    const texts: string[] = [];

    for (let i = 0; i < 240; i++) {
      let text = "";

      state = next_random(state);

      const words = 2 + (state % 4);

      for (let w = 0; w < words; w++) {
        state = next_random(state);

        const length = 4 + (state % 9);

        for (let c = 0; c < length; c++) {
          state = next_random(state);
          text += alphabet[state % alphabet.length];
        }
        text += w % 2 === 0 ? " " : ".";
      }

      texts.push(text.trim());
    }

    const grams = new Set<string>();

    for (const text of texts) {
      collect_grams(text, grams);
    }

    const filter = parse_gram_filter(build_gram_filter(grams))!;

    expect(filter).not.toBeNull();

    let probes = 0;

    for (const text of texts) {
      for (let attempt = 0; attempt < 6; attempt++) {
        state = next_random(state);

        const start = state % text.length;

        state = next_random(state);

        const end = Math.min(text.length, start + 2 + (state % 10));
        const term = text.slice(start, end).toLowerCase();

        if (term.length < 2) continue;

        const plan = build_chunk_skip_plan({
          terms: [term],
          operators: [],
          probe_terms: true,
        });

        probes++;

        expect(plan.skip_by_grams(filter)).toBe(false);
      }
    }

    expect(probes).toBeGreaterThan(1000);
  });

  it("skips a chunk whose grams cannot contain the term", () => {
    const grams = new Set<string>();

    collect_grams("alice bob carol", grams);

    const filter = parse_gram_filter(build_gram_filter(grams))!;
    const plan = build_chunk_skip_plan({
      terms: ["zzzzqqqq"],
      operators: [],
      probe_terms: true,
    });

    expect(plan.skip_by_grams(filter)).toBe(true);
  });

  it("cannot skip on a term shorter than one gram", () => {
    const plan = build_chunk_skip_plan({
      terms: ["ab"],
      operators: [],
      probe_terms: true,
    });

    expect(plan.uses_grams).toBe(false);
  });

  it("ignores terms entirely when body search is live", () => {
    const plan = build_chunk_skip_plan({
      terms: ["quarterly"],
      operators: [],
      probe_terms: false,
    });

    expect(plan.uses_grams).toBe(false);
  });

  it("probes header operators regardless of body search", () => {
    const grams = new Set<string>();

    collect_grams("alice@example.com", grams);

    const filter = parse_gram_filter(build_gram_filter(grams))!;
    const present = build_chunk_skip_plan({
      terms: [],
      operators: parse_search_query("from:alice").operators,
      probe_terms: false,
    });
    const absent = build_chunk_skip_plan({
      terms: [],
      operators: parse_search_query("from:zzzzqqqq").operators,
      probe_terms: false,
    });

    expect(present.skip_by_grams(filter)).toBe(false);
    expect(absent.skip_by_grams(filter)).toBe(true);
  });

  it("never probes a negated operator", () => {
    const plan = build_chunk_skip_plan({
      terms: [],
      operators: parse_search_query("-from:zzzzqqqq").operators,
      probe_terms: false,
    });

    expect(plan.uses_grams).toBe(false);
    expect(plan.uses_summary).toBe(false);
  });

  it("collects grams from every indexed header field", () => {
    const digest = summarize_chunk(
      [make_item()],
      [
        make_entry({
          subject: "Quarterly Report",
          from_name: "Alice Smith",
          from_email: "alice@example.com",
          to: [{ name: "Bob Jones", email: "bob@other.test" }],
        }),
      ],
    );
    const filter = parse_gram_filter(digest.grams)!;

    for (const term of ["quarterly", "smith", "example", "jones", "other"]) {
      const plan = build_chunk_skip_plan({
        terms: [term],
        operators: [],
        probe_terms: true,
      });

      expect(plan.skip_by_grams(filter)).toBe(false);
    }
  });
});

describe("summarize_chunk", () => {
  it("records the dated range and flags undated items", () => {
    const summary = summarize([
      { item: { message_ts: "2026-01-05T00:00:00Z" } },
      { item: { message_ts: "not-a-date", created_at: "also-bad" } },
      { item: { message_ts: "2026-02-05T00:00:00Z" } },
    ]);

    expect(summary.has_dated).toBe(true);
    expect(summary.has_undated).toBe(true);
    expect(summary.min_ts).toBe(new Date("2026-01-05T00:00:00Z").getTime());
    expect(summary.max_ts).toBe(new Date("2026-02-05T00:00:00Z").getTime());
  });

  it("keeps size bounds and item types", () => {
    const summary = summarize([
      { item: { item_type: "sent" }, entry: { size_bytes: 400 } },
      { item: { item_type: "received" }, entry: { size_bytes: 9000 } },
    ]);

    expect(summary.min_size).toBe(400);
    expect(summary.max_size).toBe(9000);
    expect(summary.item_types.sort()).toEqual(["received", "sent"]);
  });

  it("drops token and name lists that grow past the cap", () => {
    const pairs = Array.from({ length: 200 }, (_, i) => ({
      item: {
        labels: [{ token: `t-${i}`, name: `name-${i}` }],
      },
    }));
    const summary = summarize(pairs);

    expect(summary.tokens_complete).toBe(false);
    expect(summary.names_complete).toBe(false);
    expect(summary.tokens).toEqual([]);
  });
});

describe("normalize_chunk_summary", () => {
  it("accepts a summary it produced", () => {
    const summary = summarize([{}]);

    expect(
      normalize_chunk_summary(JSON.parse(JSON.stringify(summary))),
    ).toEqual(summary);
  });

  it("rejects records missing numeric fields", () => {
    expect(normalize_chunk_summary(null)).toBeNull();
    expect(normalize_chunk_summary({ min_ts: "0" })).toBeNull();
    expect(
      normalize_chunk_summary({
        min_ts: 0,
        max_ts: 0,
        min_size: 0,
        max_size: 0,
        flags: 0,
        item_types: [],
        tokens: [],
      }),
    ).toBeNull();
  });
});

describe("structural chunk skipping", () => {
  it("skips a chunk with no starred mail for is:starred", () => {
    expect(skip_query("is:starred", summarize([{}]))).toBe(true);
    expect(
      skip_query("is:starred", summarize([{ entry: { is_starred: true } }])),
    ).toBe(false);
  });

  it("skips a chunk with no unread mail for is:unread", () => {
    expect(
      skip_query("is:unread", summarize([{ entry: { is_read: true } }])),
    ).toBe(true);
    expect(skip_query("is:unread", summarize([{}]))).toBe(false);
  });

  it("skips a chunk with no attachments for has:attachment", () => {
    expect(skip_query("has:attachment", summarize([{}]))).toBe(true);
    expect(
      skip_query(
        "has:attachment",
        summarize([{ entry: { has_attachments: true } }]),
      ),
    ).toBe(false);
  });

  it("skips by mailbox for in: queries", () => {
    const received = summarize([{ item: { item_type: "received" } }]);

    expect(skip_query("in:sent", received)).toBe(true);
    expect(skip_query("in:trash", received)).toBe(true);
    expect(skip_query("in:inbox", received)).toBe(false);
    expect(skip_query("in:all", received)).toBe(false);
  });

  it("never skips a chunk for a scope the summary cannot decide", () => {
    const received = summarize([{ item: { item_type: "received" } }]);

    expect(skip_query("in:archive", received)).toBe(false);
    expect(skip_query("in:archived", received)).toBe(false);
    expect(skip_query("in:anywhere", received)).toBe(false);
  });

  it("never skips in: when a folder name could match", () => {
    const summary = summarize([
      {
        item: {
          item_type: "received",
          folders: [{ token: "f1", name: "Sent Archive" }],
        },
      },
    ]);

    expect(skip_query("in:sent", summary)).toBe(false);
  });

  it("skips by label token when the label map resolves", () => {
    const summary = summarize([
      { item: { labels: [{ token: "tok-work", name: "Work" }] } },
    ]);
    const map = new Map([["personal", ["tok-personal"]]]);

    expect(skip_query("label:personal", summary, map)).toBe(true);
    expect(
      skip_query("label:work", summary, new Map([["work", ["tok-work"]]])),
    ).toBe(false);
  });

  it("falls back to label names when the map has no match", () => {
    const summary = summarize([
      { item: { labels: [{ token: "tok-work", name: "Work" }] } },
    ]);

    expect(skip_query("label:travel", summary)).toBe(true);
    expect(skip_query("label:work", summary)).toBe(false);
  });

  it("skips chunks outside a before/after window", () => {
    const summary = summarize([
      { item: { message_ts: "2026-03-01T12:00:00Z" } },
      { item: { message_ts: "2026-03-05T12:00:00Z" } },
    ]);

    expect(skip_query("before:2026-01-01", summary)).toBe(true);
    expect(skip_query("after:2026-06-01", summary)).toBe(true);
    expect(skip_query("before:2026-06-01", summary)).toBe(false);
    expect(skip_query("after:2026-01-01", summary)).toBe(false);
  });

  it("skips by size operators", () => {
    const summary = summarize([
      { entry: { size_bytes: 1000 } },
      { entry: { size_bytes: 5000 } },
    ]);

    expect(skip_query("larger:1mb", summary)).toBe(true);
    expect(skip_query("smaller:100", summary)).toBe(true);
    expect(skip_query("larger:2000", summary)).toBe(false);
    expect(skip_query("smaller:2000", summary)).toBe(false);
  });

  it("skips by attachment and star filters", () => {
    const summary = summarize([{ entry: { has_attachments: true } }]);
    const with_attachments = build_chunk_skip_plan({
      terms: [],
      operators: [],
      filters: { has_attachments: false },
      probe_terms: false,
    });
    const starred = build_chunk_skip_plan({
      terms: [],
      operators: [],
      filters: { is_starred: true },
      probe_terms: false,
    });

    expect(with_attachments.skip_by_summary(summary)).toBe(true);
    expect(starred.skip_by_summary(summary)).toBe(true);
  });

  it("never skips a date filter when the chunk holds undated mail", () => {
    const dated = summarize([{ item: { message_ts: "2026-03-01T12:00:00Z" } }]);
    const mixed = summarize([
      { item: { message_ts: "2026-03-01T12:00:00Z" } },
      { item: { message_ts: "nonsense", created_at: "nonsense" } },
    ]);
    const plan = build_chunk_skip_plan({
      terms: [],
      operators: [],
      filters: { date_from: "2026-06-01" },
      probe_terms: false,
    });

    expect(plan.skip_by_summary(dated)).toBe(true);
    expect(plan.skip_by_summary(mixed)).toBe(false);
  });

  it("reports no summary use when nothing is skippable", () => {
    const plan = build_chunk_skip_plan({
      terms: [],
      operators: parse_search_query("id:abc").operators,
      probe_terms: false,
    });

    expect(plan.uses_summary).toBe(false);
    expect(plan.uses_grams).toBe(false);
  });
});

describe("recipient grams", () => {
  const gram_plan = (term: string) =>
    build_chunk_skip_plan({ terms: [term], operators: [], probe_terms: true });

  const chunk_filter = (entry: EntryOverrides) =>
    parse_gram_filter(
      summarize_chunk([make_item()], [make_entry(entry)]).grams,
    )!;

  it("does not skip a chunk whose recipient is only on cc", () => {
    const filter = chunk_filter({
      cc: [{ name: "Priya Nair", email: "priya@partner.com" }],
    });

    expect(gram_plan("priya").skip_by_grams(filter)).toBe(false);
    expect(gram_plan("nair").skip_by_grams(filter)).toBe(false);
  });

  it("does not skip a chunk whose recipient is only on bcc", () => {
    const filter = chunk_filter({
      bcc: [{ name: "Omar Diaz", email: "omar@partner.com" }],
    });

    expect(gram_plan("omar").skip_by_grams(filter)).toBe(false);
  });

  it("still skips a chunk that has no such recipient", () => {
    const filter = chunk_filter({
      cc: [{ name: "Priya Nair", email: "priya@partner.com" }],
    });

    expect(gram_plan("zzzzqqqq").skip_by_grams(filter)).toBe(true);
  });
});

describe("normalized recipient and sender grams", () => {
  const gram_plan = (term: string) =>
    build_chunk_skip_plan({ terms: [term], operators: [], probe_terms: true });

  it("does not skip a chunk whose recipients are plain strings", () => {
    const summary = summarize_chunk(
      [make_item()],
      [
        {
          envelope: {
            subject: "Contract",
            body_text: "",
            from: "Cassie Lang <cassie@example.com>",
            to: ["Dana Reyes <dana@partner.com>"],
            cc: ["priya@partner.com"],
            bcc: [],
            sent_at: "2026-01-01T00:00:00Z",
          } as unknown as DecryptedEnvelope,
          metadata: null,
        },
      ],
    );
    const filter = parse_gram_filter(summary.grams)!;

    expect(gram_plan("dana").skip_by_grams(filter)).toBe(false);
    expect(gram_plan("priya").skip_by_grams(filter)).toBe(false);
    expect(gram_plan("cassie").skip_by_grams(filter)).toBe(false);
    expect(gram_plan("zzzzqqqq").skip_by_grams(filter)).toBe(true);
  });
});
