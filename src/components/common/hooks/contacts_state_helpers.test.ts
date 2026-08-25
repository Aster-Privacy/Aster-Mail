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

import { reconcile_entry_fields } from "@/components/common/hooks/contacts_state_helpers";

describe("reconcile_entry_fields", () => {
  it("rewrites email entries from the edited flat emails", () => {
    const result = reconcile_entry_fields({
      first_name: "Ada",
      last_name: "Lovelace",
      emails: ["new@astermail.org"],
      email_entries: [{ value: "old@astermail.org", type: "work" }],
    });

    expect(result.email_entries).toEqual([
      { value: "new@astermail.org", type: "work" },
    ]);
  });

  it("keeps the type of an email that survived the edit", () => {
    const result = reconcile_entry_fields({
      first_name: "Ada",
      last_name: "Lovelace",
      emails: ["work@astermail.org", "added@astermail.org"],
      email_entries: [{ value: "work@astermail.org", type: "work" }],
    });

    expect(result.email_entries).toEqual([
      { value: "work@astermail.org", type: "work" },
      { value: "added@astermail.org", type: "other" },
    ]);
  });

  it("replaces the primary phone entry and drops it when cleared", () => {
    const base = {
      first_name: "Ada",
      last_name: "Lovelace",
      emails: ["ada@astermail.org"],
      phone_entries: [
        { value: "111", type: "mobile" as const },
        { value: "222", type: "work" as const },
      ],
    };

    expect(reconcile_entry_fields({ ...base, phone: "999" }).phone_entries).toEqual(
      [
        { value: "999", type: "mobile" },
        { value: "222", type: "work" },
      ],
    );
    expect(reconcile_entry_fields({ ...base, phone: "" }).phone_entries).toEqual([
      { value: "222", type: "work" },
    ]);
  });

  it("applies the edited address to the primary address entry", () => {
    const result = reconcile_entry_fields({
      first_name: "Ada",
      last_name: "Lovelace",
      emails: ["ada@astermail.org"],
      address: { street: "New street", city: "Bath" },
      address_entries: [{ street: "Old street", city: "London", type: "home" }],
    });

    expect(result.address_entries).toEqual([
      { street: "New street", city: "Bath", type: "home" },
    ]);
  });

  it("leaves contacts without typed entries untouched", () => {
    const result = reconcile_entry_fields({
      first_name: "Ada",
      last_name: "Lovelace",
      emails: ["ada@astermail.org"],
      phone: "999",
    });

    expect(result.email_entries).toBeUndefined();
    expect(result.phone_entries).toBeUndefined();
    expect(result.address_entries).toBeUndefined();
  });
});
