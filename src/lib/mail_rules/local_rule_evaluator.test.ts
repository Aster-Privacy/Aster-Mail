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
import type { Condition, LeafCondition } from "@/services/api/mail_rules";

import { describe, expect, it } from "vitest";

import {
  evaluate_rule_locally,
  local_input_from_envelope,
  local_input_is_complete,
  rule_supports_local_evaluation,
} from "@/lib/mail_rules/local_rule_evaluator";
import {
  address_matches,
  domain_list_entries,
} from "@/lib/mail_rules/address_match";

const politics_rule = {
  match_mode: "any" as const,
  conditions: [
    {
      type: "from",
      operator: "matches_domain",
      value: "newsclub.org, Example.ORG ,other.org;  Third.Net",
    },
    {
      type: "from",
      operator: "is",
      value: "friend@mail.example",
    },
  ] as LeafCondition[],
};

function input_from(from: unknown, extra: Record<string, unknown> = {}) {
  return local_input_from_envelope(
    { from, subject: "Update", ...extra },
    { has_attachments: false, size_bytes: 1024 },
  );
}

describe("politics rule", () => {
  it("matches every listed domain with display-name senders", () => {
    for (const from of [
      { name: "News Club", email: "News@NewsClub.org" },
      '"News Club" <News@Mail.NewsClub.org>',
      "Example Team <hello@example.org>",
      "someone@OTHER.org",
      { name: "Third", email: "x@third.net" },
    ]) {
      expect(evaluate_rule_locally(politics_rule, input_from(from))).toBe(true);
    }
  });

  it("matches the exact address case-insensitively", () => {
    expect(
      evaluate_rule_locally(
        politics_rule,
        input_from("Friend <FrIend@Mail.Example>"),
      ),
    ).toBe(true);
    expect(
      evaluate_rule_locally(
        politics_rule,
        local_input_from_envelope(
          { from_email: "friend@mail.example" },
          {},
        ),
      ),
    ).toBe(true);
  });

  it("rejects lookalike and unrelated senders", () => {
    for (const from of [
      "a@notnewsclub.org",
      "a@newsclub.org.evil.com",
      "newsclub.org@attacker.test",
      "martin@gmail.com",
    ]) {
      expect(evaluate_rule_locally(politics_rule, input_from(from))).toBe(
        false,
      );
    }
  });

  it("requires every condition in all mode", () => {
    expect(
      evaluate_rule_locally(
        { ...politics_rule, match_mode: "all" },
        input_from("news@newsclub.org"),
      ),
    ).toBe(false);
  });

  it("is supported for local evaluation", () => {
    expect(rule_supports_local_evaluation(politics_rule)).toBe(true);
  });
});

describe("address_matches", () => {
  it("excludes every listed domain for does_not_match_domain", () => {
    const value = "a.org, b.org";

    expect(
      address_matches("x@news.a.org", "does_not_match_domain", value, false),
    ).toBe(false);
    expect(
      address_matches("x@c.org", "does_not_match_domain", value, false),
    ).toBe(true);
  });

  it("accepts an address list for is", () => {
    expect(
      address_matches("B@Y.org", "is", " a@x.org , b@y.org;@z.org ", false),
    ).toBe(true);
    expect(address_matches("q@z.org", "is", "a@x.org;@z.org", false)).toBe(
      true,
    );
    expect(address_matches("c@x.org", "is", "a@x.org, b@y.org", false)).toBe(
      false,
    );
  });

  it("splits domain lists on commas, semicolons, and spaces", () => {
    expect(domain_list_entries(" @a.org,  *.b.org ;c.org. \n d.org")).toEqual([
      "a.org",
      "b.org",
      "c.org",
      "d.org",
    ]);
  });
});

describe("local evaluation support", () => {
  it("refuses rules with conditions only the server can check", () => {
    const spam: Condition = {
      type: "spam_score",
      operator: "greater_than",
      value: 5,
    };
    const regex: Condition = {
      type: "subject",
      operator: "matches_regex",
      value: "^x",
    };

    expect(
      rule_supports_local_evaluation({ match_mode: "any", conditions: [spam] }),
    ).toBe(false);
    expect(
      rule_supports_local_evaluation({
        match_mode: "all",
        conditions: [{ type: "or", conditions: [regex] }],
      }),
    ).toBe(false);
  });

  it("reads recipients and headers from the envelope", () => {
    const input = local_input_from_envelope(
      {
        from: { name: "A", email: "a@x.org" },
        to: [{ name: "Me", email: "me@aster.test" }, "Other <o@y.org>"],
        raw_headers: [
          { name: "List-Id", value: "<news.x.org>" },
          { name: "Reply-To", value: "r@x.org" },
        ],
      },
      { has_attachments: true, size_bytes: 10 },
    );

    expect(input.to).toEqual(["me@aster.test", "o@y.org"]);
    expect(input.reply_to).toEqual(["r@x.org"]);
    expect(
      evaluate_rule_locally(
        {
          match_mode: "all",
          conditions: [
            { type: "has_list_id", value: true },
            { type: "to", operator: "matches_domain", value: "y.org" },
            { type: "has_attachment", value: true },
          ],
        },
        input,
      ),
    ).toBe(true);
  });
});

describe("attachment name rules", () => {
  const contract_note_rule = {
    match_mode: "all" as const,
    conditions: [
      {
        type: "attachment_name",
        operator: "contains",
        value: "SP0874",
        case_sensitive: true,
      },
    ] as LeafCondition[],
  };

  function input_with_attachments(attachment_keys: unknown) {
    return local_input_from_envelope(
      {
        from: "notices@broker.example",
        subject: "Contract note",
        attachment_keys,
      },
      { has_attachments: true, size_bytes: 2048 },
    );
  }

  it("evaluates attachment names on the device", () => {
    expect(rule_supports_local_evaluation(contract_note_rule)).toBe(true);
    expect(
      rule_supports_local_evaluation({
        match_mode: "all",
        conditions: [
          { type: "attachment_name", operator: "matches_regex", value: "^CN" },
        ],
      }),
    ).toBe(false);
  });

  it("matches a sealed attachment file name", () => {
    const input = input_with_attachments([
      { seq: 0, key: "k", filename: "CN_SP0874_13112026.pdf", size: 10 },
    ]);

    expect(local_input_is_complete(contract_note_rule, input)).toBe(true);
    expect(evaluate_rule_locally(contract_note_rule, input)).toBe(true);
  });

  it("respects case sensitivity and ends_with", () => {
    const input = input_with_attachments([
      { seq: 0, key: "k", filename: "cn_sp0874.PDF", size: 10 },
    ]);

    expect(evaluate_rule_locally(contract_note_rule, input)).toBe(false);
    expect(
      evaluate_rule_locally(
        {
          match_mode: "all",
          conditions: [
            { type: "attachment_name", operator: "ends_with", value: ".pdf" },
          ],
        },
        input,
      ),
    ).toBe(true);
  });

  it("never matches an empty value", () => {
    const input = input_with_attachments([
      { seq: 0, key: "k", filename: "report.pdf", size: 10 },
    ]);

    expect(
      evaluate_rule_locally(
        {
          match_mode: "all",
          conditions: [
            { type: "attachment_name", operator: "contains", value: "" },
          ],
        },
        input,
      ),
    ).toBe(false);
  });

  it("skips messages whose attachment names are unknown", () => {
    const negated = {
      match_mode: "all" as const,
      conditions: [
        {
          type: "not",
          condition: {
            type: "attachment_name",
            operator: "contains",
            value: "SP0874",
          },
        },
      ] as Condition[],
    };
    const keys_only = input_with_attachments([{ seq: 0, key: "k" }]);
    const missing = input_with_attachments(undefined);

    expect(keys_only.attachment_names).toBeNull();
    expect(missing.attachment_names).toBeNull();
    expect(local_input_is_complete(negated, keys_only)).toBe(false);
    expect(local_input_is_complete(contract_note_rule, missing)).toBe(false);
    expect(
      local_input_is_complete(politics_rule, input_from("a@newsclub.org")),
    ).toBe(true);
  });

  it("treats a message without attachments as having no names", () => {
    const input = input_from("a@x.org");

    expect(input.attachment_names).toEqual([]);
    expect(local_input_is_complete(contract_note_rule, input)).toBe(true);
    expect(evaluate_rule_locally(contract_note_rule, input)).toBe(false);
  });
});
