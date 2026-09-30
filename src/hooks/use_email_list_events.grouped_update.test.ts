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
import type { InboxEmail } from "@/types/email";

import { describe, it, expect } from "vitest";

import {
  apply_item_update_to_rows,
  row_contains_sibling,
} from "./use_email_list_events";

function email(overrides: Partial<InboxEmail>): InboxEmail {
  return {
    id: "e1",
    item_type: "received",
    sender_name: "a",
    sender_email: "a@b.c",
    subject: "s",
    preview: "p",
    timestamp: "now",
    is_pinned: false,
    is_starred: false,
    is_selected: false,
    is_read: true,
    is_trashed: false,
    is_archived: false,
    is_spam: false,
    has_attachment: false,
    category: "",
    category_color: "",
    avatar_url: "",
    ...overrides,
  } as InboxEmail;
}

describe("apply_item_update_to_rows", () => {
  it("applies the update when detail targets the representative row id", () => {
    const rows = [email({ id: "e1", grouped_email_ids: ["e1", "e2"] })];
    const { emails, needs_refetch } = apply_item_update_to_rows(rows, {
      id: "e1",
      is_read: false,
    });

    expect(emails[0].is_read).toBe(false);
    expect(needs_refetch).toBe(false);
  });

  it("marks the row unread when a hidden sibling becomes unread", () => {
    const rows = [email({ id: "e1", grouped_email_ids: ["e1", "e2"] })];
    const { emails, needs_refetch } = apply_item_update_to_rows(rows, {
      id: "e2",
      is_read: false,
    });

    expect(emails[0].is_read).toBe(false);
    expect(needs_refetch).toBe(false);
  });

  it("stars the row when a hidden sibling is starred", () => {
    const rows = [email({ id: "e1", grouped_email_ids: ["e1", "e2"] })];
    const { emails, needs_refetch } = apply_item_update_to_rows(rows, {
      id: "e2",
      is_starred: true,
    });

    expect(emails[0].is_starred).toBe(true);
    expect(needs_refetch).toBe(false);
  });

  it("requests a refetch when a sibling is marked read", () => {
    const rows = [
      email({ id: "e1", is_read: false, grouped_email_ids: ["e1", "e2"] }),
    ];
    const { emails, needs_refetch } = apply_item_update_to_rows(rows, {
      id: "e2",
      is_read: true,
    });

    expect(emails[0].is_read).toBe(false);
    expect(needs_refetch).toBe(true);
  });

  it("requests a refetch when a sibling is unstarred", () => {
    const rows = [
      email({ id: "e1", is_starred: true, grouped_email_ids: ["e1", "e2"] }),
    ];
    const { emails, needs_refetch } = apply_item_update_to_rows(rows, {
      id: "e2",
      is_starred: false,
    });

    expect(emails[0].is_starred).toBe(true);
    expect(needs_refetch).toBe(true);
  });

  it("leaves unrelated rows untouched", () => {
    const rows = [
      email({ id: "e1", grouped_email_ids: ["e1", "e2"] }),
      email({ id: "e9" }),
    ];
    const { emails, needs_refetch } = apply_item_update_to_rows(rows, {
      id: "e404",
      is_read: false,
    });

    expect(emails[0]).toBe(rows[0]);
    expect(emails[1]).toBe(rows[1]);
    expect(needs_refetch).toBe(false);
  });
});

describe("row_contains_sibling", () => {
  it("finds a row grouping the given id", () => {
    const rows = [email({ id: "e1", grouped_email_ids: ["e1", "e2"] })];

    expect(row_contains_sibling(rows, "e2")).toBe(true);
  });

  it("does not treat the representative id as a sibling", () => {
    const rows = [email({ id: "e1", grouped_email_ids: ["e1", "e2"] })];

    expect(row_contains_sibling(rows, "e1")).toBe(false);
  });

  it("returns false when no row groups the id", () => {
    const rows = [email({ id: "e1" })];

    expect(row_contains_sibling(rows, "e2")).toBe(false);
  });
});
