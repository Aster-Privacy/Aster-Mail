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
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { checked_payment_url } from "@/lib/payment_url";

const checkout_sites = [
  "components/settings/domains_section.tsx",
  "components/settings/aliases/domain_purchase_flow/flow.tsx",
];

function read_site(path: string): string {
  return readFileSync(join(process.cwd(), "src", path), "utf8");
}

describe("checked_payment_url", () => {
  it("returns the normalized checkout url", () => {
    expect(
      checked_payment_url("https://CHECKOUT.STRIPE.COM/c/pay/cs_live_a1b2c3"),
    ).toBe("https://checkout.stripe.com/c/pay/cs_live_a1b2c3");
  });

  it("returns null for an unexpected url", () => {
    expect(checked_payment_url(undefined)).toBeNull();
    expect(checked_payment_url("https://evil.example/c/pay")).toBeNull();
    expect(
      checked_payment_url("https://checkout.stripe.com:8443/c/pay"),
    ).toBeNull();
    expect(checked_payment_url("https://invoice.stripe.com/i/abc")).toBeNull();
  });
});

describe("domain checkout sites", () => {
  it.each(checkout_sites)("%s opens only the checked url", (path) => {
    const source = read_site(path);

    expect(source).not.toMatch(
      /window\.location\.href\s*=\s*response\.data\??\.checkout_url/,
    );
    expect(source).not.toMatch(
      /open_payment_url\(\s*response\.data\??\.checkout_url/,
    );
    expect(source).not.toMatch(
      /set_checkout_url\(\s*response\.data\??\.checkout_url/,
    );
    expect(source).toMatch(
      /checked_payment_url\(\s*response\.data\?\.checkout_url/,
    );
  });
});
