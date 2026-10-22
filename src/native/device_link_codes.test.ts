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
import { beforeEach, describe, expect, it } from "vitest";

import {
  MIN_REUSE_MS,
  clear_link_codes,
  forget_link_code,
  load_link_codes,
  pick_reusable_code,
  remember_link_code,
} from "./device_link_codes";

const NOW = 1_000_000;

describe("device link codes", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns live codes for one device, newest first", () => {
    remember_link_code(
      { code: "A", device_key: "k", expires_at: NOW + 100 },
      NOW,
    );
    remember_link_code(
      { code: "B", device_key: "k", expires_at: NOW + 500 },
      NOW,
    );
    remember_link_code(
      { code: "C", device_key: "x", expires_at: NOW + 900 },
      NOW,
    );

    expect(load_link_codes("k", NOW).map((entry) => entry.code)).toEqual([
      "B",
      "A",
    ]);
  });

  it("prunes expired codes from storage", () => {
    remember_link_code(
      { code: "A", device_key: "k", expires_at: NOW + 10 },
      NOW,
    );
    remember_link_code(
      { code: "B", device_key: "k", expires_at: NOW + 500 },
      NOW,
    );

    expect(load_link_codes("k", NOW + 20).map((entry) => entry.code)).toEqual([
      "B",
    ]);
    expect(localStorage.getItem("aster_device_link_codes")).not.toContain(
      '"A"',
    );
  });

  it("keeps at most five codes", () => {
    for (let i = 0; i < 8; i++) {
      remember_link_code(
        { code: `C${i}`, device_key: "k", expires_at: NOW + 1000 + i },
        NOW,
      );
    }

    expect(load_link_codes("k", NOW)).toHaveLength(5);
    expect(load_link_codes("k", NOW)[0].code).toBe("C7");
  });

  it("reuses only a code with enough time left", () => {
    const short = {
      code: "S",
      device_key: "k",
      expires_at: NOW + MIN_REUSE_MS - 1,
    };
    const long = { code: "L", device_key: "k", expires_at: NOW + MIN_REUSE_MS };

    expect(pick_reusable_code([short], NOW)).toBeNull();
    expect(pick_reusable_code([short, long], NOW)?.code).toBe("L");
  });

  it("forgets one code and clears all codes", () => {
    remember_link_code(
      { code: "A", device_key: "k", expires_at: NOW + 500 },
      NOW,
    );
    remember_link_code(
      { code: "B", device_key: "k", expires_at: NOW + 600 },
      NOW,
    );
    forget_link_code("A");

    expect(load_link_codes("k", NOW).map((entry) => entry.code)).toEqual(["B"]);

    clear_link_codes();

    expect(localStorage.getItem("aster_device_link_codes")).toBeNull();
  });

  it("survives malformed storage", () => {
    localStorage.setItem("aster_device_link_codes", "{not json");

    expect(load_link_codes("k", NOW)).toEqual([]);

    localStorage.setItem(
      "aster_device_link_codes",
      JSON.stringify([
        { code: 1 },
        { code: "A", device_key: "k", expires_at: NOW + 5 },
      ]),
    );

    expect(load_link_codes("k", NOW).map((entry) => entry.code)).toEqual(["A"]);
  });
});
