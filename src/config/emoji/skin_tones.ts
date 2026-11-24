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
export type SkinTone =
  | "default"
  | "light"
  | "medium_light"
  | "medium"
  | "medium_dark"
  | "dark";

export const skin_tones: SkinTone[] = [
  "default",
  "light",
  "medium_light",
  "medium",
  "medium_dark",
  "dark",
];

export const skin_tone_modifiers: Record<SkinTone, string> = {
  default: "",
  light: "\u{1F3FB}",
  medium_light: "\u{1F3FC}",
  medium: "\u{1F3FD}",
  medium_dark: "\u{1F3FE}",
  dark: "\u{1F3FF}",
};

export const skin_tone_swatches: Record<SkinTone, string> = {
  default: "\u{270B}",
  light: "\u{270B}\u{1F3FB}",
  medium_light: "\u{270B}\u{1F3FC}",
  medium: "\u{270B}\u{1F3FD}",
  medium_dark: "\u{270B}\u{1F3FE}",
  dark: "\u{270B}\u{1F3FF}",
};

const MODIFIER_BASE_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x261d, 0x261d],
  [0x26f9, 0x26f9],
  [0x270a, 0x270d],
  [0x1f385, 0x1f385],
  [0x1f3c2, 0x1f3c4],
  [0x1f3c7, 0x1f3c7],
  [0x1f3ca, 0x1f3cc],
  [0x1f442, 0x1f443],
  [0x1f446, 0x1f450],
  [0x1f466, 0x1f469],
  [0x1f46b, 0x1f46e],
  [0x1f470, 0x1f478],
  [0x1f47c, 0x1f47c],
  [0x1f481, 0x1f483],
  [0x1f485, 0x1f487],
  [0x1f48f, 0x1f48f],
  [0x1f491, 0x1f491],
  [0x1f4aa, 0x1f4aa],
  [0x1f574, 0x1f575],
  [0x1f57a, 0x1f57a],
  [0x1f590, 0x1f590],
  [0x1f595, 0x1f596],
  [0x1f645, 0x1f647],
  [0x1f64b, 0x1f64f],
  [0x1f6a3, 0x1f6a3],
  [0x1f6b4, 0x1f6b6],
  [0x1f6c0, 0x1f6c0],
  [0x1f6cc, 0x1f6cc],
  [0x1f90c, 0x1f90c],
  [0x1f90f, 0x1f90f],
  [0x1f918, 0x1f91f],
  [0x1f926, 0x1f926],
  [0x1f930, 0x1f939],
  [0x1f93d, 0x1f93e],
  [0x1f977, 0x1f977],
  [0x1f9b5, 0x1f9b6],
  [0x1f9b8, 0x1f9b9],
  [0x1f9bb, 0x1f9bb],
  [0x1f9cd, 0x1f9cf],
  [0x1f9d1, 0x1f9dd],
  [0x1fac3, 0x1fac5],
  [0x1faf0, 0x1faf8],
];

const ZWJ = 0x200d;
const VARIATION_SELECTOR = 0xfe0f;
const HANDSHAKE = 0x1f91d;
const HEAVY_HEART = 0x2764;
const FIRST_MODIFIER = 0x1f3fb;
const LAST_MODIFIER = 0x1f3ff;

export function is_skin_tone(value: unknown): value is SkinTone {
  return typeof value === "string" && (skin_tones as string[]).includes(value);
}

export function normalize_skin_tone(value: unknown): SkinTone {
  return is_skin_tone(value) ? value : "default";
}

function is_modifier_base(code_point: number): boolean {
  return MODIFIER_BASE_RANGES.some(
    ([start, end]) => code_point >= start && code_point <= end,
  );
}

function is_modifier(code_point: number): boolean {
  return code_point >= FIRST_MODIFIER && code_point <= LAST_MODIFIER;
}

function split_segments(emoji: string): number[][] {
  const segments: number[][] = [[]];

  for (const char of emoji) {
    const code_point = char.codePointAt(0) ?? 0;

    if (code_point === ZWJ) {
      segments.push([]);
    } else {
      segments[segments.length - 1].push(code_point);
    }
  }

  return segments;
}

function tone_targets(segments: number[][]): number[] {
  const bases = segments
    .map((segment, index) => ({ index, first: segment[0] }))
    .filter(({ first }) => first !== undefined && is_modifier_base(first));

  if (segments.length === 1) {
    return bases.map(({ index }) => index);
  }

  const people = bases.filter(({ first }) => first !== HANDSHAKE);
  const pairs_people = segments.some(
    (segment) => segment[0] === HANDSHAKE || segment[0] === HEAVY_HEART,
  );

  if (people.length === 1) return [people[0].index];
  if (people.length === 2 && pairs_people) {
    return people.map(({ index }) => index);
  }

  return [];
}

export function is_tone_capable(emoji: string): boolean {
  if (!emoji) return false;
  const segments = split_segments(emoji);

  if (segments.some((segment) => segment.some(is_modifier))) return false;

  return tone_targets(segments).length > 0;
}

export function apply_skin_tone(emoji: string, tone: SkinTone): string {
  if (tone === "default" || !is_tone_capable(emoji)) return emoji;

  const modifier = skin_tone_modifiers[tone].codePointAt(0) ?? 0;
  const segments = split_segments(emoji);
  const targets = new Set(tone_targets(segments));
  const toned = segments.map((segment, index) => {
    if (!targets.has(index)) return segment;
    const rest = segment
      .slice(1)
      .filter((code_point, position) =>
        position === 0 ? code_point !== VARIATION_SELECTOR : true,
      );

    return [segment[0], modifier, ...rest];
  });

  return toned
    .map((segment) => String.fromCodePoint(...segment))
    .join(String.fromCodePoint(ZWJ));
}
