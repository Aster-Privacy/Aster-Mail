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

import { resolve_sync_since_date } from "@/components/settings/hooks/external_accounts_utils";

const now = new Date("2026-10-18T12:00:00.000Z");

describe("resolve_sync_since_date", () => {
  it("starts a new account from now unless existing mail is imported", () => {
    expect(
      resolve_sync_since_date({
        is_editing: false,
        import_existing: false,
        current_since_date: null,
        now,
      }),
    ).toBe("2026-10-18T12:00:00.000Z");
  });

  it("imports everything when existing mail is requested", () => {
    expect(
      resolve_sync_since_date({
        is_editing: false,
        import_existing: true,
        current_since_date: null,
        now,
      }),
    ).toBeNull();
  });

  it("keeps the saved date when an account is edited", () => {
    expect(
      resolve_sync_since_date({
        is_editing: true,
        import_existing: false,
        current_since_date: "2026-09-01T08:30:00.000Z",
        now,
      }),
    ).toBe("2026-09-01T08:30:00.000Z");
    expect(
      resolve_sync_since_date({
        is_editing: true,
        import_existing: false,
        current_since_date: null,
        now,
      }),
    ).toBeNull();
  });
});
