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
import { describe, expect, it } from "vitest";

import { apply_key_history_limit } from "./key_rotation_service";
import { MAX_LEGACY_IDENTITY_KEYS } from "@/services/crypto/identity_key_materials";

describe("apply_key_history_limit", () => {
  it("keeps every key when the limit is unlimited", () => {
    const result = apply_key_history_limit(["a", "b", "c"], undefined, 0);

    expect(result.previous_keys).toEqual(["a", "b", "c"]);
    expect(result.legacy_identity_keys).toBeUndefined();
  });

  it("leaves the legacy list untouched when nothing is trimmed", () => {
    const legacy = ["x"];
    const result = apply_key_history_limit(["a", "b"], legacy, 5);

    expect(result.previous_keys).toEqual(["a", "b"]);
    expect(result.legacy_identity_keys).toBe(legacy);
  });

  it("moves keys past the limit into the legacy list instead of dropping them", () => {
    const result = apply_key_history_limit(["a", "b", "c", "d"], ["x", "c"], 2);

    expect(result.previous_keys).toEqual(["a", "b"]);
    expect(result.legacy_identity_keys).toEqual(["c", "d", "x"]);
  });

  it("caps the legacy list", () => {
    const previous = Array.from(
      { length: MAX_LEGACY_IDENTITY_KEYS + 5 },
      (_, i) => `k${i}`,
    );
    const result = apply_key_history_limit(previous, [], 1);

    expect(result.previous_keys).toEqual(["k0"]);
    expect(result.legacy_identity_keys).toHaveLength(MAX_LEGACY_IDENTITY_KEYS);
    expect(result.legacy_identity_keys?.[0]).toBe("k1");
  });
});
