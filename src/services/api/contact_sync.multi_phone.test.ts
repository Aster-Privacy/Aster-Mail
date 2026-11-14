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
  auto_map_csv_headers,
  parse_csv,
  parse_vcard,
} from "./contact_sync";

function csv_numbers(csv: string): string[] {
  const header_line = csv.split("\n")[0];
  const headers = header_line.split(",");
  const [contact] = parse_csv(csv, auto_map_csv_headers(headers));

  return (contact.phone_entries ?? []).map((entry) => entry.value);
}

function vcard_numbers(card: string): string[] {
  const [contact] = parse_vcard(card);

  return (contact.phone_entries ?? []).map((entry) => entry.value);
}

describe("contact import keeps every phone number", () => {
  it("google csv label/value pairs", () => {
    expect(
      csv_numbers(
        "First Name,Phone 1 - Label,Phone 1 - Value,Phone 2 - Label,Phone 2 - Value,Phone 3 - Label,Phone 3 - Value\nAna,Mobile,+1 555 0101,Work,+1 555 0102,Home,+1 555 0103",
      ),
    ).toEqual(["+1 555 0101", "+1 555 0102", "+1 555 0103"]);
  });

  it("google csv joined cell", () => {
    expect(
      csv_numbers(
        "First Name,Phone 1 - Type,Phone 1 - Value\nAna,* Mobile,+1 555 0101 ::: +1 555 0102",
      ),
    ).toEqual(["+1 555 0101", "+1 555 0102"]);
  });

  it("outlook csv", () => {
    expect(
      csv_numbers(
        "First Name,Business Phone,Business Phone 2,Home Phone,Home Phone 2,Mobile Phone,Pager,Other Phone,Business Fax\nAna,1,2,3,4,5,6,7,8",
      ),
    ).toEqual(["1", "2", "3", "4", "5", "6", "7", "8"]);
  });

  it("thunderbird csv", () => {
    expect(
      csv_numbers(
        "First Name,Work Phone,Home Phone,Fax Number,Pager Number,Mobile Number\nAna,1,2,3,4,5",
      ),
    ).toEqual(["1", "2", "3", "4", "5"]);
  });

  it("generic numbered csv", () => {
    expect(
      csv_numbers("First Name,Phone,Phone 2,Phone 3\nAna,1,2,3"),
    ).toEqual(["1", "2", "3"]);
  });

  it("generic labeled csv", () => {
    expect(
      csv_numbers(
        "Name,Mobile,Work,Home,Work Number,Home Number,Other Number\nAna,1,2,3,4,5,6",
      ),
    ).toEqual(["1", "4", "5", "6"]);
  });

  it("apple vcard grouped tels", () => {
    expect(
      vcard_numbers(
        [
          "BEGIN:VCARD",
          "VERSION:3.0",
          "FN:Ana",
          "item1.TEL;type=CELL;type=VOICE;type=pref:+1 555 0101",
          "item2.TEL;type=WORK;type=VOICE:+1 555 0102",
          "item3.TEL:+1 555 0103",
          "item3.X-ABLabel:_$!<Other>!$_",
          "END:VCARD",
        ].join("\r\n"),
      ),
    ).toEqual(["+1 555 0101", "+1 555 0102", "+1 555 0103"]);
  });

  it("vcard 4 uri tels", () => {
    expect(
      vcard_numbers(
        [
          "BEGIN:VCARD",
          "VERSION:4.0",
          "FN:Ana",
          'TEL;VALUE=uri;TYPE="voice,cell":tel:+1-555-0101',
          "TEL;VALUE=uri;TYPE=work:tel:+1-555-0102",
          "END:VCARD",
        ].join("\r\n"),
      ),
    ).toEqual(["+1-555-0101", "+1-555-0102"]);
  });

  it("vcard 2.1 bare type params", () => {
    expect(
      vcard_numbers(
        [
          "BEGIN:VCARD",
          "VERSION:2.1",
          "N:;Ana;;;",
          "TEL;CELL:+1 555 0101",
          "TEL;WORK;VOICE:+1 555 0102",
          "TEL;HOME:+1 555 0103",
          "END:VCARD",
        ].join("\r\n"),
      ),
    ).toEqual(["+1 555 0101", "+1 555 0102", "+1 555 0103"]);
  });
});
