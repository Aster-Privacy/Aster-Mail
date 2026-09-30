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
  AVATAR_COLORS,
  get_avatar_color,
  get_avatar_color_index,
  get_avatar_key,
  get_contrast_text,
} from "./avatar_color";

import { PROFILE_COLORS } from "@/constants/profile";

describe("get_contrast_text", () => {
  it("returns white initials on every pickable profile color", () => {
    for (const color of PROFILE_COLORS) {
      expect(get_contrast_text(color)).toBe("#ffffff");
    }
  });

  it("returns dark text on a light background", () => {
    expect(get_contrast_text("#ffffff")).toBe("#111827");
    expect(get_contrast_text("#fff")).toBe("#111827");
    expect(get_contrast_text("#fde047")).toBe("#111827");
  });

  it("returns white text on a dark background", () => {
    expect(get_contrast_text("#000000")).toBe("#ffffff");
    expect(get_contrast_text("#1e3a5f")).toBe("#ffffff");
  });

  it("falls back to white for malformed input", () => {
    expect(get_contrast_text("")).toBe("#ffffff");
    expect(get_contrast_text("#zzzzzz")).toBe("#ffffff");
    expect(get_contrast_text("nonsense")).toBe("#ffffff");
  });
});

describe("get_avatar_color", () => {
  it("is deterministic for the same identifier", () => {
    expect(get_avatar_color("alice@example.com")).toBe(
      get_avatar_color("alice@example.com"),
    );
  });

  it("always returns a 6-digit hex color", () => {
    for (const id of ["a", "bob@aster.cx", "李雷", "🎉", ""]) {
      expect(get_avatar_color(id)).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});

const GOLDEN_COLORS: [string, number, number, string, string][] = [
  ["", 0, 0, "#1e88e5", "#ffffff"],
  ["?", 63, 15, "#ff6f00", "#ffffff"],
  [" ", 32, 0, "#1e88e5", "#ffffff"],
  ["a", 97, 1, "#e53935", "#ffffff"],
  ["A", 65, 1, "#e53935", "#ffffff"],
  ["z", 122, 10, "#3949ab", "#ffffff"],
  ["0", 48, 0, "#1e88e5", "#ffffff"],
  ["12345", 46792755, 3, "#fb8c00", "#ffffff"],
  ["alice@example.com", 2145772861, 13, "#039be5", "#ffffff"],
  ["Alice@Example.com", -837563139, 3, "#fb8c00", "#ffffff"],
  ["ALICE@EXAMPLE.COM", 1900625117, 13, "#039be5", "#ffffff"],
  [" alice@example.com ", 841153187, 3, "#fb8c00", "#ffffff"],
  ["alice@example.com\u{a}", 2094449261, 13, "#039be5", "#ffffff"],
  ["\u{9}alice@astermail.org", -289676941, 13, "#039be5", "#ffffff"],
  ["bob@astermail.org", 1066401425, 1, "#e53935", "#ffffff"],
  ["qa@astermail.org", -942582868, 4, "#8e24aa", "#ffffff"],
  ["zoe@example.com", 1408675469, 13, "#039be5", "#ffffff"],
  ["sher@aster.cx", -930719534, 14, "#7cb342", "#ffffff"],
  ["noreply@astermail.org", 321799077, 5, "#d81b60", "#ffffff"],
  [
    "john.doe+newsletter@sub.example.co.uk",
    -1272308205,
    13,
    "#039be5",
    "#ffffff",
  ],
  ["user_name-99@domain.io", -1834786306, 2, "#43a047", "#ffffff"],
  ["Maya Chen", -1658687022, 14, "#7cb342", "#ffffff"],
  ["maya chen", 633265618, 2, "#43a047", "#ffffff"],
  ["Mary Jane Watson", -1377707019, 11, "#c0ca33", "#ffffff"],
  ["\u{674e}\u{96f7}", 858473, 9, "#00897b", "#ffffff"],
  [
    "\u{674e}\u{96f7}@\u{4f8b}\u{5b50}.\u{4e2d}\u{56fd}",
    674168386,
    2,
    "#43a047",
    "#ffffff",
  ],
  ["Jos\u{e9} \u{c1}lvarez", 343570700, 12, "#6d4c41", "#ffffff"],
  ["Jose\u{301}", 71761770, 10, "#3949ab", "#ffffff"],
  ["\u{d8}degaard", 35618688, 0, "#1e88e5", "#ffffff"],
  ["\u{395}\u{3bb}\u{3ad}\u{3bd}\u{3b7}", 876254081, 1, "#e53935", "#ffffff"],
  ["\u{39f}\u{394}\u{39f}\u{3a3}", 28526201, 9, "#00897b", "#ffffff"],
  ["\u{130}stanbul", -363956677, 5, "#d81b60", "#ffffff"],
  ["Stra\u{df}e", -1808122922, 10, "#3949ab", "#ffffff"],
  [
    "\u{418}\u{432}\u{430}\u{43d} \u{41f}\u{435}\u{442}\u{440}\u{43e}\u{432}",
    1788695809,
    1,
    "#e53935",
    "#ffffff",
  ],
  ["\u{645}\u{62d}\u{645}\u{62f}", 49385234, 2, "#43a047", "#ffffff"],
  ["\u{5e9}\u{5dc}\u{5d5}\u{5dd}", 46563067, 11, "#c0ca33", "#ffffff"],
  ["\u{1f389}", 1773261, 13, "#039be5", "#ffffff"],
  [
    "\u{1f469}\u{200d}\u{1f469}\u{200d}\u{1f467}\u{200d}\u{1f466} family",
    -54225448,
    8,
    "#f4511e",
    "#ffffff",
  ],
  ["\u{1f1ef}\u{1f1f5}", 1705482668, 12, "#6d4c41", "#ffffff"],
  ["a\u{0}b", 93315, 3, "#fb8c00", "#ffffff"],
  ["\u{200b}zero@width.com", 311888524, 12, "#6d4c41", "#ffffff"],
  ["\u{feff}bom@example.com", -974377058, 2, "#43a047", "#ffffff"],
  ["tab\u{9}inside", 955343888, 0, "#1e88e5", "#ffffff"],
  ["polygenelubricants", -2147483648, 0, "#1e88e5", "#ffffff"],
  ["GydZG_", -2147483648, 0, "#1e88e5", "#ffffff"],
  ["DESIGNING WORKHOUSES", -2147483648, 0, "#1e88e5", "#ffffff"],
  ["x".repeat(1000), -1715418112, 0, "#1e88e5", "#ffffff"],
  ["abcdefghij".repeat(257), -28796507, 11, "#c0ca33", "#ffffff"],
  ["\u{1f600}".repeat(300), 268022404, 4, "#8e24aa", "#ffffff"],
  ["\u{e9}".repeat(4096), 2080964608, 0, "#1e88e5", "#ffffff"],
];

const GOLDEN_KEYS: [string, string, string][] = [
  ["alice@example.com", "Alice", "alice@example.com"],
  ["", "Alice", "Alice"],
  ["", "", "?"],
  [" ", "Alice", " "],
  ["Alice@Example.com", "", "Alice@Example.com"],
  ["", " ", " "],
  ["", "\u{674e}\u{96f7}", "\u{674e}\u{96f7}"],
  ["x@y.z", "\u{1f389}", "x@y.z"],
];

const GOLDEN_CONTRAST: [string, string][] = [
  ["#1e88e5", "#ffffff"],
  ["#e53935", "#ffffff"],
  ["#43a047", "#ffffff"],
  ["#fb8c00", "#ffffff"],
  ["#8e24aa", "#ffffff"],
  ["#d81b60", "#ffffff"],
  ["#00acc1", "#ffffff"],
  ["#5e35b1", "#ffffff"],
  ["#f4511e", "#ffffff"],
  ["#00897b", "#ffffff"],
  ["#3949ab", "#ffffff"],
  ["#c0ca33", "#ffffff"],
  ["#6d4c41", "#ffffff"],
  ["#039be5", "#ffffff"],
  ["#7cb342", "#ffffff"],
  ["#ff6f00", "#ffffff"],
  ["#3b82f6", "#ffffff"],
  ["#8b5cf6", "#ffffff"],
  ["#ec4899", "#ffffff"],
  ["#ef4444", "#ffffff"],
  ["#f97316", "#ffffff"],
  ["#22c55e", "#ffffff"],
  ["#14b8a6", "#ffffff"],
  ["#6b7280", "#ffffff"],
  ["#ffffff", "#111827"],
  ["#fff", "#111827"],
  ["#FFF", "#111827"],
  ["#000000", "#ffffff"],
  ["#000", "#ffffff"],
  ["#fde047", "#111827"],
  ["#FDE047", "#111827"],
  ["#1e3a5f", "#ffffff"],
  ["#e5e7eb", "#111827"],
  ["#9ca3af", "#ffffff"],
  ["3b82f6", "#ffffff"],
  ["fde047", "#111827"],
  ["#abc", "#ffffff"],
  ["#c8cb04", "#ffffff"],
  ["#75dc0e", "#111827"],
];

describe("avatar golden vectors", () => {
  it("uses the shared 16 color palette", () => {
    expect(AVATAR_COLORS).toHaveLength(16);
  });

  it.each(GOLDEN_COLORS)(
    "maps %j to its palette entry",
    (input, _hash, index, background, text) => {
      expect(get_avatar_color_index(input)).toBe(index);
      expect(get_avatar_color(input)).toBe(background);
      expect(get_contrast_text(get_avatar_color(input))).toBe(text);
    },
  );

  it.each(GOLDEN_KEYS)(
    "keys email %j and name %j as %j",
    (email, name, key) => {
      expect(get_avatar_key(email, name)).toBe(key);
    },
  );

  it.each(GOLDEN_CONTRAST)("picks text for %j as %j", (hex, text) => {
    expect(get_contrast_text(hex)).toBe(text);
  });
});
