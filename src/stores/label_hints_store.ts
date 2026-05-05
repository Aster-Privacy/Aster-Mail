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
export interface LabelHint {
  token: string;
  name: string;
  color?: string;
  icon?: string;
  show_icon?: boolean;
}

const hint_map = new Map<string, LabelHint[]>();

export function set_label_hints(email_id: string, hints: LabelHint[]): void {
  if (hints.length > 0) {
    hint_map.set(email_id, hints);
  }
}

export function get_label_hints(email_id: string | null | undefined): LabelHint[] {
  if (!email_id) return [];
  return hint_map.get(email_id) || [];
}
