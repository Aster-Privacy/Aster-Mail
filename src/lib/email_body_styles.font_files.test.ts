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
  build_email_body_css,
  EMAIL_BODY_CSS,
  EMAIL_FONT_WEIGHTS,
} from "@/lib/email_body_styles";
import { EMAIL_INLINE_FONT_FACE_CSS } from "@/lib/email_inline_fonts";

function font_sources(css: string): string[] {
  return [...css.matchAll(/src: url\('([^']*)'\) format\('woff2'\)/g)].map(
    (match) => match[1],
  );
}

describe("email body font", () => {
  it("leaves the font out of the per message body css", () => {
    expect(font_sources(build_email_body_css())).toEqual([]);
  });

  it("points the shared body css at the app's font files", () => {
    expect(EMAIL_BODY_CSS.match(/data:font\//g) ?? []).toHaveLength(0);
    expect(font_sources(EMAIL_BODY_CSS)).toEqual(
      EMAIL_FONT_WEIGHTS.map(
        (weight) => `/fonts/GoogleSansFlex-${weight}.woff2`,
      ),
    );
  });

  it("inlines the same font files for frames that cannot load them", () => {
    const sources = font_sources(EMAIL_INLINE_FONT_FACE_CSS);

    expect(sources).toHaveLength(EMAIL_FONT_WEIGHTS.length);
    sources.forEach((source, index) => {
      const prefix = "data:font/woff2;base64,";

      expect(source.startsWith(prefix)).toBe(true);
      expect(
        Buffer.from(source.slice(prefix.length), "base64").equals(
          readFileSync(
            join(
              process.cwd(),
              "public/fonts",
              `GoogleSansFlex-${EMAIL_FONT_WEIGHTS[index]}.woff2`,
            ),
          ),
        ),
      ).toBe(true);
    });
  });
});
