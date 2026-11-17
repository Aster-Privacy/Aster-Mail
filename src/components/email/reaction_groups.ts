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
import type { DecryptedThreadMessage } from "@/types/thread";

export interface ReactionChipGroup {
  emoji: string;
  count: number;
  reactor_names: string[];
  includes_self: boolean;
  self_reaction_mail_item_id?: string;
}

export interface PendingReaction {
  emoji: string;
  reaction_mail_item_id?: string;
}

export function group_reactions(
  reactions: DecryptedThreadMessage["reactions"],
  self_email?: string,
): ReactionChipGroup[] {
  if (!reactions?.length) return [];

  const groups = new Map<string, ReactionChipGroup>();
  const seen_reactors = new Map<string, Set<string>>();
  const self_key = self_email?.toLowerCase().trim();

  for (const reaction of reactions) {
    if (!reaction.emoji) continue;

    const existing = groups.get(reaction.emoji) ?? {
      emoji: reaction.emoji,
      count: 0,
      reactor_names: [],
      includes_self: false,
    };
    const seen = seen_reactors.get(reaction.emoji) ?? new Set<string>();

    const reactor_email = reaction.reactor_email?.toLowerCase().trim();
    const is_self =
      reaction.is_own === true || (!!self_key && reactor_email === self_key);
    const reactor_key = is_self
      ? "self"
      : reactor_email || `item:${reaction.reaction_mail_item_id}`;
    const is_new_reactor = !seen.has(reactor_key);

    if (is_new_reactor) {
      seen.add(reactor_key);
      existing.count += 1;
    }

    if (is_self) {
      existing.includes_self = true;
      if (reaction.is_own === true || !existing.self_reaction_mail_item_id) {
        existing.self_reaction_mail_item_id = reaction.reaction_mail_item_id;
      }
    } else if (reaction.reactor_email && is_new_reactor) {
      existing.reactor_names.push(reaction.reactor_email);
    }

    groups.set(reaction.emoji, existing);
    seen_reactors.set(reaction.emoji, seen);
  }

  return Array.from(groups.values());
}

export function merge_pending_reactions(
  groups: ReactionChipGroup[],
  pending_reactions: PendingReaction[],
): ReactionChipGroup[] {
  if (!pending_reactions.length) return groups;

  const merged = groups.map((group) => ({ ...group }));

  for (const pending of pending_reactions) {
    const existing = merged.find((group) => group.emoji === pending.emoji);

    if (existing) {
      if (!existing.includes_self) {
        existing.includes_self = true;
        existing.count += 1;
      }

      existing.self_reaction_mail_item_id =
        existing.self_reaction_mail_item_id ?? pending.reaction_mail_item_id;
    } else {
      merged.push({
        emoji: pending.emoji,
        count: 1,
        reactor_names: [],
        includes_self: true,
        self_reaction_mail_item_id: pending.reaction_mail_item_id,
      });
    }
  }

  return merged;
}
