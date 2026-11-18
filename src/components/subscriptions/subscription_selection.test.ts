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
import { describe, expect, it } from "vitest";

import {
  reduce_subscription_selection,
  subscription_bar_actions,
} from "@/components/subscriptions/subscription_selection";

const visible = ["a@example.com", "b@example.com", "c@example.com"];

describe("subscription selection bar", () => {
  it.each(["active", "unsubscribed"] as const)(
    "deselect clears the selection on the %s tab",
    (tab) => {
      expect(subscription_bar_actions(tab)).toContain("deselect");

      const result = reduce_subscription_selection(
        new Set(["a@example.com"]),
        visible,
        "deselect",
      );

      expect(result.selected.size).toBe(0);
      expect(result.delete_request).toEqual([]);
      expect(result.reactivate_request).toEqual([]);
      expect(result.unsubscribe_request).toEqual([]);
    },
  );

  it("offers delete on both tabs", () => {
    expect(subscription_bar_actions("active")).toEqual([
      "deselect",
      "unsubscribe",
      "delete",
    ]);
    expect(subscription_bar_actions("unsubscribed")).toEqual([
      "deselect",
      "reactivate",
      "delete",
    ]);
  });

  it("deletes only visible selected entries and keeps them selected until confirmed", () => {
    const result = reduce_subscription_selection(
      new Set(["a@example.com", "gone@example.com"]),
      visible,
      "delete",
    );

    expect(result.delete_request).toEqual(["a@example.com"]);
    expect(Array.from(result.selected)).toEqual(["a@example.com"]);
  });

  it("reactivate requests the selection and clears it", () => {
    const result = reduce_subscription_selection(
      new Set(["b@example.com", "c@example.com"]),
      visible,
      "reactivate",
    );

    expect(result.reactivate_request).toEqual([
      "b@example.com",
      "c@example.com",
    ]);
    expect(result.selected.size).toBe(0);
  });

  it("unsubscribe requests the selection", () => {
    const result = reduce_subscription_selection(
      new Set(["c@example.com"]),
      visible,
      "unsubscribe",
    );

    expect(result.unsubscribe_request).toEqual(["c@example.com"]);
  });
});
