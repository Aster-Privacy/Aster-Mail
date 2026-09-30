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

import {
  reconcile_entry_fields,
  sync_legacy_fields,
} from "@/components/common/hooks/contacts_state_helpers";

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

    expect(
      reconcile_entry_fields({ ...base, phone: "999" }).phone_entries,
    ).toEqual([
      { value: "999", type: "mobile" },
      { value: "222", type: "work" },
    ]);
    expect(
      reconcile_entry_fields({ ...base, phone: "" }).phone_entries,
    ).toEqual([{ value: "222", type: "work" }]);
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

  it("builds typed entries for contacts that have none", () => {
    const result = reconcile_entry_fields({
      first_name: "Ada",
      last_name: "Lovelace",
      emails: ["ada@astermail.org"],
      phone: "999",
    });

    expect(result.email_entries).toEqual([
      { value: "ada@astermail.org", type: "other" },
    ]);
    expect(result.phone_entries).toEqual([{ value: "999", type: "mobile" }]);
    expect(result.address_entries).toEqual([]);
    expect(result.address).toBeUndefined();
  });

  it("keeps custom labels and extra entries when the flat fields change", () => {
    const result = reconcile_entry_fields({
      first_name: "Ada",
      last_name: "",
      emails: ["ada@astermail.org", "new@astermail.org"],
      phone: "111",
      address: { city: "Paris" },
      email_entries: [
        { value: "ada@astermail.org", type: "other", label: "Club" },
      ],
      phone_entries: [
        { value: "000", type: "personal" },
        { value: "222", type: "other", label: "Boat" },
      ],
      address_entries: [
        { type: "work", city: "Berlin" },
        { type: "home", city: "London" },
      ],
    });

    expect(result.email_entries).toEqual([
      { value: "ada@astermail.org", type: "other", label: "Club" },
      { value: "new@astermail.org", type: "other" },
    ]);
    expect(result.phone_entries).toEqual([
      { value: "111", type: "personal" },
      { value: "222", type: "other", label: "Boat" },
    ]);
    expect(result.address_entries).toEqual([
      { type: "work", city: "Berlin" },
      { type: "home", city: "Paris" },
    ]);
    expect(result.address).toEqual({ city: "Paris" });
  });
});

describe("sync_legacy_fields", () => {
  it("derives the legacy fields from typed entries", () => {
    const result = sync_legacy_fields({
      first_name: "Ada",
      last_name: "",
      emails: [],
      email_entries: [
        { value: " a@astermail.org ", type: "work" },
        { value: "", type: "home" },
        { value: "b@astermail.org", type: "other", label: "  " },
      ],
      phone_entries: [
        { value: "555", type: "other", label: "Studio" },
        { value: "666", type: "mobile", label: "stale" },
      ],
      address_entries: [
        { type: "work", street: "1 Main St" },
        { type: "home", city: "Lisbon" },
        { type: "other" },
      ],
    });

    expect(result.emails).toEqual(["a@astermail.org", "b@astermail.org"]);
    expect(result.email_entries).toEqual([
      { value: "a@astermail.org", type: "work" },
      { value: "b@astermail.org", type: "other" },
    ]);
    expect(result.phone).toBe("555");
    expect(result.phone_entries).toEqual([
      { value: "555", type: "other", label: "Studio" },
      { value: "666", type: "mobile" },
    ]);
    expect(result.address_entries).toHaveLength(2);
    expect(result.address).toEqual({ city: "Lisbon" });
  });

  it("falls back to the first address when none is home", () => {
    const result = sync_legacy_fields({
      first_name: "",
      last_name: "",
      emails: [],
      address_entries: [{ type: "work", city: "Oslo" }],
    });

    expect(result.address).toEqual({ city: "Oslo" });
  });
});
