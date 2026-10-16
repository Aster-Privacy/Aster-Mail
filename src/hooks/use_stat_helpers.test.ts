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
import { describe, expect, it } from "vitest";

import {
  compute_archive_deltas,
  compute_trash_deltas,
  compute_unarchive_deltas,
  compute_untrash_deltas,
} from "@/hooks/use_stat_helpers";

const unread_received = { item_type: "received", is_read: false };

describe("stat deltas", () => {
  it("moves inbox and unread counts when trashing inbox mail", () => {
    expect(compute_trash_deltas(unread_received)).toEqual({
      unread: -1,
      inbox: -1,
      sent: 0,
      trash: 1,
      archived: 0,
    });
  });

  it("moves the archive count when trashing archived mail", () => {
    expect(
      compute_trash_deltas({ ...unread_received, is_archived: true }),
    ).toEqual({ unread: 0, inbox: 0, sent: 0, trash: 1, archived: -1 });
  });

  it("restores archived mail to the archive count", () => {
    expect(
      compute_untrash_deltas({ ...unread_received, is_archived: true }),
    ).toEqual({ unread: 0, inbox: 0, sent: 0, trash: -1, archived: 1 });
  });

  it("keeps archive and unarchive symmetric", () => {
    expect(compute_archive_deltas(unread_received)).toEqual({
      unread: -1,
      inbox: -1,
      sent: 0,
      trash: 0,
      archived: 1,
    });
    expect(
      compute_unarchive_deltas({ ...unread_received, is_archived: true }),
    ).toEqual({ unread: 1, inbox: 1, sent: 0, trash: 0, archived: -1 });
  });
});
