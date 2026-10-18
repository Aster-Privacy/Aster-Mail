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
import { describe, it, expect } from "vitest";

import {
  apply_filter_state_to_query,
  build_query_from_filter_state,
  default_filter_state,
  filter_state_from_query,
} from "./search_filter_state";

describe("filter state from a query", () => {
  it("pre-fills the form from the typed operators", () => {
    const state = filter_state_from_query(
      'invoice -draft from:a@b.c to:"Jane Doe" subject:paid has:attachment is:starred after:30d larger:2097152 in:anywhere',
      "all",
    );

    expect(state.has_words).toBe("invoice");
    expect(state.does_not_have).toBe("draft");
    expect(state.from).toBe("a@b.c");
    expect(state.to).toBe("Jane Doe");
    expect(state.subject).toBe("paid");
    expect(state.has_attachments).toBe(true);
    expect(state.is_starred).toBe(true);
    expect(state.within_days).toBe("30");
    expect(state.size_op).toBe("greater");
    expect(state.size_value).toBe("2");
    expect(state.size_unit).toBe("mb");
    expect(state.scope).toBe("anywhere");
  });

  it("turns an absolute range back into the two date fields", () => {
    const state = filter_state_from_query("after:2026-09-01 before:2026-09-30");

    expect(state.date_from).toBe("2026-09-01");
    expect(state.date_to).toBe("2026-09-29");
    expect(state.within_days).toBe("");
  });

  it("defaults the scope to the current folder", () => {
    expect(filter_state_from_query("janedoe", "trash").scope).toBe("trash");
    expect(filter_state_from_query("janedoe", "inbox").scope).toBe("all");
    expect(filter_state_from_query("janedoe in:sent", "all").scope).toBe(
      "sent",
    );
  });
});

describe("queries from filter state", () => {
  it("builds a query from the form fields", () => {
    const state = default_filter_state("sent");

    state.from = "Jane Doe";
    state.has_words = "invoice";
    state.does_not_have = "draft -spam";
    state.has_attachments = true;
    state.within_days = "7";
    state.size_value = "3";
    state.size_unit = "kb";
    state.size_op = "less";

    expect(build_query_from_filter_state(state)).toBe(
      'from:"Jane Doe" invoice -draft -spam has:attachment smaller:3072 after:7d in:sent',
    );
  });

  it("leaves the scope token out for all mail", () => {
    const state = default_filter_state();

    state.has_words = "invoice";

    expect(build_query_from_filter_state(state)).toBe("invoice");
    expect(build_query_from_filter_state(default_filter_state())).toBe(
      "in:all",
    );
  });

  it("keeps the trash scope explicit when searching from trash", () => {
    const state = default_filter_state("trash");

    state.has_words = "invoice";

    expect(build_query_from_filter_state(state, "trash")).toBe(
      "invoice in:trash",
    );
  });

  it("replaces the form operators but keeps the others", () => {
    const query = "invoice label:work has:pdf from:a@b.c after:7d";
    const state = filter_state_from_query(query);

    state.from = "c@d.e";
    state.within_days = "";
    state.date_from = "2026-01-01";

    expect(apply_filter_state_to_query(query, state)).toBe(
      "label:work has:pdf from:c@d.e invoice after:2026-01-01",
    );
  });
});
