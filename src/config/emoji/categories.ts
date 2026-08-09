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
import type { EmojiCategory } from "./types";
import { smileys } from "./smileys";
import { gestures } from "./gestures";
import { animals } from "./animals";
import { food } from "./food";
import { travel } from "./travel";
import { objects } from "./objects";
import { symbols } from "./symbols";
import { activities } from "./activities";
import { flags } from "./flags";

export const emoji_categories: Record<string, EmojiCategory> = {
  smileys,
  gestures,
  animals,
  food,
  travel,
  objects,
  symbols,
  activities,
  flags,
};
