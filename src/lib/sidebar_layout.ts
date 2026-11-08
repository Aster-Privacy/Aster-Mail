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
export const SIDEBAR_SECTION_IDS = [
  "mail",
  "folders",
  "labels",
  "aliases",
] as const;

export type SidebarSectionId = (typeof SIDEBAR_SECTION_IDS)[number];

export const SIDEBAR_HIDEABLE_SECTION_IDS = [
  "folders",
  "labels",
  "aliases",
] as const;

export const SIDEBAR_HIDEABLE_MAIL_ITEM_IDS = [
  "sent",
  "scheduled",
  "snoozed",
  "drafts",
  "contacts",
  "starred",
  "all",
  "archive",
  "spam",
  "trash",
  "subscriptions",
] as const;

export type SidebarHideableItemId =
  | (typeof SIDEBAR_HIDEABLE_SECTION_IDS)[number]
  | (typeof SIDEBAR_HIDEABLE_MAIL_ITEM_IDS)[number];

export const DEFAULT_SIDEBAR_SECTION_ORDER: string[] = [...SIDEBAR_SECTION_IDS];

export const MAX_SIDEBAR_LAYOUT_IDS = 32;

const SIDEBAR_LAYOUT_ID_PATTERN = /^[a-z][a-z0-9_]{0,31}$/;

const HIDEABLE_IDS = new Set<string>([
  ...SIDEBAR_HIDEABLE_SECTION_IDS,
  ...SIDEBAR_HIDEABLE_MAIL_ITEM_IDS,
]);

const KNOWN_SECTION_IDS = new Set<string>(SIDEBAR_SECTION_IDS);

function sanitize_id_list(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];

  const seen = new Set<string>();
  const result: string[] = [];

  for (const entry of raw) {
    if (result.length >= MAX_SIDEBAR_LAYOUT_IDS) break;
    if (typeof entry !== "string") continue;
    if (!SIDEBAR_LAYOUT_ID_PATTERN.test(entry)) continue;
    if (seen.has(entry)) continue;
    seen.add(entry);
    result.push(entry);
  }

  return result;
}

export function sanitize_sidebar_section_order(raw: unknown): string[] {
  const listed = sanitize_id_list(raw);
  const missing = SIDEBAR_SECTION_IDS.filter((id) => !listed.includes(id));

  return [...listed, ...missing];
}

export function sanitize_sidebar_hidden_items(raw: unknown): string[] {
  return sanitize_id_list(raw);
}

export function resolve_sidebar_section_order(
  raw: unknown,
): SidebarSectionId[] {
  return sanitize_sidebar_section_order(raw).filter(
    (id): id is SidebarSectionId => KNOWN_SECTION_IDS.has(id),
  );
}

export function is_sidebar_item_hideable(id: string): boolean {
  return HIDEABLE_IDS.has(id);
}

export function is_sidebar_item_hidden(hidden: unknown, id: string): boolean {
  if (!is_sidebar_item_hideable(id)) return false;

  return sanitize_sidebar_hidden_items(hidden).includes(id);
}

export function set_sidebar_item_hidden(
  hidden: unknown,
  id: string,
  should_hide: boolean,
): string[] {
  const current = sanitize_sidebar_hidden_items(hidden);

  if (!is_sidebar_item_hideable(id)) return current;

  const without = current.filter((entry) => entry !== id);

  if (!should_hide) return without;
  if (without.length < MAX_SIDEBAR_LAYOUT_IDS) return [...without, id];

  const evict_index = without.findIndex(
    (entry) => !is_sidebar_item_hideable(entry),
  );

  if (evict_index === -1) return current;

  return [
    ...without.slice(0, evict_index),
    ...without.slice(evict_index + 1),
    id,
  ];
}

export function reset_sidebar_section_order(order: unknown): string[] {
  let next_default = 0;

  return sanitize_sidebar_section_order(order).map((id) =>
    KNOWN_SECTION_IDS.has(id) ? SIDEBAR_SECTION_IDS[next_default++] : id,
  );
}

export function reset_sidebar_hidden_items(hidden: unknown): string[] {
  return sanitize_sidebar_hidden_items(hidden).filter(
    (id) => !is_sidebar_item_hideable(id),
  );
}

export function move_sidebar_section(
  order: unknown,
  id: string,
  direction: -1 | 1,
): string[] {
  const full = sanitize_sidebar_section_order(order);

  if (!KNOWN_SECTION_IDS.has(id)) return full;

  const from = full.indexOf(id);
  let to = from + direction;

  while (to >= 0 && to < full.length && !KNOWN_SECTION_IDS.has(full[to])) {
    to += direction;
  }

  if (to < 0 || to >= full.length) return full;

  const next = [...full];

  next[from] = full[to];
  next[to] = id;

  return next;
}

export function can_move_sidebar_section(
  order: unknown,
  id: string,
  direction: -1 | 1,
): boolean {
  const resolved = resolve_sidebar_section_order(order);
  const index = resolved.indexOf(id as SidebarSectionId);

  if (index === -1) return false;

  const target = index + direction;

  return target >= 0 && target < resolved.length;
}

export function is_default_sidebar_layout(
  order: unknown,
  hidden: unknown,
): boolean {
  const resolved = resolve_sidebar_section_order(order);
  const visible_hidden = sanitize_sidebar_hidden_items(hidden).filter(
    is_sidebar_item_hideable,
  );

  return (
    visible_hidden.length === 0 &&
    resolved.every((id, index) => id === SIDEBAR_SECTION_IDS[index])
  );
}
