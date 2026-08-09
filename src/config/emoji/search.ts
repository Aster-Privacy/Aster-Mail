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
import type { EmojiEntry } from "./types";
import { emoji_categories } from "./categories";

export function get_all_emojis(): EmojiEntry[] {
  return Object.values(emoji_categories).flatMap(
    (category) => category.entries,
  );
}

export function search_emojis(query: string): EmojiEntry[] {
  const lower = query.toLowerCase().trim();

  if (!lower) return [];

  return get_all_emojis().filter(
    (entry) =>
      entry.emoji.includes(lower) ||
      entry.keywords.some((kw) => kw.includes(lower)),
  );
}
