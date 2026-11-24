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
  legacy_email_entries,
  legacy_emails,
  legacy_phone_entries,
} from "./contact_legacy_entries";
import { parse_vcard } from "./contact_sync";

import { serialize_vcard } from "@/utils/export/vcard";

describe("legacy_phone_entries", () => {
  it("keeps typed phone entries as they are", () => {
    const entries = [
      { value: "+1 555 0100", type: "work" as const },
      { value: "+1 555 0101", type: "personal" as const },
    ];

    expect(
      legacy_phone_entries({
        phone: "+1 555 0100",
        work_phone: "+1 555 0999",
        phone_entries: entries,
      }),
    ).toBe(entries);
  });

  it("builds mobile and work entries from an old payload", () => {
    expect(
      legacy_phone_entries({ phone: "+1 555 0100", work_phone: "+1 555 0200" }),
    ).toEqual([
      { value: "+1 555 0100", type: "mobile" },
      { value: "+1 555 0200", type: "work" },
    ]);
  });

  it("keeps a work phone when there is no main phone", () => {
    expect(legacy_phone_entries({ work_phone: " +1 555 0200 " })).toEqual([
      { value: "+1 555 0200", type: "work" },
    ]);
  });

  it("does not repeat a work phone that matches the main phone", () => {
    expect(
      legacy_phone_entries({ phone: "+1 (555) 0100", work_phone: "15550100" }),
    ).toEqual([{ value: "+1 (555) 0100", type: "mobile" }]);
  });

  it("leaves a payload with only one phone unchanged", () => {
    expect(legacy_phone_entries({ phone: "+1 555 0100" })).toBeUndefined();
    expect(legacy_phone_entries({})).toBeUndefined();
  });
});

describe("legacy_emails", () => {
  it("adds a work email that is missing from the list", () => {
    expect(
      legacy_emails({
        emails: ["ada@example.com"],
        work_email: "ada@work.example",
      }),
    ).toEqual(["ada@example.com", "ada@work.example"]);
  });

  it("does not repeat a work email already in the list", () => {
    expect(
      legacy_emails({
        emails: ["Ada@Work.example"],
        work_email: "ada@work.example",
      }),
    ).toEqual(["Ada@Work.example"]);
  });

  it("drops blank and non-string values", () => {
    expect(legacy_emails({ emails: ["", 4, "a@example.com"] })).toEqual([
      "a@example.com",
    ]);
  });
});

describe("legacy_email_entries", () => {
  it("types the work email as work", () => {
    expect(
      legacy_email_entries({
        emails: ["ada@example.com"],
        work_email: "ada@work.example",
      }),
    ).toEqual([
      { value: "ada@example.com", type: "other" },
      { value: "ada@work.example", type: "work" },
    ]);
  });

  it("leaves payloads without a work email unchanged", () => {
    expect(legacy_email_entries({ emails: ["a@example.com"] })).toBeUndefined();
  });
});

describe("vcard round trip", () => {
  it("exports and imports every phone of an old payload", () => {
    const card = serialize_vcard({
      first_name: "Ada",
      last_name: "Lovelace",
      phone_entries: legacy_phone_entries({
        phone: "+1 555 0100",
        work_phone: "+1 555 0200",
      }),
    });
    const [contact] = parse_vcard(card);

    expect(contact.phone_entries).toEqual([
      expect.objectContaining({ value: "+1 555 0100", type: "mobile" }),
      expect.objectContaining({ value: "+1 555 0200", type: "work" }),
    ]);
  });

  it("keeps a personal phone type", () => {
    const card = serialize_vcard({
      first_name: "Ada",
      phone_entries: [
        { value: "+1 555 0100", type: "work" },
        { value: "+1 555 0101", type: "personal" },
      ],
    });
    const [contact] = parse_vcard(card);

    expect(contact.phone_entries?.map((entry) => entry.type)).toEqual([
      "work",
      "personal",
    ]);
  });
});
