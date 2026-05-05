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
const hint_map = new Map<string, string[]>();

export function set_recipient_hint(email_id: string, addresses: string[]): void {
  if (addresses.length > 0) {
    hint_map.set(email_id, addresses);
  }
}

export function get_recipient_hint(email_id: string | null | undefined): string[] {
  if (!email_id) return [];
  return hint_map.get(email_id) || [];
}
