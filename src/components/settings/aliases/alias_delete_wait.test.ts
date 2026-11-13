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

import { custom_domain_skips_delete_wait } from "./alias_delete_wait";

const domains = [
  { domain_name: "Example.com", status: "active" },
  { domain_name: "pending.dev", status: "dns_pending" },
  { domain_name: "unverified.net", status: "pending" },
  { domain_name: "broken.org", status: "suspended" },
];

describe("custom_domain_skips_delete_wait", () => {
  it("skips the wait on a paid plan for a verified custom domain", () => {
    expect(
      custom_domain_skips_delete_wait("example.com", domains, "star"),
    ).toBe(true);
    expect(
      custom_domain_skips_delete_wait("pending.dev", domains, "nova"),
    ).toBe(true);
  });

  it("keeps the wait on the free plan", () => {
    expect(
      custom_domain_skips_delete_wait("example.com", domains, "free"),
    ).toBe(false);
    expect(
      custom_domain_skips_delete_wait("example.com", domains, undefined),
    ).toBe(false);
  });

  it("keeps the wait for unverified, suspended, and unknown domains", () => {
    expect(
      custom_domain_skips_delete_wait("unverified.net", domains, "star"),
    ).toBe(false);
    expect(custom_domain_skips_delete_wait("broken.org", domains, "star")).toBe(
      false,
    );
    expect(
      custom_domain_skips_delete_wait("astermail.org", domains, "star"),
    ).toBe(false);
    expect(custom_domain_skips_delete_wait(undefined, domains, "star")).toBe(
      false,
    );
  });
});
