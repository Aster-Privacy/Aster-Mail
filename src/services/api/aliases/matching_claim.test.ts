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
import { beforeEach, describe, expect, it, vi } from "vitest";

const post = vi.fn();
const get_twin_address = vi.fn();
const get_alias_limit = vi.fn();

vi.mock("../client", () => ({
  api_client: { post: (...args: unknown[]) => post(...args) },
}));

vi.mock("./crud", () => ({
  get_twin_address: () => get_twin_address(),
  get_alias_limit: () => get_alias_limit(),
}));

vi.mock("./crypto", () => ({
  compute_alias_hash: vi.fn(async () => "hmac"),
  encrypt_alias_field: vi.fn(async () => ({ encrypted: "enc", nonce: "n" })),
}));

import {
  auto_claim_matching_addresses,
  matching_claim_slots,
  pick_matching_addresses,
  reset_matching_claims,
} from "./matching_claim";

const twin = {
  address: "alice@aster.cx",
  domain: "aster.cx",
  local_part: "alice",
  state: "reserved" as const,
  siblings: [
    {
      address: "alice@aster.cx",
      domain: "aster.cx",
      local_part: "alice",
      state: "reserved" as const,
    },
    {
      address: "alice@astermail.me",
      domain: "astermail.me",
      local_part: "alice",
      state: "reserved" as const,
    },
    {
      address: "alice@astermail.net",
      domain: "astermail.net",
      local_part: "alice",
      state: "taken" as const,
    },
  ],
};

describe("matching address claim", () => {
  beforeEach(() => {
    reset_matching_claims();
    post.mockReset();
    get_twin_address.mockReset();
    get_alias_limit.mockReset();
  });

  it("caps the claim at two and at the remaining alias slots", () => {
    expect(
      matching_claim_slots({
        current_count: 0,
        max_aliases: 5,
        can_create: true,
      }),
    ).toBe(2);
    expect(
      matching_claim_slots({
        current_count: 4,
        max_aliases: 5,
        can_create: true,
      }),
    ).toBe(1);
    expect(
      matching_claim_slots({
        current_count: 5,
        max_aliases: 5,
        can_create: false,
      }),
    ).toBe(0);
    expect(
      matching_claim_slots({
        current_count: 9,
        max_aliases: -1,
        can_create: true,
      }),
    ).toBe(2);
  });

  it("picks only reserved addresses on included domains", () => {
    expect(pick_matching_addresses(twin, 2).map((s) => s.address)).toEqual([
      "alice@aster.cx",
    ]);
    expect(pick_matching_addresses(twin, 0)).toEqual([]);
  });

  it("claims each pick once per account and reports the results", async () => {
    get_twin_address.mockResolvedValue({ data: twin });
    get_alias_limit.mockResolvedValue({
      data: { current_count: 0, max_aliases: 5, can_create: true },
    });
    post.mockResolvedValue({ data: { id: "a1", created: true } });

    const first = await auto_claim_matching_addresses("alice@astermail.org");
    const second = await auto_claim_matching_addresses("alice@astermail.org");

    expect(first).toEqual([
      { address: "alice@aster.cx", alias_id: "a1", created: true },
    ]);
    expect(second).toBe(first);
    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith("/addresses/v1/aliases/twin/claim", {
      encrypted_local_part: "enc",
      local_part_nonce: "n",
      alias_address_hash: "hmac",
      domain: "aster.cx",
    });
  });

  it("skips a rejected claim without throwing", async () => {
    get_twin_address.mockResolvedValue({ data: twin });
    get_alias_limit.mockResolvedValue({
      data: { current_count: 0, max_aliases: 5, can_create: true },
    });
    post.mockResolvedValue({ error: "conflict", status: 409 });

    await expect(
      auto_claim_matching_addresses("alice@astermail.org"),
    ).resolves.toEqual([]);
  });

  it("retries later when the address lookup fails", async () => {
    get_twin_address.mockRejectedValueOnce(new Error("offline"));
    get_alias_limit.mockResolvedValue({
      data: { current_count: 0, max_aliases: 5, can_create: true },
    });

    await expect(
      auto_claim_matching_addresses("alice@astermail.org"),
    ).resolves.toEqual([]);

    get_twin_address.mockResolvedValue({ data: twin });
    post.mockResolvedValue({ data: { id: "a2", created: true } });

    await expect(
      auto_claim_matching_addresses("alice@astermail.org"),
    ).resolves.toHaveLength(1);
  });
});
