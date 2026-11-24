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
  ROW_STORE_LIMIT,
  assemble_cached_page,
  forget_rows,
  patch_row,
  remember_rows,
  type RowStore,
} from "@/hooks/email_list_helpers/row_store";

function row(id: string, extra: Partial<InboxEmail> = {}): InboxEmail {
  return { id, is_read: false, subject: id, ...extra } as InboxEmail;
}

const none_unread = () => false;

describe("row_store", () => {
  it("assembles a page only when every row is held", () => {
    const store: RowStore = new Map();

    remember_rows(store, [row("a"), row("b")]);

    expect(
      assemble_cached_page(store, ["a", "b"], none_unread)?.map((r) => r.id),
    ).toEqual(["a", "b"]);
    expect(assemble_cached_page(store, ["a", "c"], none_unread)).toBeNull();
    expect(assemble_cached_page(store, [], none_unread)).toBeNull();
  });

  it("resolves any message of a thread to its row once", () => {
    const store: RowStore = new Map();

    remember_rows(store, [row("t1", { grouped_email_ids: ["t1", "t2"] })]);

    expect(
      assemble_cached_page(store, ["t2", "t1"], none_unread)?.map((r) => r.id),
    ).toEqual(["t1"]);
  });

  it("takes read state from the index", () => {
    const store: RowStore = new Map();

    remember_rows(store, [row("a", { is_read: true })]);

    expect(assemble_cached_page(store, ["a"], () => true)?.[0]?.is_read).toBe(
      false,
    );
  });

  it("follows patches and removals", () => {
    const store: RowStore = new Map();

    remember_rows(store, [row("a", { grouped_email_ids: ["a", "b"] })]);
    patch_row(store, "a", { subject: "changed" });

    expect(store.get("b")?.subject).toBe("changed");

    forget_rows(store, ["b"]);

    expect(store.size).toBe(0);
  });

  it("stays within its limit", () => {
    const store: RowStore = new Map();

    remember_rows(
      store,
      Array.from({ length: ROW_STORE_LIMIT + 50 }, (_, index) =>
        row(`r${index}`),
      ),
    );

    expect(store.size).toBe(ROW_STORE_LIMIT);
    expect(store.has("r0")).toBe(false);
  });
});
