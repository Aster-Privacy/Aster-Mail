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
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { arrived_with_promo_code } from "./billing";

function set_search(search: string) {
  window.history.replaceState({}, "", `/settings${search}`);
}

describe("promo code arrival", () => {
  beforeEach(() => {
    sessionStorage.clear();
    set_search("");
  });

  afterEach(() => {
    set_search("");
  });

  it("is false without a code in the url", () => {
    expect(arrived_with_promo_code()).toBe(false);
  });

  it("is true when the url carries a promo code", () => {
    set_search("?promo=launch20");

    expect(arrived_with_promo_code()).toBe(true);
  });

  it("is true when the url carries a coupon code", () => {
    set_search("?coupon=launch20");

    expect(arrived_with_promo_code()).toBe(true);
  });

  it("ignores an empty code", () => {
    set_search("?promo=");

    expect(arrived_with_promo_code()).toBe(false);
  });

  it("remembers the arrival after the url is cleaned up", () => {
    set_search("?promo=launch20");
    arrived_with_promo_code();
    set_search("");

    expect(arrived_with_promo_code()).toBe(true);
  });
});
