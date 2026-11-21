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
import { describe, expect, it } from "vitest";

import { SETTINGS_SEARCH_REGISTRY } from "@/components/settings/search_registry";
import {
  build_settings_index,
  lookup_in_table,
  rank_settings_index,
} from "@/components/settings/settings_search_index";
import {
  damerau_levenshtein,
  is_searchable_query,
  prepare_search_fields,
  score_search_fields,
} from "@/components/settings/settings_search_match";
import { en } from "@/lib/i18n/translations/en";

const desktop_index = build_settings_index(
  SETTINGS_SEARCH_REGISTRY.filter((entry) => entry.platform !== "mobile"),
  [lookup_in_table(en)],
);

const full_index = build_settings_index(SETTINGS_SEARCH_REGISTRY, [
  lookup_in_table(en),
]);

function top_ids(query: string, limit = 5, index = desktop_index) {
  return rank_settings_index(index, query, limit).map(({ entry }) => entry.id);
}

function fields(label: string, keywords = "", description = "") {
  return prepare_search_fields({
    labels: [label],
    keywords: keywords ? [keywords] : [],
    context: [],
    descriptions: description ? [description] : [],
  });
}

describe("settings search matching", () => {
  it("finds company logos by the word company", () => {
    expect(top_ids("company", 3)).toContain("sender_logos");
    expect(top_ids("Company")).toContain("sender_logos");
  });

  it("ranks an exact title above everything else", () => {
    expect(top_ids("Company logos", 1)).toEqual(["sender_logos"]);
  });

  it("matches synonyms from the keyword list", () => {
    expect(top_ids("favicon", 3)).toContain("sender_logos");
    expect(top_ids("brand", 10)).toContain("sender_logos");
    expect(top_ids("night", 10)).toContain("theme");
    expect(top_ids("dark", 10)).toContain("theme");
    expect(top_ids("2fa", 10)).toContain("authenticator_app");
    expect(top_ids("otp", 10)).toContain("authenticator_app");
    expect(top_ids("out of office", 3)).toContain("vacation_reply_title");
    expect(top_ids("vacation", 3)).toContain("vacation_reply_title");
    expect(top_ids("filters", 10)).toContain("mail_rules_title");
  });

  it("ignores case and accents", () => {
    expect(top_ids("CÓMPANY", 3)).toContain("sender_logos");
    expect(top_ids("lögos", 5)).toContain("sender_logos");
  });

  it("matches multi-word queries in any order", () => {
    expect(top_ids("logos company", 3)).toContain("sender_logos");
    expect(top_ids("office out", 3)).toContain("vacation_reply_title");
  });

  it("matches prefixes", () => {
    expect(top_ids("compa", 5)).toContain("sender_logos");
    expect(top_ids("favi", 3)).toContain("sender_logos");
  });

  it("tolerates one typo in words of four or more letters", () => {
    expect(top_ids("comapny", 5)).toContain("sender_logos");
    expect(top_ids("compnay logos", 3)).toContain("sender_logos");
    expect(top_ids("favicn", 3)).toContain("sender_logos");
    expect(top_ids("vacaton", 5)).toContain("vacation_reply_title");
  });

  it("does not apply typo tolerance to short words", () => {
    const short = fields("Tab order");

    expect(score_search_fields("tav", short)).toBe(0);
    expect(score_search_fields("tab", short)).toBeGreaterThan(0);
  });

  it("returns nothing for unrelated text", () => {
    expect(top_ids("qwzxv")).toEqual([]);
  });

  it("requires every query word to match", () => {
    expect(top_ids("company qwzxv")).toEqual([]);
  });

  it("orders exact title, title prefix, keyword, then description", () => {
    const exact = score_search_fields("logos", fields("Logos"));
    const prefix = score_search_fields("logos", fields("Logos shown"));
    const keyword = score_search_fields("logos", fields("Icons", "logos"));
    const description = score_search_fields(
      "logos",
      fields("Icons", "", "Shows logos next to mail"),
    );

    expect(exact).toBeGreaterThan(prefix);
    expect(prefix).toBeGreaterThan(keyword);
    expect(keyword).toBeGreaterThan(description);
    expect(description).toBeGreaterThan(0);
  });

  it("ranks a title word above a keyword word", () => {
    const title = score_search_fields(
      "sender logos",
      fields("Logos of senders"),
    );
    const keyword = score_search_fields(
      "sender logos",
      fields("Icons", "logos of senders, senders"),
    );

    expect(title).toBeGreaterThan(keyword);
  });

  it("computes optimal string alignment distance", () => {
    expect(damerau_levenshtein("company", "comapny", 2)).toBe(1);
    expect(damerau_levenshtein("company", "compan", 2)).toBe(1);
    expect(damerau_levenshtein("company", "cmpny", 2)).toBe(2);
    expect(damerau_levenshtein("abc", "xyz", 1)).toBe(2);
  });

  it("accepts single characters only for non-Latin scripts", () => {
    expect(is_searchable_query("a")).toBe(false);
    expect(is_searchable_query("ab")).toBe(true);
    expect(is_searchable_query("語")).toBe(true);
  });

  it("matches text from more than one language", () => {
    const index = build_settings_index(
      SETTINGS_SEARCH_REGISTRY.filter((entry) => entry.id === "sender_logos"),
      [
        (key) => (key === "settings.sender_logos" ? "Firmenlogos" : undefined),
        lookup_in_table(en),
      ],
    );

    expect(rank_settings_index(index, "firmenlogos", 1)).toHaveLength(1);
    expect(rank_settings_index(index, "company", 1)).toHaveLength(1);
  });

  it("keeps mobile only rows out of the desktop index", () => {
    expect(top_ids("two factor", 20)).not.toContain("two_factor_auth");
    expect(top_ids("two factor", 20, full_index)).toContain("two_factor_auth");
  });
});
