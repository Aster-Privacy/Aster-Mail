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
import type { RelatedPersonEntry } from "@/types/contacts";

import { describe, expect, it } from "vitest";

import {
  MAX_RELATIONS,
  MAX_RELATION_LABEL_LENGTH,
  MAX_RELATION_VALUE_LENGTH,
  RELATION_KINDS,
  clean_relation_text,
  decode_relation,
  encode_relation,
  merge_related_people,
  normalize_related_people,
  relation_ab_label,
  relation_from_android_type,
  relation_from_label,
  relation_from_vcard_types,
  relation_kind_options,
  relation_search_terms,
  relation_vcard_type,
  set_relation_kind,
  set_relation_label,
} from "@/utils/contact_relations";

describe("encode_relation and decode_relation", () => {
  it("round-trips every picker kind", () => {
    for (const kind of RELATION_KINDS) {
      const label = kind === "custom" ? "Coach" : "";
      const decoded = decode_relation(encode_relation(kind, label, "Pat"));

      expect(decoded).toEqual({ kind, label, value: "Pat" });
    }
  });

  it("stores the specific kinds on legacy-compatible types", () => {
    expect(encode_relation("mother", "", "Ana")).toEqual({
      value: "Ana",
      type: "parent",
      relation: "mother",
    });
    expect(encode_relation("sister", "", "Ida")).toEqual({
      value: "Ida",
      type: "sibling",
      relation: "sister",
    });
    expect(encode_relation("relative", "", "Mei")).toEqual({
      value: "Mei",
      type: "other",
      relation: "relative",
    });
    expect(encode_relation("custom", "  ", "Rui")).toEqual({
      value: "Rui",
      type: "other",
    });
  });

  it("reads legacy parent and sibling entries", () => {
    expect(decode_relation({ value: "Bo", type: "parent" })?.kind).toBe(
      "parent",
    );
    expect(decode_relation({ value: "Bo", type: "sibling" })?.kind).toBe(
      "sibling",
    );
    expect(relation_kind_options("parent")).toContain("parent");
    expect(relation_kind_options().at(-1)).toBe("custom");
  });

  it("shows an unknown future type as a custom label", () => {
    expect(decode_relation({ value: "Noor", type: "godmother" })).toEqual({
      kind: "custom",
      label: "godmother",
      value: "Noor",
    });
    expect(
      decode_relation({ value: "Noor", type: "godmother", label: "Godmother" }),
    ).toEqual({ kind: "custom", label: "Godmother", value: "Noor" });
  });

  it("ignores junk", () => {
    expect(decode_relation(null)).toBeNull();
    expect(decode_relation("Ana")).toBeNull();
    expect(decode_relation([{ value: "Ana" }])).toBeNull();
    expect(decode_relation({ value: 4, type: "friend" })).toBeNull();
  });

  it("keeps the label when switching to custom and drops it otherwise", () => {
    const custom = set_relation_label(
      { value: "Rui", type: "friend" },
      "Godparent",
    );

    expect(set_relation_kind(custom, "custom")).toEqual({
      value: "Rui",
      type: "other",
      label: "Godparent",
    });
    expect(set_relation_kind(custom, "father")).toEqual({
      value: "Rui",
      type: "parent",
      relation: "father",
    });
  });
});

describe("normalize_related_people", () => {
  it("returns undefined for a missing field so old payloads stay untouched", () => {
    expect(normalize_related_people(undefined)).toBeUndefined();
    expect(normalize_related_people(null)).toBeUndefined();
    expect(normalize_related_people("x")).toBeUndefined();
  });

  it("drops empty, whitespace-only and junk rows", () => {
    expect(
      normalize_related_people([
        { value: "", type: "friend" },
        { value: " \t ", type: "friend" },
        { value: " ", type: "friend" },
        null,
        7,
        { type: "friend" },
      ]),
    ).toEqual([]);
  });

  it("trims and caps long values and labels by code point", () => {
    const long_value = "\u{1F600}".repeat(MAX_RELATION_VALUE_LENGTH + 20);
    const long_label = "L".repeat(MAX_RELATION_LABEL_LENGTH + 10);
    const [entry] = normalize_related_people([
      { value: `  ${long_value}  `, type: "other", label: long_label },
    ]) as RelatedPersonEntry[];

    expect(Array.from(entry.value)).toHaveLength(MAX_RELATION_VALUE_LENGTH);
    expect(entry.label).toHaveLength(MAX_RELATION_LABEL_LENGTH);
  });

  it("replaces control characters", () => {
    expect(clean_relation_text("Ana\nLima\u0000", 50)).toBe("Ana Lima");
  });

  it("drops an empty custom label but keeps the row", () => {
    expect(
      normalize_related_people([{ value: "Rui", type: "other", label: "  " }]),
    ).toEqual([{ value: "Rui", type: "other" }]);
  });

  it("removes duplicates by kind, label and case-folded NFC value", () => {
    const result = normalize_related_people([
      { value: "Zoë", type: "friend" },
      { value: "zoë", type: "friend" },
      { value: "Zoë", type: "spouse" },
      { value: "Pat", type: "other", label: "Coach" },
      { value: "pat", type: "other", label: "coach" },
      { value: "Pat", type: "other", label: "Mentor" },
    ]);

    expect(result).toEqual([
      { value: "Zoë", type: "friend" },
      { value: "Zoë", type: "spouse" },
      { value: "Pat", type: "other", label: "Coach" },
      { value: "Pat", type: "other", label: "Mentor" },
    ]);
  });

  it("caps the number of entries", () => {
    const many = Array.from({ length: MAX_RELATIONS + 5 }, (_, index) => ({
      value: `Person ${index}`,
      type: "friend",
    }));

    expect(normalize_related_people(many)).toHaveLength(MAX_RELATIONS);
  });

  it("keeps unchanged entries and unknown fields by identity", () => {
    const entry = {
      value: "Noor",
      type: "godmother",
      since: "2020",
    } as unknown as RelatedPersonEntry;
    const [result] = normalize_related_people([entry]) as RelatedPersonEntry[];

    expect(result).toBe(entry);
  });

  it("keeps emoji and right-to-left text", () => {
    const value = "مريم \u{1F338}";

    expect(normalize_related_people([{ value, type: "sister" }])).toEqual([
      { value, type: "sister" },
    ]);
  });
});

describe("merge_related_people", () => {
  it("unions both contacts and dedupes", () => {
    expect(
      merge_related_people([
        [{ value: "Ana", type: "parent", relation: "mother" }],
        [
          { value: "ana", type: "parent", relation: "mother" },
          { value: "Leo", type: "sibling", relation: "brother" },
        ],
      ]),
    ).toEqual([
      { value: "Ana", type: "parent", relation: "mother" },
      { value: "Leo", type: "sibling", relation: "brother" },
    ]);
    expect(merge_related_people([undefined, undefined])).toBeUndefined();
  });
});

describe("relation_search_terms", () => {
  it("includes value, custom label, English and localized kind names", () => {
    const terms = relation_search_terms(
      [
        { value: "Ana", type: "parent", relation: "mother" },
        { value: "Rui", type: "other", label: "Godparent" },
      ],
      (kind) => (kind === "mother" ? "Mãe" : kind),
    );

    expect(terms).toEqual(["Ana", "Mother", "Mãe", "Rui", "Godparent"]);
    expect(relation_search_terms(undefined)).toEqual([]);
  });
});

describe("import mappings", () => {
  it("maps Apple labels", () => {
    expect(relation_from_label("_$!<Mother>!$_")).toEqual({
      kind: "mother",
      label: "",
    });
    expect(relation_from_label("_$!<Partner>!$_").kind).toBe("partner");
    expect(relation_from_label("Godparent")).toEqual({
      kind: "custom",
      label: "Godparent",
    });
  });

  it("maps vCard 4.0 TYPE values", () => {
    expect(relation_from_vcard_types(["kin"]).kind).toBe("relative");
    expect(relation_from_vcard_types(["PREF", "spouse"]).kind).toBe("spouse");
    expect(relation_from_vcard_types(["co-worker"])).toEqual({
      kind: "custom",
      label: "co-worker",
    });
    expect(relation_from_vcard_types([])).toEqual({
      kind: "custom",
      label: "",
    });
  });

  it("maps Android relation type numbers", () => {
    expect(relation_from_android_type(8, "").kind).toBe("mother");
    expect(relation_from_android_type(2, "").kind).toBe("brother");
    expect(relation_from_android_type(12, "").kind).toBe("relative");
    expect(relation_from_android_type(0, "Godparent")).toEqual({
      kind: "custom",
      label: "Godparent",
    });
    expect(relation_from_android_type(11, "").label).toBe("Referred by");
  });

  it("exports standard TYPE values and Apple labels", () => {
    expect(relation_vcard_type("mother")).toBe("parent");
    expect(relation_vcard_type("relative")).toBe("kin");
    expect(relation_vcard_type("manager")).toBeUndefined();
    expect(relation_ab_label({ kind: "manager", label: "", value: "x" })).toBe(
      "_$!<Manager>!$_",
    );
    expect(
      relation_ab_label({ kind: "custom", label: "Coach", value: "x" }),
    ).toBe("Coach");
  });
});
