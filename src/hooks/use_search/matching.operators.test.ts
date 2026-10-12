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

import { afterEach, describe, expect, it } from "vitest";

import { matches_query } from "./matching";

import { parse_search_query } from "@/utils/search_operators";
import { split_search_terms } from "@/utils/search_query";
import { set_display_time_zone } from "@/utils/date_format";

const envelope: DecryptedEnvelope = {
  subject: "Résumé for the Quarterly Report",
  body_text: "Please see the attached document before Friday.",
  body_html: "",
  from: { name: "Bob Stone", email: "bob@example.com" },
  to: [{ name: "Val Moreno", email: "val@example.com" }],
  cc: [{ name: "Dana Reed", email: "dana@example.org" }],
  bcc: [],
  sent_at: "2026-03-01T16:00:00Z",
  attachment_keys: [
    {
      seq: 0,
      key: "test-key",
      filename: "report.pdf",
      content_type: "application/pdf",
    },
  ],
};

const metadata = {
  has_attachments: true,
  is_read: false,
  is_starred: false,
  size_bytes: 2 * 1024 * 1024,
} as MailItemMetadata;

function make_item(overrides: Partial<MailItem> = {}): MailItem {
  return {
    id: "item-1",
    item_type: "received",
    is_trashed: false,
    is_spam: false,
    created_at: "2026-03-01T16:00:00Z",
    ...overrides,
  } as MailItem;
}

function match(
  query: string,
  item: MailItem = make_item(),
  label_name_to_tokens?: Map<string, string[]>,
  source: DecryptedEnvelope = envelope,
): boolean {
  const parsed = parse_search_query(query);

  return matches_query(
    split_search_terms(parsed.text_query),
    parsed.operators,
    source,
    metadata,
    item,
    label_name_to_tokens,
  );
}

afterEach(() => {
  set_display_time_zone(undefined);
});

describe("free text", () => {
  it("requires every unquoted word", () => {
    expect(match("document attached")).toBe(true);
    expect(match("document missing")).toBe(false);
  });

  it("matches a quoted phrase only as one run of text", () => {
    expect(match('"attached document"')).toBe(true);
    expect(match('"document attached"')).toBe(false);
    expect(match('"quarterly report" friday')).toBe(true);
  });

  it("ignores case and accents", () => {
    expect(match("resume")).toBe(true);
    expect(match("RÉSUMÉ")).toBe(true);
  });

  it("treats lowercase not as a word to find", () => {
    expect(match("not attached")).toBe(false);
    expect(
      match("not attached", make_item(), undefined, {
        ...envelope,
        body_text: "This file is not attached yet.",
      }),
    ).toBe(true);
  });

  it("excludes a message that has a NOT term in any searched field", () => {
    expect(match("NOT quarterly")).toBe(false);
    expect(match("NOT stone")).toBe(false);
    expect(match("NOT moreno")).toBe(false);
    expect(match("NOT friday")).toBe(false);
    expect(match("NOT zebra")).toBe(true);
    expect(match("report NOT zebra")).toBe(true);
    expect(match("report NOT friday")).toBe(false);
  });

  it("does not match everything for an operator it cannot evaluate", () => {
    expect(match("size:5mb")).toBe(false);
    expect(match("larger:big")).toBe(false);
    expect(match("size:1mb-5mb")).toBe(true);
    expect(match("size:5mb-9mb")).toBe(false);
  });
});

describe("negated operators", () => {
  it.each(["-from:bob@example.com", "NOT from:bob@example.com"])(
    "excludes the sender with %s",
    (query) => {
      expect(match(query)).toBe(false);
    },
  );

  it("keeps a message from someone else", () => {
    expect(match("-from:alice@example.com")).toBe(true);
    expect(match("NOT from:alice@example.com")).toBe(true);
  });
});

describe("people operators", () => {
  it("matches a full to: address exactly", () => {
    expect(match("to:val@example.com")).toBe(true);
    expect(match("to:al@example.com")).toBe(false);
    expect(match("to:dana@example.org")).toBe(true);
    expect(match("to:dana@example.or")).toBe(false);
  });

  it("matches a partial to: value as a substring", () => {
    expect(match("to:moreno")).toBe(true);
    expect(match("to:example")).toBe(true);
    expect(match("to:stone")).toBe(false);
  });

  it("matches a full from: address exactly", () => {
    expect(match("from:bob@example.com")).toBe(true);
    expect(match("from:ob@example.com")).toBe(false);
    expect(match("from:stone")).toBe(true);
  });

  it("matches any of several values of one type", () => {
    expect(match("from:alice from:bob")).toBe(true);
    expect(match("from:alice from:carol")).toBe(false);
    expect(match("to:nobody to:val@example.com")).toBe(true);
    expect(match("contact:nobody contact:dana")).toBe(true);
    expect(match("contact:nobody contact:noone")).toBe(false);
  });

  it("still requires every type to match", () => {
    expect(match("from:bob to:val")).toBe(true);
    expect(match("from:alice from:bob to:nobody")).toBe(false);
    expect(match("from:bob -from:bob")).toBe(false);
  });
});

describe("attachment types", () => {
  it("matches any of several has: types", () => {
    expect(match("has:pdf has:image")).toBe(true);
    expect(match("has:video has:image")).toBe(false);
  });

  it("requires has:attachment together with a type", () => {
    expect(match("has:attachment has:pdf")).toBe(true);
    expect(match("has:attachment has:video")).toBe(false);
  });

  it("needs real attachment metadata", () => {
    const source = {
      ...envelope,
      body_text: "report.pdf",
      attachment_keys: undefined,
    };

    expect(match("has:pdf", make_item(), undefined, source)).toBe(false);
    expect(match("filename:report.pdf", make_item(), undefined, source)).toBe(
      false,
    );
    expect(match("filename:report")).toBe(true);
  });
});

describe("label operator", () => {
  const names = new Map<string, string[]>([
    ["Work", ["token-work"]],
    ["Workshop", ["token-workshop"]],
    ["Café", ["token-cafe"]],
  ]);
  const work_item = make_item({
    labels: [{ token: "token-work", name: "Work" }],
  } as Partial<MailItem>);
  const workshop_item = make_item({
    labels: [{ token: "token-workshop", name: "Workshop" }],
  } as Partial<MailItem>);
  const cafe_item = make_item({
    folders: [{ token: "token-cafe", name: "Café" }],
  } as Partial<MailItem>);

  it("prefers an exact label name", () => {
    expect(match("label:work", work_item, names)).toBe(true);
    expect(match("label:work", workshop_item, names)).toBe(false);
  });

  it("falls back to a prefix only when no name matches exactly", () => {
    expect(match("label:works", workshop_item, names)).toBe(true);
    expect(match("label:works", work_item, names)).toBe(false);
  });

  it("does not match the middle of a name", () => {
    expect(match("label:shop", workshop_item, names)).toBe(false);
    expect(match("label:shop", workshop_item)).toBe(false);
  });

  it("folds case and accents", () => {
    expect(match("label:CAFE", cafe_item, names)).toBe(true);
    expect(match("folder:cafe", cafe_item)).toBe(true);
  });

  it("uses the names on the message when no label list is known", () => {
    expect(match("label:work", work_item)).toBe(true);
    expect(match("label:wor", workshop_item)).toBe(true);
    expect(match("label:other", work_item)).toBe(false);
  });
});

describe("dates in the display time zone", () => {
  const at = (iso: string) => make_item({ created_at: iso });

  it("matches a single day from local midnight to local midnight", () => {
    set_display_time_zone("Asia/Tokyo");

    expect(match("date:2026-03-02", at("2026-03-01T14:59:59Z"))).toBe(false);
    expect(match("date:2026-03-02", at("2026-03-01T15:00:00Z"))).toBe(true);
    expect(match("date:2026-03-02", at("2026-03-02T14:59:59Z"))).toBe(true);
    expect(match("date:2026-03-02", at("2026-03-02T15:00:00Z"))).toBe(false);
  });

  it("includes the day for after: and excludes it for before:", () => {
    set_display_time_zone("Asia/Tokyo");

    expect(match("after:2026-03-02", at("2026-03-01T15:00:00Z"))).toBe(true);
    expect(match("after:2026-03-02", at("2026-03-01T14:59:59Z"))).toBe(false);
    expect(match("before:2026-03-02", at("2026-03-01T14:59:59Z"))).toBe(true);
    expect(match("before:2026-03-02", at("2026-03-01T15:00:00Z"))).toBe(false);
  });

  it("covers both days of a range written the way the picker writes it", () => {
    set_display_time_zone("America/Los_Angeles");

    const query = "after:2026-03-02 before:2026-03-04";

    expect(match(query, at("2026-03-02T07:59:59Z"))).toBe(false);
    expect(match(query, at("2026-03-02T08:00:00Z"))).toBe(true);
    expect(match(query, at("2026-03-04T07:59:59Z"))).toBe(true);
    expect(match(query, at("2026-03-04T08:00:00Z"))).toBe(false);
  });
});
