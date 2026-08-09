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
export interface FolderUnlockRecord {
  folder_id: string;
  folder_token: string;
  unlock_token: string | null;
  unlock_expires_at: number | null;
}

const unlock_records = new Map<string, FolderUnlockRecord>();

function is_record_live(record: FolderUnlockRecord): boolean {
  if (record.unlock_expires_at === null) return true;

  return record.unlock_expires_at > Date.now();
}

export function parse_unlock_expiry(value: string | undefined): number | null {
  if (!value) return null;

  const parsed = Date.parse(value);

  return Number.isFinite(parsed) ? parsed : null;
}

export function set_folder_unlock_record(record: FolderUnlockRecord): void {
  unlock_records.set(record.folder_id, record);
}

export function clear_folder_unlock_record(folder_id: string): void {
  unlock_records.delete(folder_id);
}

export function clear_all_folder_unlock_records(): void {
  unlock_records.clear();
}

export function get_folder_unlock_record(
  folder_id: string,
): FolderUnlockRecord | null {
  const record = unlock_records.get(folder_id);

  if (!record) return null;

  if (!is_record_live(record)) {
    unlock_records.delete(folder_id);

    return null;
  }

  return record;
}

export function list_folder_unlock_records(): FolderUnlockRecord[] {
  const live: FolderUnlockRecord[] = [];

  for (const record of [...unlock_records.values()]) {
    if (is_record_live(record)) {
      live.push(record);
    } else {
      unlock_records.delete(record.folder_id);
    }
  }

  return live;
}

export function has_folder_unlock_records(): boolean {
  return unlock_records.size > 0;
}

export function is_folder_unlock_live(folder_id: string): boolean {
  return get_folder_unlock_record(folder_id) !== null;
}

export function get_unlock_token_by_folder_id(
  folder_id: string,
): string | null {
  return get_folder_unlock_record(folder_id)?.unlock_token ?? null;
}

export function get_unlock_token(label_token: string): string | null {
  if (!label_token) return null;

  for (const record of list_folder_unlock_records()) {
    if (record.folder_token === label_token) {
      return record.unlock_token;
    }
  }

  return null;
}

export function get_unlocked_folder_tokens(): Set<string> {
  const tokens = new Set<string>();

  for (const record of list_folder_unlock_records()) {
    tokens.add(record.folder_token);
  }

  return tokens;
}

export function get_unlocked_folder_ids(): Set<string> {
  const ids = new Set<string>();

  for (const record of list_folder_unlock_records()) {
    ids.add(record.folder_id);
  }

  return ids;
}
