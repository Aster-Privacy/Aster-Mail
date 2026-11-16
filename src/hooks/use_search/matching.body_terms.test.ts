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

import { matches_query } from "./matching";

import { parse_search_query } from "@/utils/search_operators";
import { split_search_terms } from "@/utils/search_query";

const envelope: DecryptedEnvelope = {
  subject: "Weekly update",
  body_text: "Short preview text.",
  body_html: "",
  from: { name: "Team", email: "team@example.com" },
  to: [],
  cc: [],
  bcc: [],
  sent_at: "2026-01-01T00:00:00Z",
};
const metadata = {} as MailItemMetadata;
const item = {
  id: "update",
  item_type: "received",
  is_trashed: false,
  is_spam: false,
  created_at: envelope.sent_at,
} as MailItem;

function run(query: string, body_hit?: (term: string) => boolean) {
  const parsed = parse_search_query(query);

  return matches_query(
    split_search_terms(parsed.text_query),
    parsed.operators,
    envelope,
    metadata,
    item,
    undefined,
    undefined,
    true,
    "short preview text.",
    undefined,
    undefined,
    body_hit,
  );
}

describe("body search past the inline body copy", () => {
  const deep = (term: string) => term.toLowerCase().startsWith("quetz");

  it("matches a word found only in the indexed body words", () => {
    expect(run("quetzal")).toBe(false);
    expect(run("quetzal", deep)).toBe(true);
  });

  it("excludes mail whose indexed body words hold a negated term", () => {
    expect(run("update -quetzal")).toBe(true);
    expect(run("update -quetzal", deep)).toBe(false);
  });

  it("still requires every other term to match", () => {
    expect(run("quetzal absentterm", deep)).toBe(false);
    expect(run("quetzal weekly", deep)).toBe(true);
  });
});
