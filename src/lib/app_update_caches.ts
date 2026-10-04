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
export const TRANSLATION_MODEL_CACHE = "aster-translation-models-v1";

const KEPT_ACROSS_UPDATES: ReadonlySet<string> = new Set([
  TRANSLATION_MODEL_CACHE,
]);

export function kept_across_updates(cache_name: string): boolean {
  return KEPT_ACROSS_UPDATES.has(cache_name);
}
