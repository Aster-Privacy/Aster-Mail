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
import { describe, expect, it, vi } from "vitest";

vi.mock("@/services/crypto/key_manager", () => ({
  generate_identity_keypair: vi.fn(),
  prepare_pgp_key_data: vi.fn(),
}));

import { array_to_base64 } from "./base64";
import { derive_missing_identity_keks } from "./install_missing_identity_key";
import {
  all_retired_kek_values,
  is_retired_kek,
  retired_contexts_in,
  retired_kek_context,
  retired_kek_values_for,
  without_retired_keks,
} from "./retired_identity_keks";

describe("retired_identity_keks", () => {
  it("lists exactly the keys installed with a repaired identity key", async () => {
    const derived = (await derive_missing_identity_keks()).map((raw) =>
      array_to_base64(raw),
    );

    expect([...all_retired_kek_values()].sort()).toEqual([...derived].sort());
  });

  it("maps a retired key to the data it was derived for", () => {
    const [first] = all_retired_kek_values();

    expect(retired_kek_context(first)).toBe("astermail-tags-v1");
    expect(is_retired_kek("b3RoZXI=")).toBe(false);
    expect(retired_kek_context("not base64 at all")).toBeNull();
  });

  it("separates retired entries from the rest of a list", () => {
    const other = { k: "b3RoZXI=", added_at: "2026-01-01T00:00:00.000Z" };
    const list = [
      other,
      ...all_retired_kek_values().map((k) => ({ k, added_at: "" })),
    ];

    expect(without_retired_keks(list)).toEqual([other]);
    expect(retired_contexts_in(list)).toHaveLength(11);
    expect(retired_contexts_in([other])).toEqual([]);
    expect(
      retired_kek_values_for(list, new Set(["astermail-tags-v1"])),
    ).toEqual([all_retired_kek_values()[0]]);
  });
});
