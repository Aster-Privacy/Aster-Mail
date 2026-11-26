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

import { get_spam_total } from "./spam_total";

const page_of_spam = (count: number) =>
  Array.from({ length: count }, () => ({ is_spam: true }));

describe("get_spam_total", () => {
  it("uses the folder total when only one page is loaded", () => {
    expect(get_spam_total(121, page_of_spam(50))).toBe(121);
  });

  it("uses the loaded count when the folder total is behind", () => {
    expect(get_spam_total(0, page_of_spam(3))).toBe(3);
  });

  it("ignores loaded mail that is not spam", () => {
    expect(get_spam_total(2, [{ is_spam: false }, { is_spam: true }])).toBe(2);
  });

  it("treats a missing folder total as zero", () => {
    expect(get_spam_total(Number.NaN, page_of_spam(4))).toBe(4);
  });
});
