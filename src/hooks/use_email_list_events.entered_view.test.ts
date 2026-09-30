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

import { entered_current_view } from "./use_email_list_events";

function row(id: string, grouped_email_ids?: string[]): InboxEmail {
  return { id, grouped_email_ids } as InboxEmail;
}

describe("entered_current_view", () => {
  it("reports a newly starred message that is absent from the starred view", () => {
    expect(
      entered_current_view(
        [row("a")],
        { id: "b", is_starred: true },
        "starred",
      ),
    ).toBe(true);
  });

  it("ignores a starred message that is already on the page", () => {
    expect(
      entered_current_view(
        [row("b")],
        { id: "b", is_starred: true },
        "starred",
      ),
    ).toBe(false);
  });

  it("ignores a message already represented by a grouped sibling", () => {
    expect(
      entered_current_view(
        [row("a", ["b"])],
        { id: "b", is_starred: true },
        "starred",
      ),
    ).toBe(false);
  });

  it("ignores updates that do not add the message to the current view", () => {
    expect(
      entered_current_view([row("a")], { id: "b", is_read: true }, "starred"),
    ).toBe(false);
    expect(
      entered_current_view([row("a")], { id: "b", is_starred: true }, "inbox"),
    ).toBe(false);
  });

  it("reports a restored message for the inbox view", () => {
    expect(
      entered_current_view([row("a")], { id: "b", is_trashed: false }, "inbox"),
    ).toBe(true);
  });

  it("reports a message moved into the folder being viewed", () => {
    expect(
      entered_current_view(
        [row("a")],
        { id: "b", folders: [{ folder_token: "work", name: "Work" }] },
        "folder-work",
      ),
    ).toBe(true);
  });
});
