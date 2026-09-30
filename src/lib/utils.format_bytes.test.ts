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
import { describe, it, expect, afterEach } from "vitest";

import { format_bytes } from "@/lib/utils";
import { set_display_locale } from "@/utils/date_format";

afterEach(() => {
  set_display_locale(undefined);
});

describe("format_bytes", () => {
  it("formats sizes with the English decimal separator", () => {
    set_display_locale("en");

    expect(format_bytes(1536)).toBe("1.5 KB");
  });

  it("uses the comma decimal separator for German", () => {
    set_display_locale("de");

    expect(format_bytes(1536)).toBe("1,5 KB");
  });

  it("uses the comma decimal separator for French", () => {
    set_display_locale("fr");

    expect(format_bytes(2621440)).toBe("2,5 MB");
  });

  it("drops the fraction for whole byte counts", () => {
    set_display_locale("en");

    expect(format_bytes(512)).toBe("512 B");
  });

  it("rounds larger values to whole units", () => {
    set_display_locale("en");

    expect(format_bytes(1024 * 1024 * 25)).toBe("25 MB");
  });

  it("returns zero for non-positive input", () => {
    expect(format_bytes(0)).toBe("0 B");
    expect(format_bytes(Number.NaN)).toBe("0 B");
  });
});
