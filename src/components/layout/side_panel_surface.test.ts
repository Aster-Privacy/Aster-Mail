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
import { afterEach, describe, expect, it } from "vitest";

import calendar_panel_source from "./quick_calendar_panel.tsx?raw";
import contacts_panel_source from "./quick_contacts_panel.tsx?raw";
import security_panel_source from "./quick_security_panel.tsx?raw";
import desktop_calendar_source from "./desktop_calendar_panel.tsx?raw";

import {
  HOST_SURFACE_KEYS,
  read_host_appearance,
  read_host_surface,
} from "@/components/layout/use_host_appearance";

const PANELS: [string, string, string][] = [
  ["quick_calendar_panel", calendar_panel_source, "`quick_calendar_panel "],
  ["quick_contacts_panel", contacts_panel_source, "`quick_contacts_panel "],
  ["quick_security_panel", security_panel_source, "`quick_security_panel "],
  ["desktop_calendar_panel", desktop_calendar_source, "`quick_calendar_panel "],
];

const LITERAL_SURFACE_CLASS =
  /\b(?:bg|border|ring|divide|from|to|via)-(?:\[#[0-9a-f]{3,8}\]|\[rgba?\(|(?:neutral|zinc|gray|slate|stone)-\d{2,3}\b|black\b|white\b)/i;
const LITERAL_GREY = /#(?:1a1a1a|1f1f1f|1e1e1e|121212|181818|2a2a2a|0a0a0a)\b/i;

function root_class(source: string, marker: string): string {
  const start = source.indexOf(marker);

  expect(start).toBeGreaterThan(-1);

  return source.slice(start + 1, source.indexOf("`", start + 1));
}

describe("right rail side panel surfaces", () => {
  afterEach(() => {
    document.documentElement.removeAttribute("style");
    document.documentElement.className = "";
  });

  it.each(PANELS)(
    "%s paints its surface with the theme token",
    (_name, source, marker) => {
      expect(root_class(source, marker)).toContain("bg-surf-primary");
    },
  );

  it.each(PANELS)("%s uses no literal surface colors", (_name, source) => {
    expect(source).not.toMatch(LITERAL_SURFACE_CLASS);
    expect(source).not.toMatch(LITERAL_GREY);
  });

  it("sends a custom theme's surface colors to the calendar panel", () => {
    const root = document.documentElement;

    root.classList.add("dark");
    root.style.setProperty("--bg-primary", "#0B0B0B");
    root.style.setProperty("--bg-secondary", "#060606");
    root.style.setProperty("--border-primary", "#262626");
    root.style.setProperty("--text-primary", "#fafafa");

    expect(read_host_appearance(root)).toEqual({
      theme: "dark",
      palette: "default",
      accent: "",
      surface: {
        "--bg-primary": "#0b0b0b",
        "--bg-secondary": "#060606",
        "--border-primary": "#262626",
        "--text-primary": "#fafafa",
      },
    });
  });

  it("sends no surface for a built-in palette", () => {
    const root = document.documentElement;

    root.classList.add("dark", "theme-aster-blue");

    expect(read_host_surface(root)).toBeUndefined();
    expect(read_host_appearance(root)).toEqual({
      theme: "dark",
      palette: "aster-blue",
      accent: "",
    });
  });

  it("drops values that are not plain colors and keys outside the list", () => {
    const root = document.documentElement;

    root.style.setProperty("--bg-primary", "red; color: x");
    root.style.setProperty("--bg-card", "url(x)");
    root.style.setProperty("--not-a-surface", "#ffffff");

    expect(read_host_surface(root)).toBeUndefined();
    expect(HOST_SURFACE_KEYS).not.toContain("--not-a-surface");
  });
});
