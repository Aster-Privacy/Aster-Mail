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
  default: "✋",
  light: "✋\u{1F3FB}",
  medium_light: "✋\u{1F3FC}",
  medium: "✋\u{1F3FD}",
  medium_dark: "✋\u{1F3FE}",
  dark: "✋\u{1F3FF}",
};

export const tone_capable_emoji: ReadonlySet<string> = new Set([
  "👋",
  "🤚",
  "🖐️",
  "✋",
  "🖖",
  "🫱",
  "🫲",
  "🫳",
  "🫴",
  "🫷",
  "🫸",
  "👌",
  "🤌",
  "🤏",
  "✌️",
  "🤞",
  "🫰",
  "🤟",
  "🤘",
  "🤙",
  "👈",
  "👉",
  "👆",
  "🖕",
  "👇",
  "☝️",
  "🫵",
  "👍",
  "👎",
  "✊",
  "👊",
  "🤛",
  "🤜",
  "👏",
  "🙌",
  "🫶",
  "👐",
  "🤲",
  "🙏",
  "✍️",
  "💅",
  "🤳",
  "💪",
  "👂",
  "🦻",
  "👃",
  "👶",
  "🧒",
  "👦",
  "👧",
  "🧑",
  "👱",
  "👨",
  "🧔",
  "👩",
  "🧓",
  "👴",
  "👵",
  "🙍",
  "🙎",
  "🙅",
  "🙆",
  "💁",
  "🙋",
  "🧏",
  "🙇",
  "🤦",
  "🤷",
  "👮",
  "🕵️",
  "💂",
  "🥷",
  "👷",
  "🫅",
  "🤴",
  "👸",
  "🧙",
  "🧚",
  "🧛",
  "🧜",
  "🧝",
  "💆",
  "💇",
  "🚶",
  "🧍",
  "🧎",
  "🏃",
  "💃",
  "🕺",
  "🧖",
  "🧗",
  "🤸",
  "🏌️",
  "🏋️",
  "🤽",
  "🤾",
  "🤺",
  "⛹️",
  "🏊",
  "🚣",
  "🧘",
  "🛀",
  "🛌",
]);

export function is_tone_capable(emoji: string): boolean {
  return tone_capable_emoji.has(emoji);
}

export function apply_skin_tone(emoji: string, tone: SkinTone): string {
  if (tone === "default" || !is_tone_capable(emoji)) return emoji;

  const modifier = skin_tone_modifiers[tone];
  const variation_selector = "️";

  if (emoji.endsWith(variation_selector)) {
    return emoji.slice(0, -variation_selector.length) + modifier;
  }

  return emoji + modifier;
}
