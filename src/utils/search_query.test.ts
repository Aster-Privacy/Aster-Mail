import { describe, it, expect } from "vitest";

import {
  clear_search_filters,
  meets_min_search_length,
  min_search_length,
  query_search_scope,
  set_search_scope,
} from "./search_query";

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

describe("set_search_scope", () => {
  it("replaces every in: operator with the chosen scope", () => {
    expect(
      set_search_scope("janedoe in:trash in:spam", "trash", "anywhere"),
    ).toBe("janedoe in:anywhere");
  });

  it("leaves all mail implicit outside Trash and Spam", () => {
    expect(set_search_scope("janedoe in:inbox", "inbox", "all")).toBe(
      "janedoe",
    );
    expect(set_search_scope("janedoe in:anywhere", "trash", "all")).toBe(
      "janedoe in:all",
    );
    expect(set_search_scope("in:sent", "all", "all")).toBe("in:all");
  });

  it("reads the scope back from the query", () => {
    expect(query_search_scope("janedoe", "trash")).toEqual({
      scope: "trash",
      is_default: true,
    });
    expect(query_search_scope("janedoe in:anywhere", "trash")).toEqual({
      scope: "anywhere",
      is_default: false,
    });
    expect(query_search_scope("janedoe in:sent", "all")).toEqual({
      scope: "sent",
      is_default: false,
    });
    expect(query_search_scope("janedoe in:sent in:trash", "all")).toBeNull();
  });
});

describe("clear_search_filters", () => {
  it("drops every filter and returns to the default scope", () => {
    expect(
      clear_search_filters(
        "janedoe from:a@b.c has:attachment after:7d in:anywhere",
        "trash",
      ),
    ).toBe("janedoe in:trash");
    expect(clear_search_filters("janedoe is:unread in:sent", "all")).toBe(
      "janedoe",
    );
    expect(clear_search_filters("is:unread", "all")).toBe("in:all");
  });
});
