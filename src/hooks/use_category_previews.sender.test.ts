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

import { titlecase_localpart } from "@/hooks/use_category_previews";

describe("titlecase_localpart", () => {
  it("capitalizes a bare localpart", () => {
    expect(titlecase_localpart("newsletter")).toBe("Newsletter");
    expect(titlecase_localpart("orders")).toBe("Orders");
  });

  it("splits the common separators into words", () => {
    expect(titlecase_localpart("no-reply")).toBe("No Reply");
    expect(titlecase_localpart("billing.support")).toBe("Billing Support");
    expect(titlecase_localpart("news_letter")).toBe("News Letter");
    expect(titlecase_localpart("shop+deals")).toBe("Shop Deals");
  });

  it("leaves brand casing alone", () => {
    expect(titlecase_localpart("eBay")).toBe("eBay");
    expect(titlecase_localpart("GitHub")).toBe("GitHub");
  });

  it("survives input with nothing to capitalize", () => {
    expect(titlecase_localpart("")).toBe("");
    expect(titlecase_localpart("---")).toBe("---");
    expect(titlecase_localpart("123")).toBe("123");
  });
});
