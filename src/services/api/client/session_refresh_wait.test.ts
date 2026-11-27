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

import { waits_for_session_refresh } from "./helpers";

describe("waits_for_session_refresh", () => {
  it("holds ordinary reads until the session refresh lands", () => {
    expect(
      waits_for_session_refresh("/crypto/v1/keys/account-key", false),
    ).toBe(true);
    expect(
      waits_for_session_refresh("/core/v1/auth/me/storage-rekey/status", false),
    ).toBe(true);
  });

  it("never holds the session calls that perform the refresh", () => {
    expect(waits_for_session_refresh("/core/v1/auth/me", false)).toBe(false);
    expect(waits_for_session_refresh("/core/v1/auth/refresh", false)).toBe(
      false,
    );
    expect(waits_for_session_refresh("/core/v1/auth/logout", false)).toBe(
      false,
    );
    expect(waits_for_session_refresh("/core/v1/auth/login", false)).toBe(false);
  });

  it("respects a caller that opts out of the refresh", () => {
    expect(waits_for_session_refresh("/crypto/v1/keys/account-key", true)).toBe(
      false,
    );
  });
});
