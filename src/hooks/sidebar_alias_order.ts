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
import type { DecryptedEmailAlias } from "@/services/api/aliases";
import type { SidebarAddressUpdate } from "@/services/api/aliases/sidebar";

export type SidebarMoveDirection = "up" | "down";

export interface SidebarAddressRef {
  id: string;
  kind: SidebarAddressUpdate["kind"];
}

const DOMAIN_PREFIX = "domain-";
const GROUP_PREFIX = "group-";

export function sidebar_address_ref(
  alias: DecryptedEmailAlias,
): SidebarAddressRef | null {
  if (alias.id.startsWith(GROUP_PREFIX)) return null;
  if (alias.id.startsWith(DOMAIN_PREFIX)) {
    return { id: alias.id.slice(DOMAIN_PREFIX.length), kind: "domain" };
  }

  return { id: alias.id, kind: "alias" };
}

export function is_sidebar_orderable(alias: DecryptedEmailAlias): boolean {
  return sidebar_address_ref(alias) !== null;
}

export function order_sidebar_aliases(
  aliases: DecryptedEmailAlias[],
): DecryptedEmailAlias[] {
  const indexed = aliases.map((alias, index) => ({ alias, index }));

  indexed.sort((a, b) => {
    const a_orderable = is_sidebar_orderable(a.alias);
    const b_orderable = is_sidebar_orderable(b.alias);

    if (a_orderable !== b_orderable) return a_orderable ? -1 : 1;

    const a_order = a.alias.sidebar_order ?? null;
    const b_order = b.alias.sidebar_order ?? null;

    if (a_order !== null && b_order !== null && a_order !== b_order) {
      return a_order - b_order;
    }
    if (a_order !== null && b_order === null) return -1;
    if (a_order === null && b_order !== null) return 1;

    return a.index - b.index;
  });

  return indexed.map((entry) => entry.alias);
}

export function visible_sidebar_aliases(
  aliases: DecryptedEmailAlias[],
): DecryptedEmailAlias[] {
  return order_sidebar_aliases(aliases).filter(
    (alias) => alias.is_enabled && !alias.sidebar_hidden,
  );
}

export function hidden_sidebar_aliases(
  aliases: DecryptedEmailAlias[],
): DecryptedEmailAlias[] {
  return order_sidebar_aliases(aliases).filter(
    (alias) => is_sidebar_orderable(alias) && alias.sidebar_hidden === true,
  );
}

export function can_move_sidebar_alias(
  aliases: DecryptedEmailAlias[],
  alias_id: string,
  direction: SidebarMoveDirection,
): boolean {
  const visible = visible_sidebar_aliases(aliases).filter(is_sidebar_orderable);
  const index = visible.findIndex((alias) => alias.id === alias_id);

  if (index < 0) return false;

  return direction === "up" ? index > 0 : index < visible.length - 1;
}

export interface SidebarMovePlan {
  aliases: DecryptedEmailAlias[];
  updates: SidebarAddressUpdate[];
}

export function plan_sidebar_alias_move(
  aliases: DecryptedEmailAlias[],
  alias_id: string,
  direction: SidebarMoveDirection,
): SidebarMovePlan | null {
  if (!can_move_sidebar_alias(aliases, alias_id, direction)) return null;

  const visible = visible_sidebar_aliases(aliases).filter(is_sidebar_orderable);
  const visible_index = visible.findIndex((alias) => alias.id === alias_id);
  const neighbor =
    visible[direction === "up" ? visible_index - 1 : visible_index + 1];
  const ordered = order_sidebar_aliases(aliases).filter(is_sidebar_orderable);
  const moving = ordered.find((alias) => alias.id === alias_id);

  if (!moving || !neighbor) return null;

  const without = ordered.filter((alias) => alias.id !== alias_id);
  const neighbor_index = without.findIndex((alias) => alias.id === neighbor.id);
  const insert_at = direction === "up" ? neighbor_index : neighbor_index + 1;

  without.splice(insert_at, 0, moving);

  const next_order = new Map<string, number>();
  const updates: SidebarAddressUpdate[] = [];

  without.forEach((alias, index) => {
    next_order.set(alias.id, index);
    if ((alias.sidebar_order ?? null) === index) return;

    const ref = sidebar_address_ref(alias);

    if (ref) updates.push({ ...ref, sort_order: index });
  });

  const next_aliases = aliases.map((alias) =>
    next_order.has(alias.id)
      ? { ...alias, sidebar_order: next_order.get(alias.id) }
      : alias,
  );

  return { aliases: next_aliases, updates };
}

export function plan_sidebar_alias_hidden(
  aliases: DecryptedEmailAlias[],
  alias_id: string,
  hidden: boolean,
): SidebarMovePlan | null {
  const target = aliases.find((alias) => alias.id === alias_id);
  const ref = target ? sidebar_address_ref(target) : null;

  if (!target || !ref || (target.sidebar_hidden ?? false) === hidden) {
    return null;
  }

  return {
    aliases: aliases.map((alias) =>
      alias.id === alias_id ? { ...alias, sidebar_hidden: hidden } : alias,
    ),
    updates: [{ ...ref, hidden }],
  };
}
