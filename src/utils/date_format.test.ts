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
import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";

import { format_date_short } from "./date_format";

const sample = new Date(2026, 6, 5);
const store = new Map<string, string>();

beforeAll(() => {
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
    clear: () => store.clear(),
  });
});

afterEach(() => {
  store.clear();
});

describe("format_date_short", () => {
  it("renders numeric ISO order for the YYYY-MM-DD preference", () => {
    expect(
      format_date_short(sample, {
        date_format: "YYYY-MM-DD",
        time_format: "24h",
      }),
    ).toBe("07-05");
  });

  it("puts the day first for the DD/MM/YYYY preference", () => {
    const out = format_date_short(sample, {
      date_format: "DD/MM/YYYY",
      time_format: "24h",
    });

    expect(out.startsWith("5 ")).toBe(true);
  });

  it("localizes the month name to the active app language", () => {
    localStorage.setItem("astermail_language", "es");
    const es = format_date_short(sample, {
      date_format: "MM/DD/YYYY",
      time_format: "24h",
    });

    localStorage.setItem("astermail_language", "en");
    const en = format_date_short(sample, {
      date_format: "MM/DD/YYYY",
      time_format: "24h",
    });

    expect(es).not.toBe(en);
    expect(es.toLowerCase()).toContain("jul");
  });
});
