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
interface MenuReadItem {
  id: string;
  is_read: boolean;
}

export function resolve_menu_message<T extends MenuReadItem>(
  menu_message: T | null,
  messages: readonly T[],
  read_ids: ReadonlySet<string>,
): T | null {
  if (!menu_message) return null;
  const live =
    messages.find((message) => message.id === menu_message.id) ??
    menu_message;
  const is_read = live.is_read || read_ids.has(live.id);

  return live.is_read === is_read ? live : { ...live, is_read };
}
