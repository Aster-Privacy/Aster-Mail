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
export interface PendingSendStash {
  to_recipients: string[];
  cc_recipients: string[];
  bcc_recipients: string[];
  subject: string;
  message: string;
}

const stashes = new Map<string, PendingSendStash>();

export function set_pending_send_stash(
  key: string,
  stash: PendingSendStash,
): void {
  stashes.set(key, stash);
}

export function take_pending_send_stash(
  key: string,
): PendingSendStash | null {
  const stash = stashes.get(key) ?? null;

  stashes.delete(key);

  return stash;
}

export function has_pending_send_stash(key: string): boolean {
  return stashes.has(key);
}

export function clear_pending_send_stash(key: string): void {
  stashes.delete(key);
}
