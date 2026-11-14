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
import type {
  OAuthFolderInfo,
  OAuthFolderList,
} from "@/services/api/external_accounts/api";
import type { ExistingFolder } from "@/services/external_folder_mirror";

import {
  get_sync_settings,
  save_folder_mapping,
  update_sync_settings,
} from "@/services/api/external_accounts/api";
import {
  decode_modified_utf7,
  mirror_external_account_folders,
} from "@/services/external_folder_mirror";
import {
  is_system_folder,
  resolve_sync_since_date,
} from "@/components/settings/hooks/external_accounts_utils";

const SETUP_SYNC_FREQUENCY = "15m";
const SETUP_MAX_MESSAGES_PER_SYNC = 500;

export interface PickerFolder {
  name: string;
  label: string;
  is_inbox: boolean;
}

export type FolderSelectionOutcome =
  | { status: "ok"; failures: number }
  | { status: "cancelled" }
  | { status: "error" };

export interface FolderSelectionOptions {
  account_token: string;
  selected_folders: string[];
  import_existing: boolean;
  existing_folders: ExistingFolder[];
  listed?: OAuthFolderList;
  t?: Parameters<typeof mirror_external_account_folders>[2];
  is_cancelled?: () => boolean;
  now?: Date;
}

export function is_inbox_folder(name: string): boolean {
  return name.toUpperCase() === "INBOX";
}

function is_offered(folder: OAuthFolderInfo): boolean {
  if (folder.selectable !== undefined) return folder.selectable;

  return !folder.excluded || is_system_folder(folder.name);
}

function folder_label(folder: OAuthFolderInfo): string {
  const parts = folder.delimiter
    ? folder.name
        .split(folder.delimiter)
        .filter((part) => part.length > 0)
        .map(decode_modified_utf7)
    : [decode_modified_utf7(folder.name)];

  return parts.length > 0 ? parts.join(" / ") : folder.name;
}

export function picker_folders(folders: OAuthFolderInfo[]): PickerFolder[] {
  const seen = new Set<string>();
  const offered: PickerFolder[] = [];

  for (const folder of folders) {
    if (!is_offered(folder) || seen.has(folder.name)) continue;
    seen.add(folder.name);
    offered.push({
      name: folder.name,
      label: folder_label(folder),
      is_inbox: is_inbox_folder(folder.name),
    });
  }

  return offered.sort((a, b) => {
    if (a.is_inbox !== b.is_inbox) return a.is_inbox ? -1 : 1;

    return a.label.localeCompare(b.label);
  });
}

export function default_selected_folders(folders: PickerFolder[]): string[] {
  return folders.filter((folder) => folder.is_inbox).map((f) => f.name);
}

export async function apply_oauth_folder_selection(
  options: FolderSelectionOptions,
): Promise<FolderSelectionOutcome> {
  const is_cancelled = options.is_cancelled ?? (() => false);
  const selected_folders = Array.from(new Set(options.selected_folders));

  if (selected_folders.length === 0) return { status: "error" };

  const current = await get_sync_settings(options.account_token);
  const saved_settings = await update_sync_settings(options.account_token, {
    sync_frequency: current.data?.sync_frequency ?? SETUP_SYNC_FREQUENCY,
    max_messages_per_sync:
      current.data?.max_messages_per_sync ?? SETUP_MAX_MESSAGES_PER_SYNC,
    sync_folders: selected_folders,
    sync_since_date: resolve_sync_since_date({
      is_editing: false,
      import_existing: options.import_existing,
      current_since_date: null,
      now: options.now ?? new Date(),
    }),
  });

  if (saved_settings.error) return { status: "error" };
  if (is_cancelled()) return { status: "cancelled" };

  const outcome = await mirror_external_account_folders(
    options.account_token,
    options.existing_folders,
    options.t,
    is_cancelled,
    { selected_folders, listed: options.listed },
  );

  if (outcome.status === "no_vault") {
    const saved = await save_folder_mapping(
      options.account_token,
      {},
      {},
      selected_folders,
    );

    return saved.error ? { status: "error" } : { status: "ok", failures: 0 };
  }

  if (outcome.status === "ok") {
    return { status: "ok", failures: outcome.failures };
  }

  return outcome;
}
