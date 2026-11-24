import { describe, it, expect } from "vitest";

import {
  build_label_name_to_tokens,
  clear_search_filters,
  meets_min_search_length,
  min_search_length,
  query_search_scope,
  scope_search_query_to_list,
  search_list_scope_for_path,
  search_list_scope_for_view,
  search_list_scope_name,
  set_search_scope,
} from "./search_query";

import { parse_search_query } from "@/utils/search_operators";

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

describe("search_list_scope_for_path", () => {
  it("reads the folder or label from the route", () => {
    expect(search_list_scope_for_path("/folder/abc")).toEqual({
      operator: "folder",
      token: "abc",
    });
    expect(search_list_scope_for_path("/tag/a%2Fb")).toEqual({
      operator: "label",
      token: "a/b",
    });
  });

  it("ignores every other route", () => {
    expect(search_list_scope_for_path("/")).toBeUndefined();
    expect(search_list_scope_for_path("/trash")).toBeUndefined();
    expect(search_list_scope_for_path("/alias/abc")).toBeUndefined();
    expect(search_list_scope_for_path("/folder/")).toBeUndefined();
  });
});

describe("search_list_scope_for_view", () => {
  it("reads the folder or label from a mobile view", () => {
    expect(search_list_scope_for_view("folder-abc")).toEqual({
      operator: "folder",
      token: "abc",
    });
    expect(search_list_scope_for_view("tag-abc")).toEqual({
      operator: "label",
      token: "abc",
    });
  });

  it("ignores mailbox views", () => {
    expect(search_list_scope_for_view(undefined)).toBeUndefined();
    expect(search_list_scope_for_view("trash")).toBeUndefined();
    expect(search_list_scope_for_view("folder-")).toBeUndefined();
  });
});

describe("search_list_scope_name", () => {
  const folders = [
    { folder_token: "f1", name: " Tax Bills " },
    { folder_token: "f2", name: 'Say "hi"' },
  ];
  const tags = [{ tag_token: "t1", name: "Receipts" }];

  it("resolves the name by token", () => {
    expect(
      search_list_scope_name({ operator: "folder", token: "f1" }, folders, tags),
    ).toBe("Tax Bills");
    expect(
      search_list_scope_name({ operator: "label", token: "t1" }, folders, tags),
    ).toBe("Receipts");
  });

  it("gives no name for an unknown token or a name with a quote", () => {
    expect(
      search_list_scope_name({ operator: "folder", token: "t1" }, folders, tags),
    ).toBeUndefined();
    expect(
      search_list_scope_name({ operator: "folder", token: "f2" }, folders, tags),
    ).toBeUndefined();
    expect(search_list_scope_name(undefined, folders, tags)).toBeUndefined();
  });
});

describe("scope_search_query_to_list", () => {
  const scope = { operator: "folder" as const, token: "f1" };

  it("adds the folder filter to a plain query", () => {
    expect(scope_search_query_to_list(" janedoe ", scope, "Tax Bills")).toBe(
      'janedoe folder:"Tax Bills"',
    );
    expect(
      scope_search_query_to_list(
        "janedoe",
        { operator: "label", token: "t1" },
        "Receipts",
      ),
    ).toBe('janedoe label:"Receipts"');
  });

  it("writes a filter the parser reads back as the same folder", () => {
    const scoped = scope_search_query_to_list("janedoe", scope, "Tax Bills");
    const operators = parse_search_query(scoped).operators;

    expect(operators).toHaveLength(1);
    expect(operators[0].type).toBe("folder");
    expect(operators[0].value).toBe("Tax Bills");
  });

  it("leaves a query that already names a place", () => {
    for (const query of [
      "janedoe in:all",
      "janedoe folder:work",
      "janedoe label:work",
      "janedoe -in:trash",
    ]) {
      expect(scope_search_query_to_list(query, scope, "Tax Bills")).toBe(query);
    }
  });

  it("leaves the query alone without a folder or a name", () => {
    expect(scope_search_query_to_list("janedoe", undefined, "Tax Bills")).toBe(
      "janedoe",
    );
    expect(scope_search_query_to_list("janedoe", scope, undefined)).toBe(
      "janedoe",
    );
    expect(scope_search_query_to_list("  ", scope, "Tax Bills")).toBe("");
  });
});

describe("build_label_name_to_tokens", () => {
  it("maps lowercased names to tokens and skips system folders", () => {
    const map = build_label_name_to_tokens(
      [
        { folder_token: "f1", name: "Bills" },
        { folder_token: "f2", name: "bills" },
        { folder_token: "f3", name: "Inbox", is_system: true },
      ],
      [{ tag_token: "t1", name: "Travel" }],
    );

    expect(map.get("bills")).toEqual(["f1", "f2"]);
    expect(map.get("travel")).toEqual(["t1"]);
    expect(map.has("inbox")).toBe(false);
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
