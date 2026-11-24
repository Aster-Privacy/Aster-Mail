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
import { get_field_label_key } from "@/components/mail_rules/dropdowns/field_dropdown";
import {
  default_condition_for_field,
  field_kind,
} from "@/components/mail_rules/field_kind";
import {
  condition_has_value,
  condition_ready_to_save,
} from "@/components/modals/rule_editor_helpers";
import {
  SOURCE_ASTER_VALUE,
  create_rule,
  list_rules,
} from "@/services/api/mail_rules";
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

const SOURCE_ID = "0b0e6f0c-6a55-4d0e-9d55-1f6a4a1d2c33";

function wire_rule(conditions: unknown[]) {
  return {
    id: "rule-1",
    name: "Rule",
    color: "#6366f1",
    enabled: true,
    priority: 0,
    match_mode: "all",
    conditions,
    actions: [],
    applied_count: 0,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

async function read_conditions(conditions: unknown[]) {
  vi.mocked(api_client.get).mockResolvedValue({
    data: { rules: [wire_rule(conditions)] },
  });
  const result = await list_rules();

  return result.data?.rules[0].conditions;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("source condition in the visual editor", () => {
  it("has its own field kind and an empty default", () => {
    expect(field_kind("source")).toBe("source");
    expect(default_condition_for_field("source")).toEqual({
      type: "source",
      operator: "is",
      values: [],
    });
  });

  it("offers only is and is not", () => {
    expect(OPERATORS_BY_FIELD("source").map((o) => o.value)).toEqual([
      "is",
      "is_not",
    ]);
  });

  it("has an English label for the field", () => {
    expect(get_field_label_key("source")).toBe(
      "settings.ext_v2_rule_field_source",
    );
    expect(en.settings.ext_v2_rule_field_source).toBeTruthy();
    expect(en.settings.ext_v2_rule_source_aster).toBeTruthy();
    expect(en.settings.ext_v2_source_removed).toBeTruthy();
  });

  it("needs at least one value before it can be saved", () => {
    expect(
      condition_has_value({ type: "source", operator: "is", values: [] }),
    ).toBe(false);
    expect(
      condition_ready_to_save({ type: "source", operator: "is", values: [] }),
    ).toBe(false);
    expect(
      condition_ready_to_save({
        type: "source",
        operator: "is_not",
        values: [SOURCE_ASTER_VALUE],
      }),
    ).toBe(true);
  });
});

describe("source condition wire format", () => {
  it("sends the field, operator and values", async () => {
    vi.mocked(api_client.post).mockResolvedValue({
      data: { id: "rule-1", success: true },
    });
    await create_rule({
      name: "Rule",
      color: "#6366f1",
      enabled: true,
      match_mode: "all",
      conditions: [
        {
          type: "source",
          operator: "is_not",
          values: [SOURCE_ASTER_VALUE, SOURCE_ID],
        },
      ],
      actions: [],
    });

    const body = vi.mocked(api_client.post).mock.calls[0][1] as {
      conditions: unknown[];
    };

    expect(body.conditions).toEqual([
      { field: "source", op: "is_not", values: ["aster", SOURCE_ID] },
    ]);
  });

  it("reads a values array", async () => {
    expect(
      await read_conditions([
        { field: "source", op: "is", values: [SOURCE_ID, "aster"] },
      ]),
    ).toEqual([
      { type: "source", operator: "is", values: [SOURCE_ID, "aster"] },
    ]);
  });

  it("reads a comma separated value and drops blanks and duplicates", async () => {
    expect(
      await read_conditions([
        { field: "source", op: "is_not", value: `aster, ${SOURCE_ID},,aster` },
      ]),
    ).toEqual([
      { type: "source", operator: "is_not", values: ["aster", SOURCE_ID] },
    ]);
  });

  it("falls back to is for an unknown operator and ignores non string values", async () => {
    expect(
      await read_conditions([
        { field: "source", op: "contains", values: ["aster", 7, null] },
      ]),
    ).toEqual([{ type: "source", operator: "is", values: ["aster"] }]);
  });

  it("reads a source condition nested in a group", async () => {
    expect(
      await read_conditions([
        {
          field: "or",
          conditions: [
            { field: "source", op: "is", values: ["aster"] },
            { field: "subject", op: "contains", value: "x" },
          ],
        },
      ]),
    ).toMatchObject([
      {
        type: "or",
        conditions: [
          { type: "source", operator: "is", values: ["aster"] },
          { type: "subject" },
        ],
      },
    ]);
  });
});

describe("source condition expression", () => {
  it("serializes values as one comma separated string", () => {
    expect(
      serialize({
        type: "source",
        operator: "is",
        values: [SOURCE_ID, "aster"],
      }),
    ).toBe(`source is "${SOURCE_ID},aster"`);
  });

  it("round trips both operators", () => {
    for (const op of ["is", "is_not"]) {
      const src = `source ${op} "aster,${SOURCE_ID}"`;
      const result = parse(src);

      expect(result.ok, src).toBe(true);
      if (!result.ok) continue;
      expect(result.ast).toEqual({
        type: "source",
        operator: op,
        values: ["aster", SOURCE_ID],
      });
      expect(serialize(result.ast)).toBe(src);
    }
  });

  it("trims spaces and drops duplicates when parsing", () => {
    const result = parse('source is " aster , aster ,"');

    expect(result).toEqual({
      ok: true,
      ast: { type: "source", operator: "is", values: ["aster"] },
    });
  });

  it("rejects more sources than a rule can hold", () => {
    const at_cap = Array.from({ length: 50 }, (_, i) => `s${i}`).join(",");
    const over_cap = `${at_cap},s50`;

    expect(parse(`source is "${at_cap}"`).ok).toBe(true);
    const result = parse(`source is "${over_cap}"`);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("too_many_sources:50");
  });

  it("parses inside a larger expression", () => {
    const result = parse('source is_not "aster" and subject contains "x"');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.ast).toMatchObject({
      type: "and",
      conditions: [{ type: "source", operator: "is_not" }, { type: "subject" }],
    });
  });

  it("rejects other operators", () => {
    const result = parse('source contains "aster"');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("bad_text_op:contains");
  });
});
