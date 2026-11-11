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
import { beforeEach, describe, expect, it } from "vitest";

import { generate_recovery_codes } from "./key_manager_pgp_keygen";
import {
  dismiss_recovery_code_refresh,
  has_outdated_recovery_codes,
  is_outdated_recovery_code,
  is_recovery_code_refresh_due,
  reset_recovery_code_refresh,
} from "./recovery_code_refresh";

const CURRENT = "ASTER-AAAA-BBBB-CCCC-DDDD";
const OUTDATED = "ASTER-AAAA-BBBB-CCCC";

describe("recovery code refresh", () => {
  beforeEach(() => {
    reset_recovery_code_refresh();
  });

  it("treats a three group code as outdated in any spelling", () => {
    expect(is_outdated_recovery_code(OUTDATED)).toBe(true);
    expect(is_outdated_recovery_code("aster aaaa bbbb cccc")).toBe(true);
    expect(is_outdated_recovery_code("ASTERAAAABBBBCCCC")).toBe(true);
  });

  it("keeps a four group code and ignores anything that is not a code", () => {
    expect(is_outdated_recovery_code(CURRENT)).toBe(false);
    expect(is_outdated_recovery_code("ASTER-AAAA-BBBB")).toBe(false);
    expect(is_outdated_recovery_code("")).toBe(false);
    expect(is_outdated_recovery_code(null)).toBe(false);
    expect(is_outdated_recovery_code(42)).toBe(false);
  });

  it("never reports a freshly generated set as outdated", () => {
    const codes = generate_recovery_codes(10);

    expect(codes).toHaveLength(10);
    expect(has_outdated_recovery_codes(codes)).toBe(false);
  });

  it("reports a set as outdated when any code in it is", () => {
    expect(has_outdated_recovery_codes([CURRENT, OUTDATED])).toBe(true);
    expect(has_outdated_recovery_codes([CURRENT])).toBe(false);
    expect(has_outdated_recovery_codes([])).toBe(false);
    expect(has_outdated_recovery_codes(undefined)).toBe(false);
    expect(has_outdated_recovery_codes(null)).toBe(false);
  });

  it("stays due until the set is replaced", () => {
    expect(is_recovery_code_refresh_due([OUTDATED])).toBe(true);
    expect(is_recovery_code_refresh_due([OUTDATED])).toBe(true);
    expect(is_recovery_code_refresh_due([CURRENT])).toBe(false);
  });

  it("stays quiet for the rest of the session after a dismissal", () => {
    dismiss_recovery_code_refresh();

    expect(is_recovery_code_refresh_due([OUTDATED])).toBe(false);

    reset_recovery_code_refresh();

    expect(is_recovery_code_refresh_due([OUTDATED])).toBe(true);
  });
});
