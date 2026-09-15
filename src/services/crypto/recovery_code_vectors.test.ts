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
import { describe, it, expect } from "vitest";

import vectors from "./recovery_code_vectors.json";

import {
  canonicalize_recovery_code,
  is_valid_recovery_code,
  hash_recovery_code,
} from "./recovery_key";
import {
  RECOVERY_CODE_SET_SIZE,
  generate_recovery_codes,
} from "./key_manager_pgp_keygen";

describe("shared recovery code vectors", () => {
  it("ships the set size the other clients use", () => {
    expect(vectors.set_size).toBe(RECOVERY_CODE_SET_SIZE);
  });

  it("generates codes that only use the shared alphabet", () => {
    const codes = generate_recovery_codes();

    expect(codes).toHaveLength(vectors.set_size);

    for (const code of codes) {
      expect(is_valid_recovery_code(code)).toBe(true);
      expect(canonicalize_recovery_code(code)).toBe(code);

      for (const character of code.replace(/^ASTER-/, "").replace(/-/g, "")) {
        expect(vectors.alphabet).toContain(character);
      }
    }
  });

  for (const vector of vectors.vectors) {
    it(`canonicalizes ${JSON.stringify(vector.input)}`, async () => {
      expect(canonicalize_recovery_code(vector.input)).toBe(vector.canonical);
      expect(is_valid_recovery_code(vector.input)).toBe(vector.is_valid);

      if (vector.code_hash) {
        expect(await hash_recovery_code(vector.input)).toBe(vector.code_hash);
      }
    });
  }
});
