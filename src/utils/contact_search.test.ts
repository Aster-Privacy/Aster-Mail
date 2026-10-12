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
import type { DecryptedContact } from "@/types/contacts";

import { describe, expect, it } from "vitest";

import { contact_matches_query } from "@/utils/contact_search";

function make_contact(overrides: Partial<DecryptedContact>): DecryptedContact {
  return {
    id: "c1",
    first_name: "Zoë",
    last_name: "Müller",
    emails: ["zoe@example.org"],
    ...overrides,
  } as DecryptedContact;
}

describe("contact_matches_query", () => {
  it("matches a full name typed with a space", () => {
    expect(contact_matches_query(make_contact({}), "zoe muller")).toBe(true);
  });

  it("matches last name first", () => {
    expect(contact_matches_query(make_contact({}), "Müller Zoë")).toBe(true);
  });

  it("ignores surrounding and repeated spaces", () => {
    expect(contact_matches_query(make_contact({}), "  zoe   muller ")).toBe(
      true,
    );
  });

  it("matches secondary email entries", () => {
    const contact = make_contact({
      email_entries: [{ value: "work@corp.example", label: "work" }],
    } as Partial<DecryptedContact>);

    expect(contact_matches_query(contact, "corp.example")).toBe(true);
  });

  it("matches a phone number typed without separators", () => {
    const contact = make_contact({ phone: "+1 (555) 010-2030" });

    expect(contact_matches_query(contact, "5550102030")).toBe(true);
    expect(contact_matches_query(contact, "555 010")).toBe(true);
  });

  it("does not match across separate fields", () => {
    const contact = make_contact({ company: "Acme" });

    expect(contact_matches_query(contact, "muller acme")).toBe(false);
  });

  it("treats a blank query as a match", () => {
    expect(contact_matches_query(make_contact({}), "   ")).toBe(true);
  });
});
