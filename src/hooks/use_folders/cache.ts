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

import { DecryptedFolder } from "./tree";

export const cached_folders: { data: DecryptedFolder[]; total: number } = {
  data: [],
  total: 0,
};

export const FOLDER_SYNC_CHANNEL = "aster-folders-sync";

export let folder_broadcast_channel: BroadcastChannel | null = null;

export function get_folder_broadcast_channel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === "undefined") return null;
  if (!folder_broadcast_channel) {
    folder_broadcast_channel = new BroadcastChannel(FOLDER_SYNC_CHANNEL);
  }

  return folder_broadcast_channel;
}

export function broadcast_folders_changed(): void {
  get_folder_broadcast_channel()?.postMessage({ type: "folders_changed" });
}

export function get_cached_folders(): DecryptedFolder[] {
  return cached_folders.data;
}

export function clear_folders_cache(): void {
  cached_folders.data = [];
  cached_folders.total = 0;
}

export function get_protected_folder_tokens(): Set<string> {
  const tokens = new Set<string>();

  for (const folder of cached_folders.data) {
    if (folder.is_password_protected && folder.password_set) {
      tokens.add(folder.folder_token);
    }
  }

  return tokens;
}

export function filter_protected_folder_emails<
  T extends { folders?: { folder_token: string }[] },
>(emails: T[]): T[] {
  const tokens = get_protected_folder_tokens();

  if (tokens.size === 0) return emails;

  return emails.filter((email) => {
    if (!email.folders || email.folders.length === 0) return true;

    return !email.folders.some((f) => tokens.has(f.folder_token));
  });
}

export function has_protected_folder_label(
  labels?: { token: string }[],
): boolean {
  if (!labels || labels.length === 0) return false;

  const tokens = get_protected_folder_tokens();

  if (tokens.size === 0) return false;

  return labels.some((l) => tokens.has(l.token));
}

export interface DeleteFolderOutcome {
  success: boolean;
  purged_items?: number;
  error?: string;
}

