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
import type { RestoredEmailEntry } from "@/hooks/email_list_helpers";

import { describe, it, expect, beforeEach } from "vitest";

import { begin_list_removal } from "./list_removal";
import { insert_emails_at } from "./email_list_helpers";

import {
  clear_removed_items,
  drop_removed_after,
} from "@/services/removed_items";

function make_rows(ids: string[]): InboxEmail[] {
  return ids.map((id) => ({ id }) as InboxEmail);
}

function make_list(ids: string[]) {
  let rows = make_rows(ids);

  return {
    get ids() {
      return rows.map((row) => row.id);
    },
    get rows() {
      return rows;
    },
    target: {
      remove_emails: (remove: string[]) => {
        const set = new Set(remove);

        rows = rows.filter((row) => !set.has(row.id));
      },
      restore_emails: (entries: RestoredEmailEntry[]) => {
        rows = insert_emails_at(rows, entries);
      },
    },
  };
}

describe("begin_list_removal", () => {
  beforeEach(() => {
    clear_removed_items();
  });

  it("removes the rows at once", () => {
    const list = make_list(["a", "b", "c", "d"]);

    begin_list_removal(list.rows, ["b", "c"], list.target);

    expect(list.ids).toEqual(["a", "d"]);
  });

  it("keeps pending rows out of every fetch until the server answers", () => {
    const list = make_list(["a", "b", "c"]);
    const fetched = make_rows(["a", "b", "c"]);

    const removal = begin_list_removal(list.rows, ["b"], list.target);

    expect(
      drop_removed_after(fetched, Date.now() + 60_000).map((r) => r.id),
    ).toEqual(["a", "c"]);

    removal.settle([]);

    expect(
      drop_removed_after(fetched, Date.now() + 60_000).map((r) => r.id),
    ).toEqual(["a", "b", "c"]);
    expect(
      drop_removed_after(fetched, Date.now() - 1).map((r) => r.id),
    ).toEqual(["a", "c"]);
  });

  it("restores only the failed rows in their places", () => {
    const list = make_list(["a", "b", "c", "d", "e"]);
    const removal = begin_list_removal(list.rows, ["b", "d"], list.target);

    const committed = removal.settle(["d"]);

    expect(committed).toEqual(["b"]);
    expect(list.ids).toEqual(["a", "c", "d", "e"]);
    expect(
      drop_removed_after(make_rows(["d"]), Date.now() - 1000).map((r) => r.id),
    ).toEqual(["d"]);
  });

  it("undoes in place and redoes after a failed undo", () => {
    const list = make_list(["a", "b", "c", "d"]);
    const removal = begin_list_removal(list.rows, ["a", "c"], list.target);

    removal.settle([]);
    removal.undo();

    expect(list.ids).toEqual(["a", "b", "c", "d"]);

    removal.redo();

    expect(list.ids).toEqual(["b", "d"]);
  });

  it("settles only once", () => {
    const list = make_list(["a", "b"]);
    const removal = begin_list_removal(list.rows, ["a"], list.target);

    removal.settle([]);
    removal.settle(["a"]);

    expect(list.ids).toEqual(["b"]);
  });

  it("restores every row when the whole request fails", () => {
    const list = make_list(["a", "b", "c"]);
    const removal = begin_list_removal(list.rows, ["a", "b", "c"], list.target);

    expect(list.ids).toEqual([]);

    removal.settle(["a", "b", "c"]);

    expect(list.ids).toEqual(["a", "b", "c"]);
  });
});
