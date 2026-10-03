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

import { describe, it, expect, beforeEach } from "vitest";

import { merge_silent_refresh_emails } from "./silent_refresh";

import {
  note_removed_ids,
  clear_removed_items,
} from "@/services/removed_items";

const make_email = (id: string, is_selected = false): InboxEmail =>
  ({ id, is_selected }) as InboxEmail;

describe("merge_silent_refresh_emails", () => {
  beforeEach(() => {
    clear_removed_items();
  });

  it("keeps a message the background refresh still reports", () => {
    const started_at = Date.now();
    const merged = merge_silent_refresh_emails(
      [],
      [make_email("a"), make_email("b")],
      started_at,
    );

    expect(merged.map((e) => e.id)).toEqual(["a", "b"]);
  });

  it("drops a message trashed while the refresh was in flight", () => {
    const started_at = Date.now();

    note_removed_ids(["b"]);

    const merged = merge_silent_refresh_emails(
      [],
      [make_email("a"), make_email("b")],
      started_at,
    );

    expect(merged.map((e) => e.id)).toEqual(["a"]);
  });

  it("lets a restored message come back on a later refresh", () => {
    note_removed_ids(["b"]);

    const started_at = Date.now() + 1;
    const merged = merge_silent_refresh_emails(
      [],
      [make_email("a"), make_email("b")],
      started_at,
    );

    expect(merged.map((e) => e.id)).toEqual(["a", "b"]);
  });

  it("carries the current selection onto the refreshed rows", () => {
    const merged = merge_silent_refresh_emails(
      [make_email("a", true)],
      [make_email("a"), make_email("b")],
      Date.now(),
    );

    expect(merged.find((e) => e.id === "a")?.is_selected).toBe(true);
    expect(merged.find((e) => e.id === "b")?.is_selected).toBeFalsy();
  });
  it("keeps the existing row object when the refreshed row is equal", () => {
    const previous = [
      { ...make_email("a"), folders: [{ folder_token: "work" }] },
      make_email("b", true),
      make_email("c"),
    ] as InboxEmail[];
    const incoming = [
      { ...make_email("a"), folders: [{ folder_token: "work" }] },
      make_email("b"),
      { ...make_email("c"), is_read: true },
    ] as InboxEmail[];

    const merged = merge_silent_refresh_emails(previous, incoming, Date.now());

    expect(merged[0]).toBe(previous[0]);
    expect(merged[1]).toBe(previous[1]);
    expect(merged[2]).not.toBe(previous[2]);
    expect(merged[2].is_read).toBe(true);
  });

  it("returns the previous list when nothing changed", () => {
    const previous = [make_email("a"), make_email("b")];
    const merged = merge_silent_refresh_emails(
      previous,
      [make_email("a"), make_email("b")],
      Date.now(),
    );

    expect(merged).toBe(previous);
  });
});
