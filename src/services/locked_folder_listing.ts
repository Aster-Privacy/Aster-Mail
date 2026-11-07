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
export interface LockedFolderRow {
  id: string;
  item_type?: string;
  encrypted_envelope?: string;
  envelope_nonce?: string;
}

type ListingListener = (folder_token: string, rows: LockedFolderRow[]) => void;

let listener: ListingListener | null = null;

export function on_locked_folder_listing(next: ListingListener): () => void {
  listener = next;

  return () => {
    if (listener === next) listener = null;
  };
}

export function note_locked_folder_listing(
  folder_token: string,
  rows: LockedFolderRow[],
): void {
  if (!listener || !folder_token || rows.length === 0) return;

  try {
    listener(folder_token, rows);
  } catch {
    return;
  }
}
