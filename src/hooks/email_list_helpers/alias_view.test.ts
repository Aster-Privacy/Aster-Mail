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
  alias_address_of,
  alias_direction_of,
  build_alias_view,
  parse_alias_direction,
  parse_alias_view,
} from "./alias_view";

describe("alias_view", () => {
  it("omits the suffix for the default direction", () => {
    expect(build_alias_view("me@aster.cx")).toBe("alias-me@aster.cx");
    expect(build_alias_view("me@aster.cx", "all")).toBe("alias-me@aster.cx");
  });

  it("appends the suffix for the other directions", () => {
    expect(build_alias_view("me@aster.cx", "sent")).toBe(
      "alias-me@aster.cx|sent",
    );
    expect(build_alias_view("me@aster.cx", "received")).toBe(
      "alias-me@aster.cx|received",
    );
  });

  it("round trips the address and direction", () => {
    expect(parse_alias_view("alias-me@aster.cx|sent")).toEqual({
      address: "me@aster.cx",
      direction: "sent",
    });
    expect(parse_alias_view("alias-me@aster.cx")).toEqual({
      address: "me@aster.cx",
      direction: "all",
    });
  });

  it("treats an unknown suffix as part of the address", () => {
    expect(alias_address_of("alias-me@aster.cx|bogus")).toBe(
      "me@aster.cx|bogus",
    );
    expect(alias_direction_of("alias-me@aster.cx|bogus")).toBe("all");
  });

  it("ignores views that are not alias views", () => {
    expect(parse_alias_view("inbox")).toBeNull();
    expect(alias_address_of("folder-abc")).toBeNull();
  });

  it("falls back to the default for an unknown query value", () => {
    expect(parse_alias_direction("sent")).toBe("sent");
    expect(parse_alias_direction(null)).toBe("all");
    expect(parse_alias_direction("nonsense")).toBe("all");
  });
});
