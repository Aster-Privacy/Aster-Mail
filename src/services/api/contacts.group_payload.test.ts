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
  build_group_payload,
  parse_group_payload,
} from "@/services/api/contacts";

describe("contact group payload", () => {
  it("keeps color and icon inside the encrypted blob", () => {
    const encoded = build_group_payload({
      name: "Work",
      color: "#ff0000",
      icon: "briefcase",
    });

    expect(JSON.parse(encoded)).toEqual({
      name: "Work",
      color: "#ff0000",
      icon: "briefcase",
    });
  });

  it("defaults the color when none is supplied", () => {
    expect(parse_group_payload(build_group_payload({ name: "Team" }))).toEqual({
      name: "Team",
      color: "#4f46e5",
      icon: undefined,
    });
  });

  it("reads a legacy plain name", () => {
    expect(parse_group_payload("Family")).toEqual({ name: "Family" });
  });

  it("falls back when the payload is malformed", () => {
    expect(parse_group_payload("{oops")).toEqual({ name: "{oops" });
    expect(parse_group_payload('{"color":"#000"}')).toEqual({
      name: '{"color":"#000"}',
    });
  });

  it("round-trips a name that looks like json", () => {
    const encoded = build_group_payload({ name: '{"name":"spoof"}' });

    expect(parse_group_payload(encoded).name).toBe('{"name":"spoof"}');
  });
});
