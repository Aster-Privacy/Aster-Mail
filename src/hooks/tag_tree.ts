//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//

export interface TagTreeItem {
  id: string;
  tag_token: string;
  name: string;
  sort_order: number;
  created_at?: string;
  parent_token?: string;
  is_undecryptable?: boolean;
}

export interface TagTreeNode<T extends TagTreeItem = TagTreeItem> {
  tag: T;
  children: TagTreeNode<T>[];
  depth: number;
}

export interface OrderedTag<T extends TagTreeItem = TagTreeItem> {
  tag: T;
  depth: number;
}

export const MAX_TAG_DEPTH = 4;

export const TAG_OPTION_INDENT_PX = 14;

export function compare_sibling_tags(a: TagTreeItem, b: TagTreeItem): number {
  return (
    a.sort_order - b.sort_order ||
    (a.created_at || "").localeCompare(b.created_at || "") ||
    (a.tag_token || "").localeCompare(b.tag_token || "")
  );
}

export function effective_parent_token<T extends TagTreeItem>(
  tag: T,
  token_set: Set<string>,
): string | undefined {
  return tag.parent_token &&
    tag.parent_token !== tag.tag_token &&
    token_set.has(tag.parent_token)
    ? tag.parent_token
    : undefined;
}

export function build_tag_tree<T extends TagTreeItem>(
  tags: T[],
): TagTreeNode<T>[] {
  const token_set = new Set(tags.map((tag) => tag.tag_token));
  const by_parent = new Map<string, T[]>();
  const roots: T[] = [];

  for (const tag of tags) {
    const parent = effective_parent_token(tag, token_set);

    if (!parent) {
      roots.push(tag);
    } else {
      const group = by_parent.get(parent) || [];

      group.push(tag);
      by_parent.set(parent, group);
    }
  }

  const build = (items: T[], depth: number): TagTreeNode<T>[] =>
    [...items].sort(compare_sibling_tags).map((tag) => ({
      tag,
      children:
        depth < MAX_TAG_DEPTH
          ? build(by_parent.get(tag.tag_token) || [], depth + 1)
          : [],
      depth,
    }));

  const tree = build(roots, 0);
  const placed = new Set<string>();
  const mark = (nodes: TagTreeNode<T>[]) => {
    for (const node of nodes) {
      placed.add(node.tag.tag_token);
      mark(node.children);
    }
  };

  mark(tree);

  for (const tag of tags) {
    if (!placed.has(tag.tag_token)) {
      placed.add(tag.tag_token);
      tree.push({ tag, children: [], depth: 0 });
    }
  }

  return tree;
}

export function flatten_tag_tree<T extends TagTreeItem>(
  nodes: TagTreeNode<T>[],
): TagTreeNode<T>[] {
  const result: TagTreeNode<T>[] = [];

  for (const node of nodes) {
    result.push(node);
    result.push(...flatten_tag_tree(node.children));
  }

  return result;
}

export function flatten_visible_tag_tree<T extends TagTreeItem>(
  nodes: TagTreeNode<T>[],
  expanded: Set<string>,
): TagTreeNode<T>[] {
  const result: TagTreeNode<T>[] = [];

  for (const node of nodes) {
    result.push(node);
    if (node.children.length > 0 && expanded.has(node.tag.tag_token)) {
      result.push(...flatten_visible_tag_tree(node.children, expanded));
    }
  }

  return result;
}

export function order_tags_as_tree<T extends TagTreeItem>(
  tags: T[],
): OrderedTag<T>[] {
  return flatten_tag_tree(build_tag_tree(tags)).map((node) => ({
    tag: node.tag,
    depth: node.depth,
  }));
}

export function tag_option_indent(depth: number | undefined): number {
  return Math.max(0, depth ?? 0) * TAG_OPTION_INDENT_PX;
}

export function get_tag_descendant_tokens(
  tags: TagTreeItem[],
  tag_token: string,
): Set<string> {
  const descendants = new Set<string>();
  const queue: string[] = [tag_token];

  while (queue.length > 0) {
    const current = queue.shift()!;

    for (const tag of tags) {
      if (
        tag.parent_token === current &&
        tag.tag_token !== tag_token &&
        !descendants.has(tag.tag_token)
      ) {
        descendants.add(tag.tag_token);
        queue.push(tag.tag_token);
      }
    }
  }

  return descendants;
}

export function get_tag_depth(tags: TagTreeItem[], tag_token: string): number {
  const by_token = new Map(tags.map((tag) => [tag.tag_token, tag]));
  const seen = new Set<string>([tag_token]);
  let depth = 0;
  let current = by_token.get(tag_token);

  while (current?.parent_token) {
    const parent = by_token.get(current.parent_token);

    if (!parent || seen.has(parent.tag_token)) break;

    seen.add(parent.tag_token);
    depth += 1;
    current = parent;
  }

  return depth;
}

export function get_tag_subtree_height(
  tags: TagTreeItem[],
  tag_token: string,
): number {
  const descendants = get_tag_descendant_tokens(tags, tag_token);
  const base_depth = get_tag_depth(tags, tag_token);
  let height = 0;

  for (const token of descendants) {
    height = Math.max(height, get_tag_depth(tags, token) - base_depth);
  }

  return height;
}

export function get_eligible_parent_tags<T extends TagTreeItem>(
  tags: T[],
  moving_tag_id?: string,
): OrderedTag<T>[] {
  const moving = moving_tag_id
    ? tags.find((tag) => tag.id === moving_tag_id)
    : undefined;
  const excluded = new Set<string>();
  let moving_height = 0;

  if (moving) {
    excluded.add(moving.tag_token);
    for (const token of get_tag_descendant_tokens(tags, moving.tag_token)) {
      excluded.add(token);
    }
    moving_height = get_tag_subtree_height(tags, moving.tag_token);
  }

  return order_tags_as_tree(tags).filter(
    (entry) =>
      !entry.tag.is_undecryptable &&
      !excluded.has(entry.tag.tag_token) &&
      entry.depth + 1 + moving_height <= MAX_TAG_DEPTH,
  );
}

export function has_sibling_tag_named(
  tags: TagTreeItem[],
  name: string,
  parent_token: string | null | undefined,
  exclude_id?: string,
): boolean {
  const target_name = name.trim().toLowerCase();
  const token_set = new Set(tags.map((tag) => tag.tag_token));
  const target_parent =
    parent_token && token_set.has(parent_token) ? parent_token : undefined;

  return tags.some(
    (tag) =>
      tag.id !== exclude_id &&
      !tag.is_undecryptable &&
      tag.name.toLowerCase() === target_name &&
      effective_parent_token(tag, token_set) === target_parent,
  );
}

export function reparent_children_of_removed_tag<T extends TagTreeItem>(
  tags: T[],
  removed_tag_id: string,
): T[] {
  const removed = tags.find((tag) => tag.id === removed_tag_id);

  if (!removed) return tags;

  const next_parent =
    removed.parent_token && removed.parent_token !== removed.tag_token
      ? removed.parent_token
      : undefined;

  return tags
    .filter((tag) => tag.id !== removed_tag_id)
    .map((tag) =>
      tag.parent_token === removed.tag_token
        ? { ...tag, parent_token: next_parent }
        : tag,
    );
}

export function tag_path_label<T extends TagTreeItem>(
  tags: T[],
  tag_token: string,
  separator = " / ",
): string {
  const by_token = new Map(tags.map((tag) => [tag.tag_token, tag]));
  const seen = new Set<string>();
  const names: string[] = [];
  let current = by_token.get(tag_token);

  while (current && !seen.has(current.tag_token)) {
    seen.add(current.tag_token);
    names.unshift(current.name);
    current = current.parent_token
      ? by_token.get(current.parent_token)
      : undefined;
  }

  return names.join(separator);
}
