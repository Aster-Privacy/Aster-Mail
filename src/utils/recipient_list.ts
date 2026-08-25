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
const SEPARATORS = new Set([",", ";", "\n", "\r", "\t"]);

const BARE_EMAIL_PATTERN = /^[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;"]+$/;

function split_space_separated(part: string): string[] {
  if (/["<>]/.test(part)) return [part];

  const tokens = part.split(/\s+/).filter(Boolean);

  if (tokens.length < 2) return [part];
  if (!tokens.every((token) => BARE_EMAIL_PATTERN.test(token))) return [part];

  return tokens;
}

export function split_recipient_list(text: string): string[] {
  const parts: string[] = [];
  let current = "";
  let in_quotes = false;
  let in_angles = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (char === "\\" && in_quotes && index + 1 < text.length) {
      current += char + text[index + 1];
      index += 1;
      continue;
    }

    if (char === '"' && !in_angles) {
      in_quotes = !in_quotes;
      current += char;
      continue;
    }

    if (char === "<" && !in_quotes) {
      in_angles = true;
      current += char;
      continue;
    }

    if (char === ">" && !in_quotes) {
      in_angles = false;
      current += char;
      continue;
    }

    if (SEPARATORS.has(char) && !in_quotes && !in_angles) {
      const trimmed = current.trim();

      if (trimmed) parts.push(trimmed);
      current = "";
      continue;
    }

    current += char;
  }

  const trimmed = current.trim();

  if (trimmed) parts.push(trimmed);

  return parts.flatMap(split_space_separated);
}
