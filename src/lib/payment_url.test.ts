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

import { is_https_payment_url, payment_url_or_throw } from "@/lib/payment_url";

const accepted = [
  "https://checkout.stripe.com/c/pay/cs_live_a1b2c3#fidkdWxOYHwnPyd1blpxYHZxWjA0",
  "https://billing.stripe.com/p/session/live_YWNjdF8xTk",
];

const refused = [
  "https://evil.example/c/pay/cs_live_a1b2c3",
  "https://checkout.stripe.com.evil.example/c/pay/cs_live_a1b2c3",
  "https://stripe.com/c/pay/cs_live_a1b2c3",
  "https://pay.stripe.com/receipts/abc",
  "https://invoice.stripe.com/i/acct_1/test_abc",
  "https://checkout.stripe.com:8443/c/pay/cs_live_a1b2c3",
  "https://user:pass@checkout.stripe.com/c/pay/cs_live_a1b2c3",
  "http://checkout.stripe.com/c/pay/cs_live_a1b2c3",
  "javascript:alert(1)",
  "not a url",
  "",
];

describe("payment_url_or_throw", () => {
  it.each(accepted)("returns the checkout or portal url %s", (url) => {
    expect(payment_url_or_throw(url)).toBe(new URL(url).toString());
    expect(is_https_payment_url(url)).toBe(true);
  });

  it.each(refused)("refuses %s", (url) => {
    expect(() => payment_url_or_throw(url)).toThrow();
    expect(is_https_payment_url(url)).toBe(false);
  });

  it("matches hosts exactly regardless of case", () => {
    expect(
      payment_url_or_throw("https://CHECKOUT.STRIPE.COM/c/pay/cs_live_a1b2c3"),
    ).toBe("https://checkout.stripe.com/c/pay/cs_live_a1b2c3");
  });
});
