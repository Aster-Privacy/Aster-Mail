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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  read_rail_contacts_open,
  write_rail_contacts_open,
} from "@/lib/rail_contacts_open";

describe("rail contacts open state", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("starts open when the device has no stored choice", () => {
    expect(read_rail_contacts_open()).toBe(true);
  });

  it("remembers that the panel was closed", () => {
    write_rail_contacts_open(false);

    expect(read_rail_contacts_open()).toBe(false);
  });

  it("remembers that the panel was opened again", () => {
    write_rail_contacts_open(false);
    write_rail_contacts_open(true);

    expect(read_rail_contacts_open()).toBe(true);
  });

  it("stays open when storage is unavailable", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
    });

    expect(() => write_rail_contacts_open(false)).not.toThrow();
    expect(read_rail_contacts_open()).toBe(true);
  });
});
