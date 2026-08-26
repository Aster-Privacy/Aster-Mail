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
export {
  broadcast_folders_changed,
  clear_folders_cache,
  filter_protected_folder_emails,
  get_cached_folders,
  get_protected_folder_tokens,
  has_protected_folder_label,
} from "./cache";
export type { DeleteFolderOutcome } from "./cache";
export { use_folders } from "./hook";
export {
  build_folder_tree,
  build_tree_guides,
  compare_sibling_folders,
  flatten_folder_tree,
  flatten_visible_tree,
  get_sibling_folders,
  is_system_folder_type,
  partition_folders_by_parent,
} from "./tree";
export type { DecryptedFolder, FolderTreeGuides, FolderTreeNode } from "./tree";
export { encrypt_folder_field, generate_folder_token } from "./hook";
export type { FolderCounts, FoldersState } from "./hook";
