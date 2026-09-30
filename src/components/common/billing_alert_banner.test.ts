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

import { hosted_pay_url } from "./billing_alert_banner";

describe("hosted_pay_url", () => {
  it("accepts a stripe hosted invoice link", () => {
    expect(hosted_pay_url("https://invoice.stripe.com/i/acct_1/test_abc")).toBe(
      "https://invoice.stripe.com/i/acct_1/test_abc",
    );
  });

  it("rejects a missing link", () => {
    expect(hosted_pay_url(null)).toBeNull();
    expect(hosted_pay_url(undefined)).toBeNull();
    expect(hosted_pay_url("")).toBeNull();
  });

  it("rejects a link that is not stripe", () => {
    expect(hosted_pay_url("https://example.com/pay")).toBeNull();
  });

  it("rejects an insecure or malformed link", () => {
    expect(hosted_pay_url("http://invoice.stripe.com/i/acct_1")).toBeNull();
    expect(hosted_pay_url("javascript:alert(1)")).toBeNull();
    expect(hosted_pay_url("not a url")).toBeNull();
  });
});
