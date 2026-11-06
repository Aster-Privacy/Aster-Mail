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
  MAX_LEGACY_KEKS,
  keep_password_change_keks,
  serialize_kek_for_vault,
} from "./legacy_keks";

function raw_key(seed: number): Uint8Array {
  return new Uint8Array(32).fill(seed % 256).map((byte, i) => byte ^ i);
}

describe("keep_password_change_keks", () => {
  it("keeps every existing key past the list cap", () => {
    const existing = Array.from({ length: MAX_LEGACY_KEKS + 6 }, (_, i) =>
      serialize_kek_for_vault(raw_key(i)),
    );
    const fresh = [raw_key(200), raw_key(201)];
    const list = keep_password_change_keks(existing, fresh);

    expect(list).toHaveLength(existing.length + fresh.length);
    for (const entry of existing) {
      expect(list.some((held) => held.k === entry.k)).toBe(true);
    }
    expect(list[0].k).toBe(serialize_kek_for_vault(fresh[0]).k);
  });

  it("adds a repeated key only once", () => {
    const existing = [raw_key(1), raw_key(2)].map((raw) =>
      serialize_kek_for_vault(raw),
    );
    const list = keep_password_change_keks(existing, [
      raw_key(2),
      raw_key(3),
      raw_key(3),
    ]);
    const keys = list.map((entry) => entry.k);

    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toHaveLength(3);
    expect(keys[0]).toBe(serialize_kek_for_vault(raw_key(2)).k);
  });

  it("is stable when the same change repeats", () => {
    const fresh = [raw_key(9), raw_key(10)];
    const once = keep_password_change_keks(undefined, fresh);
    const twice = keep_password_change_keks(once, fresh);

    expect(twice.map((entry) => entry.k)).toEqual(once.map((entry) => entry.k));
  });
});
