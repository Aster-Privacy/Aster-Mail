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

import {
  matches_query,
  operator_needs_body,
  query_requires_body,
} from "./matching";

import {
  create_active_filters,
  get_operator_suggestions,
  is_known_has_value,
  parse_search_query,
  unrecognized_has_values,
  validate_operator,
} from "@/utils/search_operators";
import {
  build_chunk_skip_plan,
  summarize_chunk,
} from "@/services/search_chunk_filter";

const envelope: DecryptedEnvelope = {
  subject: "Quarterly report",
  body_text: "Numbers attached.",
  body_html: "",
  from: { name: "Finance", email: "finance@example.com" },
  to: [],
  cc: [],
  bcc: [],
  sent_at: "2026-01-01T00:00:00Z",
};

function make_item(
  tag_tokens?: string[],
  folders?: { token: string; name: string }[],
): MailItem {
  return {
    id: "report",
    item_type: "received",
    is_trashed: false,
    is_spam: false,
    created_at: envelope.sent_at,
    tag_tokens,
    folders,
  } as MailItem;
}

function match(
  query: string,
  item: MailItem,
  has_attachments: boolean = false,
): boolean {
  return matches_query(
    [],
    parse_search_query(query).operators,
    envelope,
    { has_attachments } as MailItemMetadata,
    item,
  );
}

function skips(query: string, items: MailItem[]): boolean {
  const { summary } = summarize_chunk(
    items,
    items.map(() => ({
      envelope,
      metadata: { has_attachments: false } as MailItemMetadata,
    })),
  );
  const plan = build_chunk_skip_plan({
    terms: [],
    operators: parse_search_query(query).operators,
    probe_terms: false,
  });

  return plan.uses_summary && plan.skip_by_summary(summary);
}

describe("has:nolabel", () => {
  it("matches mail that has no label", () => {
    expect(match("has:nolabel", make_item())).toBe(true);
    expect(match("has:nolabel", make_item([]))).toBe(true);
    expect(match("HAS:NoLabel", make_item([]))).toBe(true);
  });

  it("does not match mail that has a label", () => {
    expect(match("has:nolabel", make_item(["tag-a"]))).toBe(false);
    expect(match("has:nolabel", make_item(["tag-a", "tag-b"]))).toBe(false);
  });

  it("ignores folders and attachments", () => {
    const filed = make_item([], [{ token: "folder-a", name: "Clients" }]);

    expect(match("has:nolabel", filed)).toBe(true);
    expect(match("has:nolabel", make_item([]), true)).toBe(true);
    expect(match("has:nolabel", make_item(["tag-a"]), true)).toBe(false);
  });

  it("inverts when negated", () => {
    expect(match("-has:nolabel", make_item(["tag-a"]))).toBe(true);
    expect(match("-has:nolabel", make_item([]))).toBe(false);
  });

  it("combines with other operators", () => {
    expect(match("has:nolabel has:attachment", make_item([]), true)).toBe(true);
    expect(match("has:nolabel has:attachment", make_item([]), false)).toBe(
      false,
    );
    expect(match("has:nolabel from:finance", make_item([]))).toBe(true);
    expect(match("has:nolabel from:sales", make_item([]))).toBe(false);
  });

  it("never needs message bodies", () => {
    const [op] = parse_search_query("has:nolabel").operators;

    expect(operator_needs_body(op)).toBe(false);
    expect(query_requires_body([], [op])).toBe(false);
  });

  it("does not skip chunks that hold no attachments", () => {
    expect(skips("has:nolabel", [make_item([]), make_item(["tag-a"])])).toBe(
      false,
    );
    expect(skips("has:attachment", [make_item([])])).toBe(true);
  });

  it("is a valid, suggested, and described operator", () => {
    const [op] = parse_search_query("has:nolabel").operators;
    const [negated] = parse_search_query("-has:nolabel").operators;

    expect(validate_operator(op)).toBe(true);
    expect(
      get_operator_suggestions("has:no").map((entry) => entry.operator),
    ).toContain("has:nolabel");
    expect(create_active_filters([op])[0].label).toBe("No label");
    expect(create_active_filters([negated])[0].label).toBe("Has a label");
  });
});

describe("unrecognized has: values", () => {
  it("lists each unknown value once", () => {
    const { operators } = parse_search_query(
      "has:nolabels has:attachment -has:foo has:nolabels has:pdf",
    );

    expect(unrecognized_has_values(operators)).toEqual(["nolabels", "foo"]);
  });

  it("accepts every documented value", () => {
    for (const value of [
      "attachment",
      "attachments",
      "pdf",
      "image",
      "document",
      "spreadsheet",
      "video",
      "audio",
      "archive",
      "nolabel",
      "NoLabel",
    ]) {
      expect(is_known_has_value(value), value).toBe(true);
    }
    expect(
      unrecognized_has_values(parse_search_query("is:foo").operators),
    ).toEqual([]);
  });

  it("matches nothing instead of falling back to attachments", () => {
    expect(match("has:unlabelled", make_item([]), true)).toBe(false);
    expect(match("has:unlabelled", make_item(["tag-a"]), true)).toBe(false);
    expect(match("-has:unlabelled", make_item([]), true)).toBe(false);
    expect(match("has:unlabelled", make_item([]), false)).toBe(false);
  });

  it("is rejected by validation and skips every chunk", () => {
    const [op] = parse_search_query("has:unlabelled").operators;

    expect(validate_operator(op)).toBe(false);
    expect(operator_needs_body(op)).toBe(false);
    expect(skips("has:unlabelled", [make_item([])])).toBe(true);
  });
});
