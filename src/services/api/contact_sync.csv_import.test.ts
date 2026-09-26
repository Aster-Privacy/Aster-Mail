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
  auto_map_csv_headers,
  describe_csv_column,
  parse_csv,
} from "./contact_sync";

const GOOGLE_OLD_HEADERS = [
  "Name",
  "Given Name",
  "Additional Name",
  "Family Name",
  "Yomi Name",
  "Given Name Yomi",
  "Additional Name Yomi",
  "Family Name Yomi",
  "Name Prefix",
  "Name Suffix",
  "Initials",
  "Nickname",
  "Short Name",
  "Maiden Name",
  "Birthday",
  "Gender",
  "Location",
  "Billing Information",
  "Directory Server",
  "Mileage",
  "Occupation",
  "Hobby",
  "Sensitivity",
  "Priority",
  "Subject",
  "Notes",
  "Language",
  "Photo",
  "Group Membership",
  "E-mail 1 - Type",
  "E-mail 1 - Value",
  "E-mail 2 - Type",
  "E-mail 2 - Value",
  "Phone 1 - Type",
  "Phone 1 - Value",
  "Phone 2 - Type",
  "Phone 2 - Value",
  "Address 1 - Type",
  "Address 1 - Formatted",
  "Address 1 - Street",
  "Address 1 - City",
  "Address 1 - PO Box",
  "Address 1 - Region",
  "Address 1 - Postal Code",
  "Address 1 - Country",
  "Address 1 - Extended Address",
  "Organization 1 - Type",
  "Organization 1 - Name",
  "Organization 1 - Yomi Name",
  "Organization 1 - Title",
  "Organization 1 - Department",
  "Organization 1 - Symbol",
  "Organization 1 - Location",
  "Organization 1 - Job Description",
  "Website 1 - Type",
  "Website 1 - Value",
  "Event 1 - Type",
  "Event 1 - Value",
  "Relation 1 - Type",
  "Relation 1 - Value",
  "IM 1 - Type",
  "IM 1 - Service",
  "IM 1 - Value",
  "Custom Field 1 - Type",
  "Custom Field 1 - Value",
];

const GOOGLE_OLD_ROW = [
  "Dr. Ada Marie Lovelace PhD",
  "Ada",
  "Marie",
  "Lovelace",
  "",
  "",
  "",
  "",
  "Dr.",
  "PhD",
  "",
  "Addie",
  "",
  "",
  "1815-12-10",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "Met at the engine demo",
  "",
  "",
  "* myContacts ::: * Starred ::: Engineers",
  "* Home",
  "ada@example.com ::: ada.alt@example.com",
  "Work",
  "ada@analytical.example",
  "Mobile",
  "+44 20 7946 0958",
  "Work",
  "+44 20 7946 0000 ::: +44 20 7946 0001",
  "Home",
  "12 Baker St\nLondon NW1 6XE\nUK",
  "12 Baker St",
  "London",
  "",
  "Greater London",
  "NW1 6XE",
  "UK",
  "Flat 2",
  "",
  "Analytical Engines Ltd",
  "",
  "Chief Engineer",
  "R&D",
  "",
  "",
  "",
  "Profile",
  "https://www.linkedin.com/in/ada",
  "Anniversary",
  "1835-07-08",
  "Spouse",
  "William King",
  "",
  "Signal",
  "+44 20 7946 0958",
  "Membership number",
  "12345",
];

const GOOGLE_NEW_HEADERS = [
  "First Name",
  "Middle Name",
  "Last Name",
  "Phonetic First Name",
  "Phonetic Middle Name",
  "Phonetic Last Name",
  "Name Prefix",
  "Name Suffix",
  "Nickname",
  "File As",
  "Organization Name",
  "Organization Title",
  "Organization Department",
  "Birthday",
  "Notes",
  "Photo",
  "Labels",
  "E-mail 1 - Label",
  "E-mail 1 - Value",
  "E-mail 2 - Label",
  "E-mail 2 - Value",
  "Phone 1 - Label",
  "Phone 1 - Value",
  "Address 1 - Label",
  "Address 1 - Formatted",
  "Address 1 - Street",
  "Address 1 - City",
  "Address 1 - PO Box",
  "Address 1 - Region",
  "Address 1 - Postal Code",
  "Address 1 - Country",
  "Address 1 - Extended Address",
  "Website 1 - Label",
  "Website 1 - Value",
  "Event 1 - Label",
  "Event 1 - Value",
  "Relation 1 - Label",
  "Relation 1 - Value",
  "Custom Field 1 - Label",
  "Custom Field 1 - Value",
];

const GOOGLE_NEW_ROW = [
  "Grace",
  "Brewster",
  "Hopper",
  "",
  "",
  "",
  "RADM",
  "",
  "Amazing Grace",
  "Hopper, Grace",
  "US Navy",
  "Rear Admiral",
  "Computing",
  "1906-12-09",
  "COBOL pioneer",
  "",
  "* myContacts ::: Navy ::: Mentors",
  "* Work",
  "grace@navy.example",
  "* Home",
  "grace@home.example",
  "* Mobile",
  "+1 555 0100",
  "* Work",
  "3801 Nebraska Ave NW\nWashington, DC 20016\nUS",
  "3801 Nebraska Ave NW",
  "Washington",
  "",
  "DC",
  "20016",
  "US",
  "",
  "* Work",
  "https://example.org/grace",
  "* Anniversary",
  "1944-01-01",
  "* Assistant",
  "Jean Sammet",
  "* Ship",
  "USS Hopper",
];

const OUTLOOK_HEADERS = [
  "First Name",
  "Middle Name",
  "Last Name",
  "Title",
  "Suffix",
  "Initials",
  "Web Page",
  "Gender",
  "Birthday",
  "Anniversary",
  "Location",
  "Language",
  "Internet Free Busy",
  "Notes",
  "E-mail Address",
  "E-mail 2 Address",
  "E-mail 3 Address",
  "Primary Phone",
  "Home Phone",
  "Home Phone 2",
  "Mobile Phone",
  "Pager",
  "Home Fax",
  "Home Address",
  "Home Street",
  "Home Street 2",
  "Home Street 3",
  "Home Address PO Box",
  "Home City",
  "Home State",
  "Home Postal Code",
  "Home Country",
  "Spouse",
  "Children",
  "Manager's Name",
  "Assistant's Name",
  "Referred By",
  "Company Main Phone",
  "Business Phone",
  "Business Phone 2",
  "Business Fax",
  "Assistant's Phone",
  "Company",
  "Job Title",
  "Department",
  "Office Location",
  "Organizational ID Number",
  "Profession",
  "Account",
  "Business Address",
  "Business Street",
  "Business Street 2",
  "Business Street 3",
  "Business Address PO Box",
  "Business City",
  "Business State",
  "Business Postal Code",
  "Business Country",
  "Other Phone",
  "Other Fax",
  "Other Address",
  "Other Street",
  "Other Street 2",
  "Other Street 3",
  "Other Address PO Box",
  "Other City",
  "Other State",
  "Other Postal Code",
  "Other Country",
  "Callback",
  "Car Phone",
  "ISDN",
  "Radio Phone",
  "TTY/TDD Phone",
  "Telex",
  "User 1",
  "User 2",
  "User 3",
  "User 4",
  "Keywords",
  "Mileage",
  "Hobby",
  "Billing Information",
  "Directory Server",
  "Sensitivity",
  "Priority",
  "Private",
  "Categories",
];

const OUTLOOK_ROW = [
  "Alan",
  "Mathison",
  "Turing",
  "Mr.",
  "OBE",
  "AMT",
  "https://example.com/alan",
  "",
  "1912-06-23",
  "1950-10-01",
  "",
  "",
  "",
  "Bletchley",
  "alan@example.com",
  "alan.work@example.com",
  "",
  "",
  "+44 1908 000000",
  "",
  "+44 7700 900000",
  "",
  "",
  "",
  "Hut 8",
  "Bletchley Park",
  "",
  "",
  "Milton Keynes",
  "Bucks",
  "MK3 6EB",
  "UK",
  "",
  "",
  "Max Newman",
  "Joan Clarke",
  "",
  "",
  "+44 1908 111111",
  "",
  "",
  "",
  "GC&CS",
  "Cryptanalyst",
  "Hut 8",
  "",
  "",
  "",
  "",
  "",
  "Wilton Ave",
  "",
  "",
  "",
  "Bletchley",
  "",
  "MK3 6EB",
  "UK",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "Colleagues;Mathematicians",
];

function to_csv(headers: string[], rows: string[][]): string {
  const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;

  return [headers, ...rows].map((row) => row.map(escape).join(",")).join("\n");
}

describe("describe_csv_column", () => {
  it("maps indexed Google columns to typed slots", () => {
    expect(describe_csv_column("E-mail 1 - Value")).toEqual({
      target: "emails",
      key: "email:1",
      part: "value",
    });
    expect(describe_csv_column("E-mail 1 - Label")).toEqual({
      target: null,
      key: "email:1",
      part: "label",
    });
    expect(describe_csv_column("Address 1 - Region").target).toBe("state");
    expect(describe_csv_column("Organization Name").target).toBe("company");
    expect(describe_csv_column("Organization 1 - Title").target).toBe(
      "job_title",
    );
    expect(describe_csv_column("Website 1 - Type").target).toBeNull();
    expect(describe_csv_column("Phonetic First Name").target).toBeNull();
    expect(describe_csv_column("Photo").target).toBeNull();
  });

  it("maps typed Outlook columns and implies the entry type", () => {
    expect(describe_csv_column("E-mail 2 Address")).toMatchObject({
      target: "emails",
      key: "email:2",
    });
    expect(describe_csv_column("Business Fax")).toMatchObject({
      target: "phone",
      implied_type: "fax",
    });
    expect(describe_csv_column("Home Postal Code")).toMatchObject({
      target: "postal_code",
      key: "address:home",
    });
    expect(describe_csv_column("Manager's Name")).toMatchObject({
      target: "related_person",
      implied_type: "manager",
    });
    expect(describe_csv_column("Categories").target).toBe("groups");
  });
});

describe("auto_map_csv_headers", () => {
  it("treats Title as a name prefix when a Job Title column exists", () => {
    const mapping = auto_map_csv_headers(OUTLOOK_HEADERS);

    expect(mapping["Title"]).toBe("name_prefix");
    expect(mapping["Job Title"]).toBe("job_title");
    expect(mapping["Suffix"]).toBe("name_suffix");
  });

  it("keeps a lone Title column as a job title", () => {
    expect(auto_map_csv_headers(["Name", "Title"])["Title"]).toBe("job_title");
  });
});

describe("parse_csv", () => {
  it("imports every field of a legacy Google export", () => {
    const csv = to_csv(GOOGLE_OLD_HEADERS, [GOOGLE_OLD_ROW]);
    const [contact] = parse_csv(csv, auto_map_csv_headers(GOOGLE_OLD_HEADERS));

    expect(contact.first_name).toBe("Ada");
    expect(contact.middle_name).toBe("Marie");
    expect(contact.last_name).toBe("Lovelace");
    expect(contact.title).toBe("Dr.");
    expect(contact.name_suffix).toBe("PhD");
    expect(contact.nickname).toBe("Addie");
    expect(contact.birthday).toBe("1815-12-10");
    expect(contact.emails).toEqual([
      "ada@example.com",
      "ada.alt@example.com",
      "ada@analytical.example",
    ]);
    expect(contact.email_entries).toEqual([
      { value: "ada@example.com", type: "home" },
      { value: "ada.alt@example.com", type: "home" },
      { value: "ada@analytical.example", type: "work" },
    ]);
    expect(contact.phone).toBe("+44 20 7946 0958");
    expect(contact.phone_entries).toEqual([
      { value: "+44 20 7946 0958", type: "mobile" },
      { value: "+44 20 7946 0000", type: "work" },
      { value: "+44 20 7946 0001", type: "work" },
    ]);
    expect(contact.address).toEqual({
      street: "12 Baker St, Flat 2",
      city: "London",
      state: "Greater London",
      postal_code: "NW1 6XE",
      country: "UK",
    });
    expect(contact.address_entries?.[0].type).toBe("home");
    expect(contact.company).toBe("Analytical Engines Ltd");
    expect(contact.job_title).toBe("Chief Engineer");
    expect(contact.department).toBe("R&D");
    expect(contact.social_links).toEqual({
      linkedin: "https://www.linkedin.com/in/ada",
    });
    expect(contact.date_entries).toEqual([
      { value: "1835-07-08", type: "anniversary" },
    ]);
    expect(contact.related_people).toEqual([
      { value: "William King", type: "spouse" },
    ]);
    expect(contact.instant_messengers).toEqual([
      { value: "+44 20 7946 0958", type: "signal" },
    ]);
    expect(contact.notes).toBe(
      "Met at the engine demo\nMembership number: 12345",
    );
    expect(contact.groups).toEqual(["Engineers"]);
    expect(contact.is_favorite).toBe(true);
  });

  it("imports every field of a current Google export", () => {
    const csv = to_csv(GOOGLE_NEW_HEADERS, [GOOGLE_NEW_ROW]);
    const [contact] = parse_csv(csv, auto_map_csv_headers(GOOGLE_NEW_HEADERS));

    expect(contact.first_name).toBe("Grace");
    expect(contact.middle_name).toBe("Brewster");
    expect(contact.last_name).toBe("Hopper");
    expect(contact.title).toBe("RADM");
    expect(contact.nickname).toBe("Amazing Grace");
    expect(contact.company).toBe("US Navy");
    expect(contact.job_title).toBe("Rear Admiral");
    expect(contact.department).toBe("Computing");
    expect(contact.email_entries).toEqual([
      { value: "grace@navy.example", type: "work" },
      { value: "grace@home.example", type: "home" },
    ]);
    expect(contact.phone_entries).toEqual([
      { value: "+1 555 0100", type: "mobile" },
    ]);
    expect(contact.address_entries).toEqual([
      {
        type: "work",
        street: "3801 Nebraska Ave NW",
        city: "Washington",
        state: "DC",
        postal_code: "20016",
        country: "US",
      },
    ]);
    expect(contact.websites).toEqual([
      { value: "https://example.org/grace", type: "work" },
    ]);
    expect(contact.social_links?.website).toBe("https://example.org/grace");
    expect(contact.date_entries).toEqual([
      { value: "1944-01-01", type: "anniversary" },
    ]);
    expect(contact.related_people).toEqual([
      { value: "Jean Sammet", type: "assistant" },
    ]);
    expect(contact.notes).toBe("COBOL pioneer\nShip: USS Hopper");
    expect(contact.groups).toEqual(["Navy", "Mentors"]);
    expect(contact.is_favorite).toBe(false);
  });

  it("imports every field of an Outlook export", () => {
    const csv = to_csv(OUTLOOK_HEADERS, [OUTLOOK_ROW]);
    const [contact] = parse_csv(csv, auto_map_csv_headers(OUTLOOK_HEADERS));

    expect(contact.first_name).toBe("Alan");
    expect(contact.middle_name).toBe("Mathison");
    expect(contact.last_name).toBe("Turing");
    expect(contact.title).toBe("Mr.");
    expect(contact.name_suffix).toBe("OBE");
    expect(contact.job_title).toBe("Cryptanalyst");
    expect(contact.company).toBe("GC&CS");
    expect(contact.department).toBe("Hut 8");
    expect(contact.birthday).toBe("1912-06-23");
    expect(contact.emails).toEqual([
      "alan@example.com",
      "alan.work@example.com",
    ]);
    expect(contact.phone_entries).toEqual([
      { value: "+44 1908 000000", type: "home" },
      { value: "+44 7700 900000", type: "mobile" },
      { value: "+44 1908 111111", type: "work" },
    ]);
    expect(contact.address_entries).toEqual([
      {
        type: "home",
        street: "Hut 8, Bletchley Park",
        city: "Milton Keynes",
        state: "Bucks",
        postal_code: "MK3 6EB",
        country: "UK",
      },
      {
        type: "work",
        street: "Wilton Ave",
        city: "Bletchley",
        postal_code: "MK3 6EB",
        country: "UK",
      },
    ]);
    expect(contact.websites).toEqual([
      { value: "https://example.com/alan", type: "other" },
    ]);
    expect(contact.date_entries).toEqual([
      { value: "1950-10-01", type: "anniversary" },
    ]);
    expect(contact.related_people).toEqual([
      { value: "Max Newman", type: "manager" },
      { value: "Joan Clarke", type: "assistant" },
    ]);
    expect(contact.groups).toEqual(["Colleagues", "Mathematicians"]);
    expect(contact.notes).toBe("Bletchley");
  });

  it("keeps rows that only have a name or only an email", () => {
    const csv = to_csv(GOOGLE_NEW_HEADERS, [
      GOOGLE_NEW_ROW.map((value, index) =>
        GOOGLE_NEW_HEADERS[index].startsWith("E-mail") ? "" : value,
      ),
      GOOGLE_NEW_HEADERS.map((header) =>
        header === "E-mail 1 - Value" ? "only@example.com" : "",
      ),
      GOOGLE_NEW_HEADERS.map(() => ""),
    ]);
    const contacts = parse_csv(csv, auto_map_csv_headers(GOOGLE_NEW_HEADERS));

    expect(contacts).toHaveLength(2);
    expect(contacts[0].first_name).toBe("Grace");
    expect(contacts[1].emails).toEqual(["only@example.com"]);
  });

  it("splits a full name when no first or last column is present", () => {
    const csv = to_csv(
      ["Name", "Email", "Mobile Phone"],
      [["Jean Bartik Jennings", "jean@example.com", "555 0101"]],
    );
    const [contact] = parse_csv(
      csv,
      auto_map_csv_headers(["Name", "Email", "Mobile Phone"]),
    );

    expect(contact.first_name).toBe("Jean Bartik");
    expect(contact.last_name).toBe("Jennings");
    expect(contact.phone_entries).toEqual([
      { value: "555 0101", type: "mobile" },
    ]);
  });

  it("honors a manual remap of a column", () => {
    const headers = ["Name", "Email", "Extra"];
    const csv = to_csv(headers, [["Ann", "ann@example.com", "VIP client"]]);
    const mapping = auto_map_csv_headers(headers);

    mapping["Extra"] = "notes";

    const [contact] = parse_csv(csv, mapping);

    expect(contact.notes).toBe("VIP client");
  });
});
