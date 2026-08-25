import { describe, it, expect } from "vitest";

import { meets_min_search_length, min_search_length } from "./search_query";

describe("min_search_length", () => {
  it("requires two characters for latin queries", () => {
    expect(min_search_length("a")).toBe(2);
    expect(min_search_length("hello")).toBe(2);
  });

  it("allows a single character for scripts where one glyph is a word", () => {
    expect(min_search_length("税")).toBe(1);
    expect(min_search_length("あ")).toBe(1);
    expect(min_search_length("한")).toBe(1);
  });
});

describe("meets_min_search_length", () => {
  it("rejects a single latin character", () => {
    expect(meets_min_search_length("a")).toBe(false);
  });

  it("accepts a single ideograph", () => {
    expect(meets_min_search_length("税")).toBe(true);
  });

  it("accepts two latin characters", () => {
    expect(meets_min_search_length("hi")).toBe(true);
  });
});
