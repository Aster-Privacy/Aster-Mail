//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
import { describe, it, expect } from "vitest";

import { detect_forwarded_alias } from "./forwarding_alias";
import { verified_domain_for_shown_sender } from "./verified_sender_domain";

describe("verified_domain_for_shown_sender", () => {
  it("keeps the badge when the shown address is on the verified domain", () => {
    expect(
      verified_domain_for_shown_sender("example.com", "News@Example.COM"),
    ).toBe("example.com");
    expect(
      verified_domain_for_shown_sender(
        "example.com",
        "alerts@mail.example.com",
      ),
    ).toBe("example.com");
  });

  it("drops the badge when a forwarding header names another domain", () => {
    const forwarded = detect_forwarded_alias(
      [
        { name: "X-SimpleLogin-Type", value: "Forward" },
        {
          name: "X-SimpleLogin-Original-From",
          value: "Bank Support <support@bank.example>",
        },
      ],
      { name: "Reverse alias", email: "reply+abc@simplelogin.co" },
    );

    expect(forwarded?.original.email).toBe("support@bank.example");
    expect(
      verified_domain_for_shown_sender(
        "simplelogin.co",
        forwarded?.original.email,
      ),
    ).toBeUndefined();
  });

  it("does not treat a look-alike suffix as the verified domain", () => {
    expect(
      verified_domain_for_shown_sender("example.com", "x@badexample.com"),
    ).toBeUndefined();
  });

  it("returns nothing without a verified domain or a usable address", () => {
    expect(
      verified_domain_for_shown_sender(undefined, "a@example.com"),
    ).toBeUndefined();
    expect(
      verified_domain_for_shown_sender("example.com", "no-at-sign"),
    ).toBeUndefined();
    expect(verified_domain_for_shown_sender("example.com", "")).toBeUndefined();
  });
});
