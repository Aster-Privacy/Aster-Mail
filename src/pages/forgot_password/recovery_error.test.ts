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
  is_recovery_session_expired,
  recovery_error_message,
} from "./recovery_error";

const t = (key: string) => key;

describe("recovery_error", () => {
  it("treats a 401 from complete as an expired recovery session", () => {
    expect(is_recovery_session_expired({ status: 401, error: "x" })).toBe(true);
    expect(
      is_recovery_session_expired({ server_code: "UNAUTHORIZED", error: "x" }),
    ).toBe(true);
    expect(
      is_recovery_session_expired({
        status: 400,
        server_code: "INVALID_RECOVERY_CODE",
      }),
    ).toBe(false);
  });

  it("maps coded recovery code misses to their messages", () => {
    expect(
      recovery_error_message({ server_code: "RECOVERY_CODE_USED" }, t),
    ).toBe("auth.recovery_code_already_used");
    expect(
      recovery_error_message({ server_code: "RECOVERY_CODE_REPLACED" }, t),
    ).toBe("auth.recovery_code_replaced");
    expect(
      recovery_error_message({ server_code: "INVALID_RECOVERY_CODE" }, t),
    ).toBe("auth.invalid_recovery_code");
  });
});
