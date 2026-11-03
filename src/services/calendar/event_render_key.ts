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
const render_key_aliases = new Map<string, string>();

export function register_event_render_alias(
  server_id: string,
  local_id: string,
): void {
  if (server_id === local_id) {
    return;
  }

  render_key_aliases.set(
    server_id,
    render_key_aliases.get(local_id) ?? local_id,
  );
}

export function event_render_key(event_id: string): string {
  return render_key_aliases.get(event_id) ?? event_id;
}

export function reset_event_render_aliases(): void {
  render_key_aliases.clear();
}
