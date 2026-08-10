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
import { beforeEach, describe, expect, it } from "vitest";

import {
  add_vocabulary_text,
  deletion_index_size,
  reset_vocabulary,
} from "./vocabulary";
import {
  clear_never_correct_terms,
  damerau_levenshtein,
  is_correctable_term,
  load_never_correct_terms,
  MAX_EDIT_DISTANCE_LONG,
  MAX_EDIT_DISTANCE_SHORT,
  max_edit_distance_for,
  MIN_CANDIDATE_COUNT,
  remember_never_correct_term,
  suggest_query_correction,
  suggest_term_correction,
} from "./spelling";

describe("damerau_levenshtein", () => {
  it("returns zero for identical strings", () => {
    expect(damerau_levenshtein("receive", "receive", 2)).toBe(0);
  });

  it("counts a substitution as one edit", () => {
    expect(damerau_levenshtein("receive", "recoive", 2)).toBe(1);
  });

  it("counts a transposition as one edit", () => {
    expect(damerau_levenshtein("recieve", "receive", 2)).toBe(1);
  });

  it("counts an insertion as one edit", () => {
    expect(damerau_levenshtein("recive", "receive", 2)).toBe(1);
  });

  it("stops early once the limit is exceeded", () => {
    expect(damerau_levenshtein("invoice", "shipment", 2)).toBeGreaterThan(2);
  });

  it("rejects a length gap wider than the limit without scanning", () => {
    expect(damerau_levenshtein("cat", "catalogue", 1)).toBe(2);
  });
});

describe("max_edit_distance_for", () => {
  it("allows one edit on short terms", () => {
    expect(max_edit_distance_for("cart")).toBe(MAX_EDIT_DISTANCE_SHORT);
    expect(max_edit_distance_for("basket")).toBe(MAX_EDIT_DISTANCE_SHORT);
  });

  it("allows two edits on long terms", () => {
    expect(max_edit_distance_for("receive")).toBe(MAX_EDIT_DISTANCE_LONG);
  });
});

describe("correction gates", () => {
  beforeEach(() => {
    localStorage.clear();
    reset_vocabulary();
    add_vocabulary_text("receive", MIN_CANDIDATE_COUNT);
    add_vocabulary_text("cart", MIN_CANDIDATE_COUNT);
  });

  it("skips terms shorter than the minimum", () => {
    expect(is_correctable_term("crt", new Set())).toBe(false);
  });

  it("skips non-latin terms", () => {
    expect(is_correctable_term("領収書です", new Set())).toBe(false);
  });

  it("skips terms the mailbox already contains", () => {
    expect(is_correctable_term("receive", new Set())).toBe(false);
  });

  it("skips terms the user asked us to leave alone", () => {
    expect(is_correctable_term("recieve", new Set(["recieve"]))).toBe(false);
    expect(is_correctable_term("recieve", new Set())).toBe(true);
  });
});

describe("suggest_term_correction", () => {
  beforeEach(() => {
    localStorage.clear();
    reset_vocabulary();
  });

  it("ignores candidates that are too rare to trust", () => {
    add_vocabulary_text("receive", MIN_CANDIDATE_COUNT - 1);

    expect(suggest_term_correction("recieve")).toBeNull();
  });

  it("suggests a frequent candidate", () => {
    add_vocabulary_text("receive", MIN_CANDIDATE_COUNT);

    expect(suggest_term_correction("recieve")).toBe("receive");
  });

  it("prefers the closer candidate over the more frequent one", () => {
    add_vocabulary_text("cart", MIN_CANDIDATE_COUNT * 20);
    add_vocabulary_text("card", MIN_CANDIDATE_COUNT);

    expect(suggest_term_correction("carrd")).toBe("card");
  });

  it("breaks a distance tie by frequency", () => {
    add_vocabulary_text("card", MIN_CANDIDATE_COUNT * 5);
    add_vocabulary_text("cart", MIN_CANDIDATE_COUNT);

    expect(suggest_term_correction("carf")).toBe("card");
  });
});

describe("suggest_query_correction", () => {
  beforeEach(() => {
    localStorage.clear();
    reset_vocabulary();
    add_vocabulary_text("receive", MIN_CANDIDATE_COUNT);
  });

  it("rewrites the misspelled term only", () => {
    const correction = suggest_query_correction("recieve invoice", [
      "recieve",
      "invoice",
    ]);

    expect(correction).toEqual({
      original_query: "recieve invoice",
      corrected_query: "receive invoice",
      original_term: "recieve",
      corrected_term: "receive",
    });
  });

  it("preserves the spacing of the original query", () => {
    const correction = suggest_query_correction("  recieve   later ", [
      "recieve",
    ]);

    expect(correction?.corrected_query).toBe("  receive   later ");
  });

  it("leaves operator values untouched", () => {
    const correction = suggest_query_correction("from:recieve", ["recieve"]);

    expect(correction).toBeNull();
  });

  it("leaves quoted phrases untouched", () => {
    const correction = suggest_query_correction('"recieve"', ["recieve"]);

    expect(correction).toBeNull();
  });

  it("corrects a bare term next to an operator", () => {
    const correction = suggest_query_correction("from:me recieve", ["recieve"]);

    expect(correction?.corrected_query).toBe("from:me receive");
  });

  it("returns nothing when no candidate is close enough", () => {
    expect(suggest_query_correction("zzzzqqq", ["zzzzqqq"])).toBeNull();
  });

  it("respects a remembered never-correct term", () => {
    remember_never_correct_term("Recieve");

    expect(load_never_correct_terms().has("recieve")).toBe(true);
    expect(suggest_query_correction("recieve", ["recieve"])).toBeNull();
  });

  it("releases the deletion index after a successful correction", () => {
    expect(
      suggest_query_correction("recieve", ["recieve"])?.corrected_term,
    ).toBe("receive");
    expect(deletion_index_size()).toBe(0);
  });

  it("releases the deletion index when nothing is corrected", () => {
    expect(suggest_query_correction("zzzzqqq", ["zzzzqqq"])).toBeNull();
    expect(deletion_index_size()).toBe(0);
  });

  it("forgets every remembered term when local data is cleared", () => {
    remember_never_correct_term("recieve");
    expect(load_never_correct_terms().size).toBe(1);

    clear_never_correct_terms();

    expect(load_never_correct_terms().size).toBe(0);
    expect(
      suggest_query_correction("recieve", ["recieve"])?.corrected_term,
    ).toBe("receive");
  });
});
