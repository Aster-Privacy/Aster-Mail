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

import { serialize_vcard } from "./vcard";

import { parse_vcard } from "@/services/api/contact_sync";

describe("serialize_vcard round trip", () => {
  it("keeps every phone, email type and postal address through an import", () => {
    const text = serialize_vcard({
      first_name: "Ada",
      middle_name: "Byron",
      last_name: "Lovelace",
      nickname: "Ada L.",
      display_name: "Ada Lovelace",
      email_entries: [
        { value: "ada@work.example", type: "work" },
        { value: "ada@home.example", type: "home" },
      ],
      phone_entries: [
        { value: "+1 555 0100", type: "mobile" },
        { value: "+1 555 0101", type: "work" },
      ],
      company: "Analytical Engines, Inc.",
      department: "Research",
      job_title: "Mathematician",
      role: "Lead",
      address_entries: [
        {
          street: "1 Engine Way",
          city: "London",
          state: "Greater London",
          postal_code: "SW1A 1AA",
          country: "United Kingdom",
          type: "work",
        },
      ],
      notes: "Met at a conference; follow up.",
    });

    const [contact] = parse_vcard(text);

    expect(contact.first_name).toBe("Ada");
    expect(contact.middle_name).toBe("Byron");
    expect(contact.last_name).toBe("Lovelace");
    expect(contact.nickname).toBe("Ada L.");
    expect(contact.company).toBe("Analytical Engines, Inc.");
    expect(contact.department).toBe("Research");
    expect(contact.job_title).toBe("Mathematician");
    expect(contact.role).toBe("Lead");
    expect(contact.notes).toBe("Met at a conference; follow up.");
    expect(contact.emails).toEqual(["ada@work.example", "ada@home.example"]);
    expect(contact.email_entries).toEqual([
      { value: "ada@work.example", type: "work" },
      { value: "ada@home.example", type: "home" },
    ]);
    expect(contact.phone_entries).toEqual([
      { value: "+1 555 0100", type: "mobile" },
      { value: "+1 555 0101", type: "work" },
    ]);
    expect(contact.address).toEqual({
      street: "1 Engine Way",
      city: "London",
      state: "Greater London",
      postal_code: "SW1A 1AA",
      country: "United Kingdom",
    });
    expect(contact.address_entries?.[0].type).toBe("work");
  });
});
