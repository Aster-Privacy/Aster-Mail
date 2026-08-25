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

import { DeleteFolderOutcome } from "./cache";
import { DecryptedFolder, FolderCounts, FoldersState } from "./tree";

import {
  type ListFoldersParams,
  type DeleteFolderRequest,
} from "@/services/api/folders";

export interface UseFoldersReturn {
  state: FoldersState;
  counts: FolderCounts;
  unread_counts: FolderCounts;
  fetch_folders: (params?: ListFoldersParams) => Promise<void>;
  fetch_counts: () => Promise<void>;
  create_new_folder: (
    name: string,
    color?: string,
    parent_token?: string,
  ) => Promise<{
    folder: DecryptedFolder | null;
    error?: string;
    code?: string;
  }>;
  update_existing_folder: (
    folder_id: string,
    name?: string,
    color?: string,
    sort_order?: number,
    parent_token?: string,
  ) => Promise<boolean>;
  reorder_folders: (
    entries: { id: string; sort_order: number }[],
  ) => Promise<boolean>;
  delete_existing_folder: (
    folder_id: string,
    options?: DeleteFolderRequest,
  ) => Promise<DeleteFolderOutcome>;
  toggle_folder_lock: (
    folder_id: string,
    is_locked: boolean,
  ) => Promise<boolean>;
  add_folder_to_email: (
    email_id: string,
    folder_token: string,
  ) => Promise<boolean>;
  remove_folder_from_email: (
    email_id: string,
    folder_token: string,
  ) => Promise<boolean>;
  get_folder_by_token: (folder_token: string) => DecryptedFolder | undefined;
  get_folder_by_id: (folder_id: string) => DecryptedFolder | undefined;
  refresh: () => Promise<void>;
}
