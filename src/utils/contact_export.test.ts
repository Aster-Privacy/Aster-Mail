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
import type { DecryptedContact } from "@/types/contacts";

import { describe, expect, it } from "vitest";

import { contact_to_vcard, contacts_to_vcard } from "@/utils/contact_export";

const make = (overrides: Partial<DecryptedContact> = {}): DecryptedContact =>
  ({
    id: "a",
    first_name: "Ada",
    last_name: "Lovelace",
    emails: ["ada@example.com"],
    groups: [],
    is_favorite: false,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  }) as DecryptedContact;

describe("contact_to_vcard", () => {
  it("writes a version 3 card with the name and address", () => {
    const card = contact_to_vcard(make());

    expect(card.startsWith("BEGIN:VCARD\r\nVERSION:3.0")).toBe(true);
    expect(card).toContain("N:Lovelace;Ada;;;");
    expect(card).toContain("FN:Ada Lovelace");
    expect(card).toContain("EMAIL;TYPE=INTERNET:ada@example.com");
    expect(card.endsWith("END:VCARD")).toBe(true);
  });

  it("escapes separators in free text", () => {
    const card = contact_to_vcard(
      make({ notes: "Met at a talk; loved it, a lot" }),
    );

    expect(card).toContain("NOTE:Met at a talk\\; loved it\\, a lot");
  });

  it("writes groups as categories", () => {
    const card = contact_to_vcard(make({ groups: ["Work", "Team"] }));

    expect(card).toContain("CATEGORIES:Work,Team");
  });

  it("folds long lines at seventy five characters", () => {
    const card = contact_to_vcard(make({ notes: "x".repeat(200) }));
    const note_line = card
      .split("\r\n")
      .find((line) => line.startsWith("NOTE:")) as string;

    expect(note_line.length).toBe(75);
  });
});

describe("contacts_to_vcard", () => {
  it("joins every card and ends with a newline", () => {
    const output = contacts_to_vcard([make(), make({ id: "b" })]);

    expect(output.match(/BEGIN:VCARD/g)).toHaveLength(2);
    expect(output.endsWith("\r\n")).toBe(true);
  });
});
