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

export interface DecryptedFolder {
  id: string;
  folder_token: string;
  name: string;
  color?: string;
  icon?: string;
  is_system: boolean;
  is_locked: boolean;
  folder_type: string;
  is_password_protected: boolean;
  password_set: boolean;
  sort_order: number;
  parent_token?: string;
  item_count?: number;
  unread_count?: number;
  created_at: string;
  updated_at: string;
}

export interface FoldersState {
  folders: DecryptedFolder[];
  is_loading: boolean;
  error: string | null;
  total: number;
}

export interface FolderCounts {
  [folder_token: string]: number;
}

export interface FolderTreeNode {
  folder: DecryptedFolder;
  children: FolderTreeNode[];
  depth: number;
}

export const SYSTEM_FOLDER_TYPES = new Set([
  "inbox",
  "sent",
  "drafts",
  "trash",
  "spam",
  "archive",
]);

export function is_system_folder_type(
  folder_type: string | undefined,
): boolean {
  return folder_type !== undefined && SYSTEM_FOLDER_TYPES.has(folder_type);
}

export function compare_sibling_folders(
  a: DecryptedFolder,
  b: DecryptedFolder,
): number {
  return (
    a.sort_order - b.sort_order ||
    (a.created_at || "").localeCompare(b.created_at || "") ||
    (a.folder_token || "").localeCompare(b.folder_token || "")
  );
}

export function build_folder_tree(
  folders: DecryptedFolder[],
): FolderTreeNode[] {
  const non_system = folders.filter((f) => !f.is_system);
  const token_set = new Set(non_system.map((f) => f.folder_token));
  const by_parent = new Map<string, DecryptedFolder[]>();
  const roots: DecryptedFolder[] = [];

  for (const folder of non_system) {
    if (!folder.parent_token || !token_set.has(folder.parent_token)) {
      roots.push(folder);
    } else {
      const group = by_parent.get(folder.parent_token) || [];

      group.push(folder);
      by_parent.set(folder.parent_token, group);
    }
  }

  const build = (items: DecryptedFolder[], depth: number): FolderTreeNode[] =>
    [...items].sort(compare_sibling_folders).map((folder) => ({
      folder,
      children:
        depth < MAX_FOLDER_DEPTH
          ? build(by_parent.get(folder.folder_token) || [], depth + 1)
          : [],
      depth,
    }));

  return build(roots, 0);
}

export function get_sibling_folders(
  folders: DecryptedFolder[],
  folder_id: string,
): DecryptedFolder[] {
  const non_system = folders.filter((f) => !f.is_system);
  const target = non_system.find((f) => f.id === folder_id);

  if (!target) return [];

  const token_set = new Set(non_system.map((f) => f.folder_token));
  const effective_parent = (folder: DecryptedFolder): string | undefined =>
    folder.parent_token && token_set.has(folder.parent_token)
      ? folder.parent_token
      : undefined;
  const parent = effective_parent(target);

  return non_system
    .filter((f) => effective_parent(f) === parent)
    .sort(compare_sibling_folders);
}

export interface FolderTreeGuides {
  trail: boolean[];
  has_next: boolean;
}

export function build_tree_guides(
  nodes: FolderTreeNode[],
): Map<string, FolderTreeGuides> {
  const result = new Map<string, FolderTreeGuides>();

  const walk = (siblings: FolderTreeNode[], trail: boolean[]) => {
    siblings.forEach((node, index) => {
      const has_next = index < siblings.length - 1;

      result.set(node.folder.folder_token, { trail, has_next });
      walk(node.children, [...trail, has_next]);
    });
  };

  walk(nodes, []);

  return result;
}

export function flatten_folder_tree(nodes: FolderTreeNode[]): FolderTreeNode[] {
  const result: FolderTreeNode[] = [];

  for (const node of nodes) {
    result.push(node);
    result.push(...flatten_folder_tree(node.children));
  }

  return result;
}

export const MAX_FOLDER_DEPTH = 4;

export function flatten_visible_tree(
  nodes: FolderTreeNode[],
  expanded: Set<string>,
): FolderTreeNode[] {
  const result: FolderTreeNode[] = [];

  for (const node of nodes) {
    result.push(node);
    if (node.children.length > 0 && expanded.has(node.folder.folder_token)) {
      result.push(...flatten_visible_tree(node.children, expanded));
    }
  }

  return result;
}

export function partition_folders_by_parent(
  folders: DecryptedFolder[],
  parent_token: string | undefined,
): { pinned: DecryptedFolder[]; rest: DecryptedFolder[] } {
  if (!parent_token) {
    return { pinned: [], rest: folders };
  }

  const pinned_tokens = new Set<string>();
  const queue: string[] = [];

  for (const folder of folders) {
    if (folder.parent_token === parent_token) {
      pinned_tokens.add(folder.folder_token);
      queue.push(folder.folder_token);
    }
  }

  while (queue.length > 0) {
    const token = queue.shift()!;

    for (const folder of folders) {
      if (
        folder.parent_token === token &&
        !pinned_tokens.has(folder.folder_token)
      ) {
        pinned_tokens.add(folder.folder_token);
        queue.push(folder.folder_token);
      }
    }
  }

  const pinned: DecryptedFolder[] = [];
  const rest: DecryptedFolder[] = [];

  for (const folder of folders) {
    if (pinned_tokens.has(folder.folder_token)) {
      pinned.push(folder);
    } else {
      rest.push(folder);
    }
  }

  return { pinned, rest };
}
