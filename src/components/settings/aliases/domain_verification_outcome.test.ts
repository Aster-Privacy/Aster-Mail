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
  domain_receives_mail,
  domain_verification_outcome,
} from "@/components/settings/aliases/domain_verification_outcome";

const result = (overrides: Partial<Record<string, boolean | string>>) => ({
  txt_verified: true,
  mx_verified: true,
  spf_verified: true,
  dkim_verified: true,
  status: "active",
  ...overrides,
});

describe("domain_verification_outcome", () => {
  it("is verified when every core record passes", () => {
    expect(domain_verification_outcome(result({}))).toBe("verified");
  });

  it("is receiving when ownership and MX pass but sending records are missing", () => {
    expect(
      domain_verification_outcome(
        result({ spf_verified: false, dkim_verified: false }),
      ),
    ).toBe("receiving");
  });

  it("is pending while MX or ownership is missing", () => {
    expect(
      domain_verification_outcome(
        result({ mx_verified: false, spf_verified: false }),
      ),
    ).toBe("pending");
    expect(domain_verification_outcome(result({ txt_verified: false }))).toBe(
      "pending",
    );
  });
});

describe("domain_receives_mail", () => {
  it("matches the statuses the server routes mail for", () => {
    expect(domain_receives_mail("active")).toBe(true);
    expect(domain_receives_mail("dns_pending")).toBe(true);
    expect(domain_receives_mail("verifying")).toBe(false);
    expect(domain_receives_mail("pending")).toBe(false);
    expect(domain_receives_mail("failed")).toBe(false);
  });
});
