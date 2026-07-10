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

import { derive_page_from_list_length } from "./use_email_list";

describe("derive_page_from_list_length", () => {
  it("returns page 0 for an empty list", () => {
    expect(derive_page_from_list_length(0, 30)).toBe(0);
  });

  it("returns page 0 for a single fetched page", () => {
    expect(derive_page_from_list_length(1, 30)).toBe(0);
    expect(derive_page_from_list_length(30, 30)).toBe(0);
  });

  it("returns the last fetched page for multi-page lists", () => {
    expect(derive_page_from_list_length(31, 30)).toBe(1);
    expect(derive_page_from_list_length(60, 30)).toBe(1);
    expect(derive_page_from_list_length(61, 30)).toBe(2);
  });

  it("handles the low network page size", () => {
    expect(derive_page_from_list_length(15, 15)).toBe(0);
    expect(derive_page_from_list_length(16, 15)).toBe(1);
  });

  it("guards against a non-positive page size", () => {
    expect(derive_page_from_list_length(10, 0)).toBe(0);
  });
});
