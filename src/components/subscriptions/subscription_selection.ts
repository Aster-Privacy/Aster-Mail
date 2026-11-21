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
export type SubscriptionTab = "active" | "unsubscribed";

export type SubscriptionBarAction =
  "deselect" | "unsubscribe" | "reactivate" | "delete";

export interface SubscriptionSelectionResult {
  selected: Set<string>;
  unsubscribe_request: string[];
  reactivate_request: string[];
  delete_request: string[];
}

export function subscription_bar_actions(
  tab: SubscriptionTab,
): SubscriptionBarAction[] {
  return [
    "deselect",
    tab === "unsubscribed" ? "reactivate" : "unsubscribe",
    "delete",
  ];
}

export function reduce_subscription_selection(
  selected: Set<string>,
  visible: string[],
  action: SubscriptionBarAction,
): SubscriptionSelectionResult {
  const visible_set = new Set(visible);
  const current = Array.from(selected).filter((email) =>
    visible_set.has(email),
  );
  const result: SubscriptionSelectionResult = {
    selected: new Set(current),
    unsubscribe_request: [],
    reactivate_request: [],
    delete_request: [],
  };

  if (action === "deselect") {
    result.selected = new Set();
  } else if (action === "unsubscribe") {
    result.unsubscribe_request = current;
  } else if (action === "reactivate") {
    result.selected = new Set();
    result.reactivate_request = current;
  } else {
    result.delete_request = current;
  }

  return result;
}
