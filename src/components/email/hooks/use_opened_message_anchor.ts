//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
export const VISIBLE_TAIL_COUNT = 2;

export function opened_message_is_collapsed(
  display_ids: string[],
  opened_id: string,
): boolean {
  if (display_ids.length <= VISIBLE_TAIL_COUNT + 2) return false;

  const index = display_ids.indexOf(opened_id);

  return index > 0 && index < display_ids.length - VISIBLE_TAIL_COUNT;
}
