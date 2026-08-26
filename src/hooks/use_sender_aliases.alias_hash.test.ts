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
import type { DecryptedEmailAlias } from "@/services/api/aliases";

import { describe, expect, it, vi } from "vitest";

import { build_alias_hash_map } from "./use_sender_aliases";

function make_alias(
  id: string,
  alias_address_hash: string,
): DecryptedEmailAlias {
  return {
    id,
    local_part: "security",
    domain: "astermail.org",
    full_address: "security@astermail.org",
    alias_address_hash,
    is_enabled: true,
  } as unknown as DecryptedEmailAlias;
}

describe("build_alias_hash_map", () => {
  it("uses the hash the server stored instead of recomputing it", async () => {
    const compute = vi.fn().mockResolvedValue("drifted_hash");
    const hashes = await build_alias_hash_map(
      [make_alias("a1", "server_hash")],
      compute,
    );

    expect(hashes.get("a1")).toBe("server_hash");
    expect(compute).not.toHaveBeenCalled();
  });

  it("falls back to a local hash when the server supplies none", async () => {
    const compute = vi.fn().mockResolvedValue("local_hash");
    const hashes = await build_alias_hash_map([make_alias("a2", "")], compute);

    expect(hashes.get("a2")).toBe("local_hash");
    expect(compute).toHaveBeenCalledWith("security", "astermail.org");
  });
});
