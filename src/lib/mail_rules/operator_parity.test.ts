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
import { describe, it, expect, vi, beforeEach } from "vitest";

import { parse, serialize } from "./expression_parser";

import { OPERATORS_BY_FIELD } from "@/components/mail_rules/dropdowns/operator_dropdown";
import { condition_has_value } from "@/components/modals/rule_editor_helpers";
import { list_rules, update_rule } from "@/services/api/mail_rules";
import { api_client } from "@/services/api/client";
import { en } from "@/lib/i18n/translations/en";

vi.mock("@/services/api/client", () => ({
  api_client: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

const ADDRESS_FIELDS = [
  "from.address",
  "reply_to.address",
  "to.address",
  "cc.address",
  "bcc.address",
  "recipient.address",
];

const VALUE_ADDRESS_OPS = [
  "is",
  "is_not",
  "contains",
  "does_not_contain",
  "starts_with",
  "ends_with",
  "matches_domain",
  "does_not_match_domain",
  "matches_regex",
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("expression operators", () => {
  it("parses the reported does_not_contain on from.address", () => {
    const result = parse('from.address does_not_contain "newsletter"');

    expect(result).toEqual({
      ok: true,
      ast: { type: "from", operator: "does_not_contain", value: "newsletter" },
    });
  });

  it("round trips every address operator on every address field", () => {
    for (const field of ADDRESS_FIELDS) {
      for (const op of VALUE_ADDRESS_OPS) {
        const src = `${field} ${op} "a@b.c"`;
        const result = parse(src);

        expect(result.ok, src).toBe(true);
        if (!result.ok) continue;
        expect(serialize(result.ast)).toBe(src);
      }
      const empty = `${field} is_empty`;
      const result = parse(empty);

      expect(result.ok, empty).toBe(true);
      if (!result.ok) continue;
      expect(result.ast).toMatchObject({ operator: "is_empty", value: "" });
      expect(serialize(result.ast)).toBe(empty);
    }
  });

  it("keeps starts_with and ends_with native instead of converting to regex", () => {
    const result = parse('from.address starts_with "billing."');

    expect(result).toEqual({
      ok: true,
      ast: { type: "from", operator: "starts_with", value: "billing." },
    });
  });

  it("parses is_not on text and header fields", () => {
    for (const src of [
      'subject is_not "hi"',
      'body is_not "hi"',
      'list_id is_not "hi"',
      'header.X-Mailer is_not "hi"',
    ]) {
      const result = parse(src);

      expect(result.ok, src).toBe(true);
      if (!result.ok) continue;
      expect(result.ast).toMatchObject({ operator: "is_not", value: "hi" });
      expect(serialize(result.ast)).toBe(src);
    }
  });

  it("rejects unknown address operators", () => {
    const result = parse('from.address resembles "x"');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("bad_address_op:resembles");
  });
});

describe("visual editor operators", () => {
  it("offers the same shared operators in the same order for address and text", () => {
    const address = OPERATORS_BY_FIELD("from").map((o) => o.value);
    const text = OPERATORS_BY_FIELD("subject").map((o) => o.value);
    const header = OPERATORS_BY_FIELD("header").map((o) => o.value);

    expect(address).toEqual([
      "is",
      "is_not",
      "contains",
      "does_not_contain",
      "starts_with",
      "ends_with",
      "matches_domain",
      "does_not_match_domain",
      "is_empty",
      "matches_regex",
    ]);
    expect(text).toEqual([
      "is",
      "is_not",
      "contains",
      "does_not_contain",
      "starts_with",
      "ends_with",
      "is_empty",
      "matches_regex",
    ]);
    expect(header).toEqual(text);
    expect(address.filter((o) => text.includes(o))).toEqual(text);
  });

  it("has an English label for every operator", () => {
    for (const field of ["from", "subject", "header"] as const) {
      for (const o of OPERATORS_BY_FIELD(field)) {
        const key = o.label_key.split(".")[1] as keyof typeof en.mail_rules;

        expect(en.mail_rules[key], o.label_key).toBeTruthy();
      }
    }
  });

  it("treats an address is_empty condition as complete without a value", () => {
    expect(
      condition_has_value({ type: "cc", operator: "is_empty", value: "" }),
    ).toBe(true);
    expect(
      condition_has_value({
        type: "cc",
        operator: "does_not_contain",
        value: "",
      }),
    ).toBe(false);
  });
});

describe("operator version negotiation", () => {
  it("asks for current operators when listing rules", async () => {
    vi.mocked(api_client.get).mockResolvedValue({ data: { rules: [] } });
    await list_rules();
    expect(vi.mocked(api_client.get).mock.calls[0][0]).toBe(
      "/mail/v1/mail-rules?ops=2",
    );
  });

  it("asks for current operators when updating a rule", async () => {
    vi.mocked(api_client.patch).mockResolvedValue({ error: "x" });
    await update_rule("rule-1", { enabled: false });
    expect(vi.mocked(api_client.patch).mock.calls[0][0]).toBe(
      "/mail/v1/mail-rules/rule-1?ops=2",
    );
  });
});
