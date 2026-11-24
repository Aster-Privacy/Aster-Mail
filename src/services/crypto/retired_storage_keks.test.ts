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
import type { EncryptedVault } from "./key_manager_core";

import { describe, expect, it } from "vitest";

import { array_to_base64 } from "./base64";
import {
  legacy_kek_ids,
  mark_keks_for_retirement,
  retire_swept_keks,
  retired_storage_kek_id,
  strip_retired_storage_keks,
} from "./retired_storage_keks";

function raw_of(seed: number): Uint8Array {
  return new Uint8Array(32).fill(seed);
}

function entry(seed: number) {
  return { k: array_to_base64(raw_of(seed)), added_at: "2026-11-01T00:00:00Z" };
}

type Vault = Pick<
  EncryptedVault,
  | "legacy_keks"
  | "pending_retire_kek_ids"
  | "retired_storage_kek_ids"
  | "data_kek"
>;

describe("retired storage keys", () => {
  it("drops an old password key once a sweep has moved its data", () => {
    const vault: Vault = {
      legacy_keks: [entry(1), entry(2)],
      pending_retire_kek_ids: mark_keks_for_retirement(undefined, [raw_of(1)]),
    };

    const next = retire_swept_keks(vault, legacy_kek_ids(vault));

    expect(next).not.toBeNull();
    expect(next!.legacy_keks).toEqual([entry(2)]);
    expect(next!.pending_retire_kek_ids).toBeUndefined();
    expect(next!.retired_storage_kek_ids).toEqual([
      retired_storage_kek_id(raw_of(1)),
    ]);
  });

  it("keeps a key the finished sweep did not cover", () => {
    const vault: Vault = {
      legacy_keks: [entry(1), entry(3)],
      pending_retire_kek_ids: mark_keks_for_retirement(undefined, [
        raw_of(1),
        raw_of(3),
      ]),
    };

    const next = retire_swept_keks(vault, legacy_kek_ids({
      legacy_keks: [entry(1)],
    }));

    expect(next!.legacy_keks).toEqual([entry(3)]);
    expect(next!.pending_retire_kek_ids).toEqual([
      retired_storage_kek_id(raw_of(3)),
    ]);
  });

  it("does nothing before any sweep has finished", () => {
    const vault: Vault = {
      legacy_keks: [entry(1)],
      pending_retire_kek_ids: mark_keks_for_retirement(undefined, [raw_of(1)]),
    };

    expect(retire_swept_keks(vault, [])).toBeNull();
    expect(strip_retired_storage_keks(vault)).toBe(vault);
  });

  it("removes a retired key that an older client wrote back", () => {
    const vault: Vault = {
      legacy_keks: [entry(4), entry(1)],
      retired_storage_kek_ids: [retired_storage_kek_id(raw_of(1))],
    };

    expect(strip_retired_storage_keks(vault).legacy_keks).toEqual([entry(4)]);
  });

  it("never marks the current storage key for retirement", () => {
    const current = array_to_base64(raw_of(9));

    expect(
      mark_keks_for_retirement(undefined, [raw_of(9), raw_of(1)], current),
    ).toEqual([retired_storage_kek_id(raw_of(1))]);
  });
});
