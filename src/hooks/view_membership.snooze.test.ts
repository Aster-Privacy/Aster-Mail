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
import { describe, it, expect } from "vitest";

import {
  compute_should_remove_from_view,
  destination_views_for_update,
} from "./view_membership";
import { view_cache, patch_all_view_caches } from "./email_list_cache";

const future = new Date(Date.now() + 3_600_000).toISOString();
const past = new Date(Date.now() - 3_600_000).toISOString();

describe("view_membership snooze", () => {
  it("drops a newly snoozed message from the inbox", () => {
    const detail = { id: "a", snoozed_until: future };

    expect(compute_should_remove_from_view(detail, "inbox")).toBe(true);
    expect(compute_should_remove_from_view(detail, "")).toBe(true);
  });

  it("keeps a newly snoozed message in the snoozed view", () => {
    const detail = { id: "a", snoozed_until: future };

    expect(compute_should_remove_from_view(detail, "snoozed")).toBe(false);
  });

  it("keeps a snoozed message in all mail, starred and folder views", () => {
    const detail = { id: "a", snoozed_until: future };

    expect(compute_should_remove_from_view(detail, "all")).toBe(false);
    expect(compute_should_remove_from_view(detail, "folder-work")).toBe(false);
  });

  it("drops an unsnoozed message from the snoozed view", () => {
    expect(
      compute_should_remove_from_view(
        { id: "a", snoozed_until: null },
        "snoozed",
      ),
    ).toBe(true);
    expect(
      compute_should_remove_from_view(
        { id: "a", snoozed_until: past },
        "snoozed",
      ),
    ).toBe(true);
  });

  it("leaves views untouched when the update carries no snooze field", () => {
    const detail = { id: "a", is_read: true };

    expect(compute_should_remove_from_view(detail, "inbox")).toBe(false);
    expect(compute_should_remove_from_view(detail, "snoozed")).toBe(false);
  });

  it("stales the snoozed view when a message is snoozed", () => {
    expect(
      destination_views_for_update({ id: "a", snoozed_until: future }),
    ).toContain("snoozed");
  });

  it("stales the inbox when a message is unsnoozed", () => {
    const views = destination_views_for_update({
      id: "a",
      snoozed_until: null,
    });

    expect(views).toContain("inbox");
    expect(views).toContain("");
  });
});

describe("inbox view cache after snooze", () => {
  it("evicts the snoozed message so returning to the inbox does not show it", () => {
    view_cache.clear();
    view_cache.set("inbox", {
      state: {
        emails: [{ id: "a" }, { id: "b" }] as never,
        is_loading: false,
        is_loading_more: false,
        total_messages: 2,
        has_more: false,
        has_initial_load: true,
      },
      time: 0,
      is_stale: false,
      conversation_grouping: true,
    });

    patch_all_view_caches({ id: "a", snoozed_until: future });

    const cached = view_cache.get("inbox");

    expect(cached?.state.emails.map((e) => e.id)).toEqual(["b"]);
    expect(cached?.state.total_messages).toBe(1);
    view_cache.clear();
  });
});
