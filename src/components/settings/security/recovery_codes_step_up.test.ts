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

import { normalize_totp_input, step_up_error_key } from "./recovery_codes_step_up";

describe("recovery codes step-up", () => {
  it("keeps six digits from a spaced or dashed paste", () => {
    expect(normalize_totp_input("123 456")).toBe("123456");
    expect(normalize_totp_input(" 123-456 ")).toBe("123456");
    expect(normalize_totp_input("1234567")).toBe("123456");
  });

  it("maps each refusal to its own message", () => {
    expect(step_up_error_key({ server_code: "INVALID_TWO_FACTOR_CODE" })).toBe(
      "settings.invalid_2fa_code",
    );
    expect(step_up_error_key({ server_code: "TOTP_CODE_REPLAYED" })).toBe(
      "auth.two_fa_code_already_used",
    );
    expect(step_up_error_key({ server_code: "TOTP_REQUIRED" })).toBe(
      "settings.please_enter_2fa_code",
    );
    expect(step_up_error_key({ server_code: "INVALID_CREDENTIALS" })).toBe(
      "settings.incorrect_password_error",
    );
    expect(step_up_error_key({ server_code: "ACCOUNT_LOCKED" })).toBeNull();
    expect(step_up_error_key({})).toBeNull();
  });
});
