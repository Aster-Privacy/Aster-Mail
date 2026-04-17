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
import type { SenderOption } from "@/hooks/use_sender_aliases";

interface GhostEntry {
  email: string;
  sender?: SenderOption;
}

const ghost_entries = new Map<string, GhostEntry>();

export function register_ghost_email(email: string, sender?: SenderOption) {
  const key = email.toLowerCase();
  const existing = ghost_entries.get(key);

  ghost_entries.set(key, {
    email: key,
    sender: sender ?? existing?.sender,
  });
}

export function is_ghost_email(email: string): boolean {
  return ghost_entries.has(email.toLowerCase());
}

export function get_ghost_sender(email: string): SenderOption | undefined {
  return ghost_entries.get(email.toLowerCase())?.sender;
}

export function clear_ghost_emails() {
  ghost_entries.clear();
}
