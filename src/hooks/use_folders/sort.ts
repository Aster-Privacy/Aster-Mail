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

import type { DecryptedFolder, FolderTreeNode } from "./tree";

import {
  build_folder_tree,
  compare_sibling_folders,
  get_sibling_folders,
} from "./tree";

export interface FolderOrderEntry {
  id: string;
  sort_order: number;
}

const name_collator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});

function compare_names(a: DecryptedFolder, b: DecryptedFolder): number {
  return name_collator.compare(a.name.trim(), b.name.trim());
}

export function compare_folders_a_z(
  a: DecryptedFolder,
  b: DecryptedFolder,
): number {
  return (
    compare_names(a, b) ||
    (a.created_at || "").localeCompare(b.created_at || "") ||
    (a.folder_token || "").localeCompare(b.folder_token || "")
  );
}

export function is_sorted_a_z(ordered: DecryptedFolder[]): boolean {
  for (let i = 1; i < ordered.length; i++) {
    if (compare_names(ordered[i - 1], ordered[i]) > 0) return false;
  }

  return true;
}

function renumber(ordered: DecryptedFolder[]): FolderOrderEntry[] {
  const entries: FolderOrderEntry[] = [];

  ordered.forEach((folder, index) => {
    if (folder.sort_order !== index) {
      entries.push({ id: folder.id, sort_order: index });
    }
  });

  return entries;
}

function walk_sibling_groups(
  nodes: FolderTreeNode[],
  visit: (group: FolderTreeNode[]) => void,
): void {
  if (nodes.length === 0) return;
  visit(nodes);
  for (const node of nodes) walk_sibling_groups(node.children, visit);
}

export function is_folder_tree_sorted_a_z(folders: DecryptedFolder[]): boolean {
  let sorted = true;

  walk_sibling_groups(build_folder_tree(folders), (group) => {
    if (!is_sorted_a_z(group.map((node) => node.folder))) sorted = false;
  });

  return sorted;
}

export function sort_folder_tree_a_z(
  folders: DecryptedFolder[],
): FolderOrderEntry[] {
  const entries: FolderOrderEntry[] = [];

  walk_sibling_groups(build_folder_tree(folders), (group) => {
    const ordered = group.map((node) => node.folder).sort(compare_folders_a_z);

    entries.push(...renumber(ordered));
  });

  return entries;
}

export function place_folder_among_siblings(
  siblings: DecryptedFolder[],
  folder: DecryptedFolder,
): FolderOrderEntry[] {
  const others = siblings.filter((f) => f.id !== folder.id);
  const placed = { ...folder, sort_order: -1 };

  if (!is_sorted_a_z(others)) {
    return renumber([...others, placed]);
  }

  const index = others.findIndex((f) => compare_folders_a_z(placed, f) < 0);

  return renumber(
    index < 0
      ? [...others, placed]
      : [...others.slice(0, index), placed, ...others.slice(index)],
  );
}

export function resort_after_rename(
  folders: DecryptedFolder[],
  folder_id: string,
  new_name: string,
): FolderOrderEntry[] {
  const siblings = get_sibling_folders(folders, folder_id);

  if (siblings.length < 2 || !is_sorted_a_z(siblings)) return [];

  const renamed = siblings.map((f) =>
    f.id === folder_id ? { ...f, name: new_name } : f,
  );

  return renumber([...renamed].sort(compare_folders_a_z));
}

export function get_child_folders(
  folders: DecryptedFolder[],
  parent_token: string | undefined,
): DecryptedFolder[] {
  const non_system = folders.filter((f) => !f.is_system);
  const token_set = new Set(non_system.map((f) => f.folder_token));
  const parent =
    parent_token && token_set.has(parent_token) ? parent_token : undefined;

  return non_system
    .filter(
      (f) =>
        (f.parent_token && token_set.has(f.parent_token)
          ? f.parent_token
          : undefined) === parent,
    )
    .sort(compare_sibling_folders);
}

export function append_sort_order(siblings: DecryptedFolder[]): number {
  return siblings.reduce((max, f) => Math.max(max, f.sort_order + 1), 0);
}
