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
import { join } from "node:path";

import { describe, it, expect } from "vitest";

import {
  EMAIL_BODY_CSS,
  EMAIL_FONT_WEIGHTS,
  build_email_font_face_css,
} from "@/lib/email_body_styles";
import { EMAIL_INLINE_FONT_FACE_CSS } from "@/lib/email_inline_fonts";
import {
  TEXT_SYMBOL_FONT_FILE,
  TEXT_SYMBOL_FONT_SRC,
} from "@/lib/text_symbol_font";

interface FontFace {
  family: string;
  weight: number;
  src: string;
  ranges: [number, number][];
}

const APP_FONTS_CSS = readFileSync(
  join(process.cwd(), "src/styles/fonts.css"),
  "utf8",
);

function parse_ranges(value: string | undefined): [number, number][] {
  if (!value) return [[0, 0x10ffff]];

  return value.split(",").map((part) => {
    const [start, end] = part.trim().replace(/^U\+/i, "").split("-");

    return [parseInt(start, 16), parseInt(end ?? start, 16)];
  });
}

function parse_faces(css: string): FontFace[] {
  return [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)].map((match) => {
    const body = match[1];
    const read = (name: string) =>
      body.match(new RegExp(`${name}:\s*([^;]+);`))?.[1].trim();

    return {
      family: (read("font-family") ?? "").replace(/'/g, ""),
      weight: Number(read("font-weight")),
      src: body.match(/src: url\('([^']*)'\)/)?.[1] ?? "",
      ranges: parse_ranges(read("unicode-range")),
    };
  });
}

function face_for(
  css: string,
  character: string,
  weight: number,
): FontFace | undefined {
  const code_point = character.codePointAt(0) ?? 0;

  return parse_faces(css)
    .filter(
      (face) => face.family === "Google Sans Flex" && face.weight === weight,
    )
    .reverse()
    .find((face) =>
      face.ranges.some(
        ([start, end]) => code_point >= start && code_point <= end,
      ),
    );
}

function is_symbol_face(face: FontFace | undefined): boolean {
  return (
    face?.src === TEXT_SYMBOL_FONT_SRC || face?.src === TEXT_SYMBOL_FONT_FILE
  );
}

const STYLESHEETS: [string, string][] = [
  ["email body css", EMAIL_BODY_CSS],
  ["inline email font css", EMAIL_INLINE_FONT_FACE_CSS],
  [
    "loaded email font css",
    build_email_font_face_css((weight) => `https://app.example/f-${weight}`),
  ],
  ["app font css", APP_FONTS_CSS],
];

describe("text symbols in the body font", () => {
  describe.each(STYLESHEETS)("%s", (_name, css) => {
    it.each(EMAIL_FONT_WEIGHTS)(
      "draws the copyright sign at text size at weight %i",
      (weight) => {
        expect(is_symbol_face(face_for(css, "©", weight))).toBe(true);
      },
    );

    it.each(["®", "™", "A", "x", "1"])(
      "keeps %s in the body font",
      (character) => {
        EMAIL_FONT_WEIGHTS.forEach((weight) => {
          const face = face_for(css, character, weight);

          expect(face).toBeDefined();
          expect(is_symbol_face(face)).toBe(false);
        });
      },
    );

    it.each(["©️", "®️", "™️"])(
      "leaves the emoji presentation selector in %s to the platform",
      (sequence) => {
        const selector = [...sequence][1];

        EMAIL_FONT_WEIGHTS.forEach((weight) => {
          expect(is_symbol_face(face_for(css, selector, weight))).toBe(false);
        });
      },
    );

    it.each(["\u{1f600}", "\u{1f44d}", "❤"])(
      "never routes the emoji %s to the symbol font",
      (emoji) => {
        EMAIL_FONT_WEIGHTS.forEach((weight) => {
          expect(is_symbol_face(face_for(css, emoji, weight))).toBe(false);
        });
      },
    );
  });

  it("inlines the same symbol font file the app serves", () => {
    const prefix = "data:font/woff2;base64,";

    expect(TEXT_SYMBOL_FONT_SRC.startsWith(prefix)).toBe(true);
    expect(
      Buffer.from(TEXT_SYMBOL_FONT_SRC.slice(prefix.length), "base64").equals(
        readFileSync(join(process.cwd(), "public", TEXT_SYMBOL_FONT_FILE)),
      ),
    ).toBe(true);
  });
});
