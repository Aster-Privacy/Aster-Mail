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

import { describe, expect, it } from "vitest";

import {
  can_move_sidebar_alias,
  hidden_sidebar_aliases,
  order_sidebar_aliases,
  plan_sidebar_alias_hidden,
  plan_sidebar_alias_move,
  sidebar_address_ref,
  visible_sidebar_aliases,
} from "@/hooks/sidebar_alias_order";

function make_alias(
  id: string,
  extra: Partial<DecryptedEmailAlias> = {},
): DecryptedEmailAlias {
  return {
    id,
    full_address: `${id}@example.test`,
    is_enabled: true,
    ...extra,
  } as DecryptedEmailAlias;
}

describe("sidebar alias order", () => {
  it("maps ids to backend references", () => {
    expect(sidebar_address_ref(make_alias("a1"))).toEqual({
      id: "a1",
      kind: "alias",
    });
    expect(sidebar_address_ref(make_alias("domain-d1"))).toEqual({
      id: "d1",
      kind: "domain",
    });
    expect(sidebar_address_ref(make_alias("group-g1"))).toBeNull();
  });

  it("orders by sidebar_order, keeps unordered entries stable, groups last", () => {
    const list = [
      make_alias("group-g1"),
      make_alias("a"),
      make_alias("b", { sidebar_order: 1 }),
      make_alias("c", { sidebar_order: 0 }),
      make_alias("d"),
    ];

    expect(order_sidebar_aliases(list).map((a) => a.id)).toEqual([
      "c",
      "b",
      "a",
      "d",
      "group-g1",
    ]);
  });

  it("separates hidden aliases from visible ones", () => {
    const list = [
      make_alias("a"),
      make_alias("b", { sidebar_hidden: true }),
      make_alias("c", { is_enabled: false }),
    ];

    expect(visible_sidebar_aliases(list).map((a) => a.id)).toEqual(["a"]);
    expect(hidden_sidebar_aliases(list).map((a) => a.id)).toEqual(["b"]);
  });

  it("moves an alias past its visible neighbor and renumbers", () => {
    const list = [
      make_alias("a"),
      make_alias("hidden", { sidebar_hidden: true }),
      make_alias("b"),
    ];

    expect(can_move_sidebar_alias(list, "a", "up")).toBe(false);
    expect(can_move_sidebar_alias(list, "a", "down")).toBe(true);

    const plan = plan_sidebar_alias_move(list, "b", "up");

    expect(plan).not.toBeNull();
    expect(visible_sidebar_aliases(plan!.aliases).map((a) => a.id)).toEqual([
      "b",
      "a",
    ]);
    expect(plan!.updates).toEqual([
      { id: "b", kind: "alias", sort_order: 0 },
      { id: "a", kind: "alias", sort_order: 1 },
      { id: "hidden", kind: "alias", sort_order: 2 },
    ]);
  });

  it("plans a hidden toggle only when the value changes", () => {
    const list = [make_alias("domain-d1")];

    expect(plan_sidebar_alias_hidden(list, "domain-d1", false)).toBeNull();
    expect(plan_sidebar_alias_hidden(list, "domain-d1", true)?.updates).toEqual(
      [{ id: "d1", kind: "domain", hidden: true }],
    );
    expect(plan_sidebar_alias_hidden(list, "group-x", true)).toBeNull();
  });
});
