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

import { parse_bulk_contact_input } from "./contact_bulk_create_modal";

describe("parse_bulk_contact_input", () => {
  it("splits a name and an angle-bracket address", () => {
    expect(parse_bulk_contact_input("Ada Lovelace <ada@example.com>")).toEqual([
      { first_name: "Ada", last_name: "Lovelace", emails: ["ada@example.com"] },
    ]);
  });

  it("keeps a bare address without inventing a name", () => {
    expect(parse_bulk_contact_input("ada@example.com")).toEqual([
      { first_name: "", last_name: "", emails: ["ada@example.com"] },
    ]);
  });

  it("accepts a name on its own", () => {
    expect(parse_bulk_contact_input("Grace Hopper")).toEqual([
      { first_name: "Grace", last_name: "Hopper", emails: [] },
    ]);
  });

  it("treats every word but the last as the first name", () => {
    expect(parse_bulk_contact_input("Ada King Lovelace")).toEqual([
      { first_name: "Ada King", last_name: "Lovelace", emails: [] },
    ]);
  });

  it("drops blank lines, trailing commas and quotes", () => {
    expect(
      parse_bulk_contact_input('\n"Ada Lovelace" <ada@example.com>,\n\n'),
    ).toEqual([
      { first_name: "Ada", last_name: "Lovelace", emails: ["ada@example.com"] },
    ]);
  });

  it("skips duplicate addresses", () => {
    expect(
      parse_bulk_contact_input(
        "Ada <ada@example.com>\nAda Lovelace <ADA@example.com>",
      ),
    ).toHaveLength(1);
  });

  it("returns nothing for empty input", () => {
    expect(parse_bulk_contact_input("   \n  ")).toEqual([]);
  });
});
