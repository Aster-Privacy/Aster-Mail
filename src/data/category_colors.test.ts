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
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, it, expect } from "vitest";

import {
  CATEGORY_COLOR_LABEL_KEYS,
  CUSTOM_CATEGORY_COLOR_CHOICES,
  category_color_key,
  category_color_style,
  is_category_color,
} from "@/data/category_colors";
import { BUILTIN_CATEGORIES } from "@/data/category_catalog";
import { en } from "@/lib/i18n/translations/en";

const globals_css = readFileSync(
  resolve(process.cwd(), "src/styles/globals.css"),
  "utf8",
);

describe("category_colors", () => {
  it("gives every builtin category a color", () => {
    for (const cat of BUILTIN_CATEGORIES) {
      expect(is_category_color(category_color_key(cat.id))).toBe(true);
    }
  });

  it("keeps primary on the user accent so every theme stays coherent", () => {
    expect(category_color_key("primary")).toBe("accent");
  });

  it("gives distinct colors to the categories shown side by side", () => {
    const keys = BUILTIN_CATEGORIES.map((cat) => category_color_key(cat.id));

    expect(new Set(keys).size).toBe(keys.length);
  });

  it("honours an explicit custom color", () => {
    expect(category_color_key("custom:x", { color: "violet" })).toBe("violet");
  });

  it("ignores an unknown stored color and falls back deterministically", () => {
    const id = "custom:9f1c";
    const bogus = category_color_key(id, {
      color: "chartreuse" as never,
    });

    expect(is_category_color(bogus)).toBe(true);
    expect(bogus).toBe(category_color_key(id));
    expect(bogus).not.toBe("accent");
  });

  it("rejects non-color values", () => {
    expect(is_category_color(undefined)).toBe(false);
    expect(is_category_color(null)).toBe(false);
    expect(is_category_color(3)).toBe(false);
    expect(is_category_color("Blue")).toBe(false);
  });

  it("emits the three tokens the badge reads", () => {
    const style = category_color_style("green") as Record<string, string>;

    expect(style["--cat-fg"]).toBe("var(--cat-green-fg)");
    expect(style["--cat-soft"]).toBe("var(--cat-green-soft)");
    expect(style["--cat-border"]).toBe("var(--cat-green-border)");
  });

  it("defines every color token for light and again for dark", () => {
    for (const key of CUSTOM_CATEGORY_COLOR_CHOICES) {
      for (const slot of ["fg", "soft", "border"]) {
        const token = `--cat-${key}-${slot}:`;
        const declarations = globals_css.split(token).length - 1;

        expect(declarations, `${token} declared ${declarations} time(s)`)
          .toBeGreaterThanOrEqual(key === "accent" && slot === "fg" ? 1 : 2);
      }
    }
  });

  it("gives every swatch a distinct translated name", () => {
    const names = new Set<string>();

    for (const key of CUSTOM_CATEGORY_COLOR_CHOICES) {
      const label_key = CATEGORY_COLOR_LABEL_KEYS[key];
      const name = (en.settings as unknown as Record<string, string>)[
        label_key.replace("settings.", "")
      ];

      expect(name, `${label_key} has no english string`).toBeTruthy();
      names.add(name);
    }

    expect(names.size).toBe(CUSTOM_CATEGORY_COLOR_CHOICES.length);
  });

  it("keeps the badge readable in high contrast", () => {
    for (const key of CUSTOM_CATEGORY_COLOR_CHOICES) {
      if (key === "accent") continue;

      const light = globals_css.indexOf(
        `--cat-${key}-fg:`,
        globals_css.indexOf(".high-contrast {"),
      );

      expect(light, `--cat-${key}-fg missing a high-contrast value`)
        .toBeGreaterThan(0);
    }
  });
});
