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
import type { ReactionSummary } from "@/services/api/mail";

import { describe, expect, it } from "vitest";

import {
  group_reactions,
  merge_pending_reactions,
} from "@/components/email/reaction_groups";
import { apply_skin_tone } from "@/config/emoji/skin_tones";

const THUMBS_UP = "\u{1F44D}";
const THUMBS_UP_MEDIUM = "\u{1F44D}\u{1F3FD}";
const THUMBS_UP_DARK = "\u{1F44D}\u{1F3FF}";

function reaction(
  id: string,
  emoji: string,
  reactor_email: string,
  is_own = false,
): ReactionSummary {
  return {
    reaction_mail_item_id: id,
    source: "internal",
    emoji,
    reactor_email,
    is_own,
    created_at: "2026-11-16T10:00:00Z",
  };
}

describe("reaction grouping with skin tones", () => {
  it("keeps each skin tone in its own chip", () => {
    const groups = group_reactions(
      [
        reaction("a", THUMBS_UP, "ana@example.com"),
        reaction("b", THUMBS_UP_MEDIUM, "ben@example.com"),
        reaction("c", THUMBS_UP_MEDIUM, "cy@example.com"),
        reaction("d", THUMBS_UP_DARK, "dee@example.com"),
      ],
      "me@example.com",
    );

    expect(groups.map((group) => [group.emoji, group.count])).toEqual([
      [THUMBS_UP, 1],
      [THUMBS_UP_MEDIUM, 2],
      [THUMBS_UP_DARK, 1],
    ]);
  });

  it("adds a toned reaction you send to the chip with the same tone", () => {
    const groups = group_reactions(
      [reaction("b", THUMBS_UP_MEDIUM, "ben@example.com")],
      "me@example.com",
    );
    const merged = merge_pending_reactions(groups, [
      { emoji: apply_skin_tone(THUMBS_UP, "medium") },
    ]);

    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({
      emoji: THUMBS_UP_MEDIUM,
      count: 2,
      includes_self: true,
    });
  });

  it("shows a toned reaction you send beside an untoned chip", () => {
    const groups = group_reactions(
      [reaction("a", THUMBS_UP, "ana@example.com")],
      "me@example.com",
    );
    const merged = merge_pending_reactions(groups, [
      { emoji: apply_skin_tone(THUMBS_UP, "dark") },
    ]);

    expect(merged.map((group) => [group.emoji, group.includes_self])).toEqual([
      [THUMBS_UP, false],
      [THUMBS_UP_DARK, true],
    ]);
  });

  it("counts toned chips toward your two-reaction limit", () => {
    const groups = group_reactions(
      [
        reaction("a", THUMBS_UP_MEDIUM, "me@example.com", true),
        reaction("b", "\u{2764}\u{FE0F}", "me@example.com", true),
        reaction("c", THUMBS_UP, "ana@example.com"),
      ],
      "me@example.com",
    );

    expect(groups.filter((group) => group.includes_self)).toHaveLength(2);
  });
});
