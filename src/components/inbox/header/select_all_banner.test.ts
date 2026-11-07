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

import { resolve_select_all_banner } from "./select_all_banner";

const base = {
  all_selected: true,
  select_all_mode: false,
  total_messages: 0,
  page_selected_count: 50,
  has_next_page: false,
  can_activate: true,
  can_clear: true,
};

describe("resolve_select_all_banner", () => {
  it("offers the folder count when the total is larger than the page", () => {
    expect(resolve_select_all_banner({ ...base, total_messages: 12_000 })).toBe(
      "offer",
    );
  });

  it("offers select all when the count is unknown but a next page exists", () => {
    expect(
      resolve_select_all_banner({
        ...base,
        total_messages: 50,
        has_next_page: true,
      }),
    ).toBe("offer_unknown");
  });

  it("stays hidden when the whole folder fits on one page", () => {
    expect(resolve_select_all_banner({ ...base, total_messages: 50 })).toBe(
      "none",
    );
  });

  it("stays hidden until every row on the page is selected", () => {
    expect(
      resolve_select_all_banner({
        ...base,
        all_selected: false,
        total_messages: 12_000,
      }),
    ).toBe("none");
  });

  it("stays hidden when the view has no folder scope", () => {
    expect(
      resolve_select_all_banner({
        ...base,
        total_messages: 12_000,
        can_activate: false,
      }),
    ).toBe("none");
  });

  it("reports a counted folder selection", () => {
    expect(
      resolve_select_all_banner({
        ...base,
        select_all_mode: true,
        total_messages: 12_000,
      }),
    ).toBe("selected");
  });

  it("reports an uncounted folder selection when more pages exist", () => {
    expect(
      resolve_select_all_banner({
        ...base,
        select_all_mode: true,
        total_messages: 50,
        has_next_page: true,
      }),
    ).toBe("selected_unknown");
  });

  it("hides the selected banner without a way to clear it", () => {
    expect(
      resolve_select_all_banner({
        ...base,
        select_all_mode: true,
        total_messages: 12_000,
        can_clear: false,
      }),
    ).toBe("none");
  });
});
