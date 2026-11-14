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
const get = vi.fn();

vi.mock("./client", () => ({
  api_client: {
    post: (...args: unknown[]) => post(...args),
    get: (...args: unknown[]) => get(...args),
  },
}));

const {
  get_codes_status,
  get_verifier_salts,
  initiate_recovery,
  list_inactive_key_sets,
  unlock_inactive_key_sets_with_code,
} = await import("./recovery");
const { is_code_hash_optional, reset_code_hash_optional } = await import(
  "../crypto/recovery_code_capability"
);

const CANDIDATES = [{ verifier_salt: "salt", code_verifier: "verifier" }];

beforeEach(() => {
  post.mockReset();
  get.mockReset();
  post.mockResolvedValue({ data: {} });
  get.mockResolvedValue({ data: {} });
  reset_code_hash_optional();
});

describe("recovery code requests", () => {
  it("sends only the code hash when there are no candidates", async () => {
    await initiate_recovery("hash", "a@example.com");
    await initiate_recovery("hash", "a@example.com", [], true);

    expect(post.mock.calls.map((call) => call[1])).toEqual([
      { code_hash: "hash", email: "a@example.com" },
      { code_hash: "hash", email: "a@example.com" },
    ]);
  });

  it("sends candidates beside the code hash until it is optional", async () => {
    await initiate_recovery("hash", "a@example.com", CANDIDATES);
    await initiate_recovery("hash", "a@example.com", CANDIDATES, true);

    expect(post.mock.calls.map((call) => call[1])).toEqual([
      { code_hash: "hash", candidates: CANDIDATES, email: "a@example.com" },
      { candidates: CANDIDATES, email: "a@example.com" },
    ]);
  });

  it("shapes the archived key unlock the same way", async () => {
    await unlock_inactive_key_sets_with_code("hash");
    await unlock_inactive_key_sets_with_code("hash", CANDIDATES);
    await unlock_inactive_key_sets_with_code("hash", CANDIDATES, true);

    expect(post.mock.calls.map((call) => call[1])).toEqual([
      { code_hash: "hash" },
      { code_hash: "hash", candidates: CANDIDATES },
      { candidates: CANDIDATES },
    ]);
  });

  it("asks for the salts of an address", async () => {
    post.mockResolvedValue({
      data: { verifier_salts: ["one", "two"], code_hash_optional: true },
    });

    const response = await get_verifier_salts("a@example.com");

    expect(post).toHaveBeenCalledWith("/core/v1/recovery/verifier-salts", {
      email: "a@example.com",
    });
    expect(response.data?.verifier_salts).toEqual(["one", "two"]);
    expect(is_code_hash_optional()).toBe(true);
  });

  it("follows what the server last reported about the code hash", async () => {
    get.mockResolvedValue({ data: { code_hash_optional: true } });
    await get_codes_status();

    expect(is_code_hash_optional()).toBe(true);

    get.mockResolvedValue({ error: "offline" });
    await list_inactive_key_sets();

    expect(is_code_hash_optional()).toBe(true);

    get.mockResolvedValue({
      data: { inactive_key_sets: [], code_hash_optional: false },
    });
    await list_inactive_key_sets();

    expect(is_code_hash_optional()).toBe(false);
  });

  it("can skip the cache for the codes status", async () => {
    await get_codes_status({ skip_cache: true });
    await get_codes_status();

    expect(get.mock.calls).toEqual([
      ["/core/v1/recovery/codes/status", { skip_cache: true }],
      ["/core/v1/recovery/codes/status", undefined],
    ]);
  });
});
