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
import type { ContactGroup, DecryptedContact } from "@/types/contacts";

import { describe, it, expect } from "vitest";

import {
  group_add_candidates,
  group_member_count,
  group_member_counts,
  group_member_emails,
  group_members,
} from "./contact_group_members";

function contact(
  id: string,
  first_name: string,
  emails: string[],
  groups?: string[],
): DecryptedContact {
  return {
    id,
    first_name,
    last_name: "",
    emails,
    groups,
  } as DecryptedContact;
}

const group = { id: "g1", name: "One", contact_count: 7 } as ContactGroup;

const contacts = [
  contact("c3", "zoe", ["zoe@example.test"], ["g1"]),
  contact("c1", "Ana", ["ana@example.test"], ["g1", "g1", "g2"]),
  contact("c2", "", ["ANA@example.test"], ["g1"]),
  contact("c4", "Bruno", ["bruno@example.test"]),
];

describe("contact group members", () => {
  it("counts each contact once per group", () => {
    const counts = group_member_counts(contacts);

    expect(counts.get("g1")).toBe(3);
    expect(counts.get("g2")).toBe(1);
  });

  it("uses the server count only until contacts are ready", () => {
    const counts = group_member_counts(contacts);

    expect(group_member_count(group, counts, false)).toBe(7);
    expect(group_member_count(group, counts, true)).toBe(3);
    expect(
      group_member_count({ ...group, id: "g9" }, counts, true),
    ).toBe(0);
  });

  it("lists members sorted by name", () => {
    expect(group_members(contacts, "g1").map((entry) => entry.id)).toEqual([
      "c1",
      "c2",
      "c3",
    ]);
  });

  it("offers only contacts outside the group, filtered by query", () => {
    expect(group_add_candidates(contacts, "g2", "").map((c) => c.id)).toEqual(
      ["c2", "c4", "c3"],
    );
    expect(
      group_add_candidates(contacts, "g2", "BRU").map((c) => c.id),
    ).toEqual(["c4"]);
  });

  it("joins unique member emails", () => {
    expect(group_member_emails(group_members(contacts, "g1"))).toBe(
      "ana@example.test, zoe@example.test",
    );
  });
});
