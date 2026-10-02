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
import type { CustomDomain } from "@/services/api/domains";

import { describe, expect, it, vi } from "vitest";

import { catch_all_sender_options } from "./catch_all_sender";

import { add_domain_address } from "@/services/api/domains";

vi.mock("@/services/api/domains", () => ({
  list_domains: vi.fn(),
  list_domain_addresses: vi.fn(),
  decrypt_domain_addresses: vi.fn(),
  add_domain_address: vi.fn(),
  compute_address_hash: vi.fn(async () => "computed_hash"),
}));
const domain = {
  id: "d1",
  domain_name: "my.example",
  status: "active",
  catch_all_enabled: true,
} as CustomDomain;

describe("catch-all sender candidates", () => {
  it("adds only concrete addresses on an active owned catch-all domain", () => {
    expect(
      catch_all_sender_options(
        [domain],
        [
          " Shopping@My.Example ",
          "other@unowned.example",
          "x@sub.my.example",
          "bad\r\n@my.example",
          "*@my.example",
          "Shopping@My.Example",
        ],
        [],
        [],
      ).map((s) => s.email),
    ).toEqual(["shopping@my.example"]);
    const [option] = catch_all_sender_options(
      [domain],
      ["shopping@my.example"],
      [],
      [],
    );

    expect(option.is_catch_all).toBe(true);
    expect(option.address_hash).toBeUndefined();
    expect(add_domain_address).not.toHaveBeenCalled();
  });
  it.each([
    { status: "pending" },
    { catch_all_enabled: false },
    { is_shared: true },
  ])("does not offer unavailable domains: %j", (change) => {
    expect(
      catch_all_sender_options(
        [{ ...domain, ...change }],
        ["shopping@my.example"],
        [],
        [],
      ),
    ).toEqual([]);
  });
  it("does not duplicate registered addresses or revive disabled addresses", () => {
    const existing = [
      {
        id: "a1",
        email: "shopping@my.example",
        type: "domain" as const,
        is_enabled: true,
      },
    ];

    expect(
      catch_all_sender_options(
        [domain],
        ["shop.ping@my.example", "disabled@my.example"],
        existing,
        ["disabled@my.example"],
      ),
    ).toEqual([]);
  });
});
