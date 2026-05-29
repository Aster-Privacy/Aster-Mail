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
type SegmenterConstructor = new (
  locales?: string,
  options?: { granularity?: "grapheme" | "word" | "sentence" },
) => { segment: (input: string) => Iterable<{ segment: string }> };

export function get_active_locale(): string | undefined {
  if (typeof document === "undefined") return undefined;

  return document.documentElement.lang || undefined;
}

function to_graphemes(value: string, locale?: string): string[] {
  const segmenter_ctor = (
    Intl as unknown as { Segmenter?: SegmenterConstructor }
  ).Segmenter;

  if (typeof segmenter_ctor === "function") {
    const segmenter = new segmenter_ctor(locale, { granularity: "grapheme" });
    const out: string[] = [];

    for (const part of segmenter.segment(value)) {
      out.push(part.segment);
    }

    return out;
  }

  return Array.from(value);
}

function first_grapheme(value: string, locale?: string): string {
  const graphemes = to_graphemes(value, locale);

  return graphemes.length > 0 ? graphemes[0] : "";
}

export function get_initials(
  name?: string,
  email?: string,
  locale?: string,
): string {
  const from_name = (name || "").trim();

  if (from_name) {
    const words = from_name.split(/\s+/).filter(Boolean);

    if (words.length >= 2) {
      const first = first_grapheme(words[0], locale);
      const last = first_grapheme(words[words.length - 1], locale);

      return (first + last).toLocaleUpperCase(locale);
    }

    return first_grapheme(words[0], locale).toLocaleUpperCase(locale);
  }

  const local_part = (email || "").trim().split("@")[0];

  if (local_part) {
    return first_grapheme(local_part, locale).toLocaleUpperCase(locale);
  }

  return "?";
}
