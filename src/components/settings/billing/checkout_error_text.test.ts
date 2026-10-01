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

import {
  checkout_error_text,
  needs_payment_method_update,
} from "./checkout_error_text";

describe("needs_payment_method_update", () => {
  it("opens payment methods for a declined or uncollected payment", () => {
    expect(needs_payment_method_update("CARD_DECLINED")).toBe(true);
    expect(needs_payment_method_update("COLLECTION_FAILED")).toBe(true);
    expect(needs_payment_method_update("UNPAID_SUBSCRIPTION")).toBe(true);
  });

  it("keeps payment methods closed for other failures", () => {
    expect(needs_payment_method_update("SCA_REQUIRED")).toBe(false);
    expect(needs_payment_method_update("PROMO_CODE_INVALID")).toBe(false);
    expect(needs_payment_method_update("STRIPE_ERROR")).toBe(false);
    expect(needs_payment_method_update(undefined)).toBe(false);
    expect(needs_payment_method_update(null)).toBe(false);
  });
});

describe("checkout_error_text", () => {
  it("tells the user to approve the payment with their bank", () => {
    const t = (key: string) => key;

    expect(checkout_error_text(t, "SCA_REQUIRED")).toBe(
      "settings.checkout_sca_required",
    );
  });
});
