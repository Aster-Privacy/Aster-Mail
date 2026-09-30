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

import { compute_should_remove_from_view } from "./view_membership";
import { should_keep_email_in_view } from "./email_list_helpers/display";

describe("archived mail in the starred view", () => {
  it("keeps a starred archived message in the starred list", () => {
    expect(
      should_keep_email_in_view(
        { is_archived: true, is_trashed: false, is_spam: false },
        "starred",
      ),
    ).toBe(true);
  });

  it("keeps an archived message in the snoozed list", () => {
    expect(
      should_keep_email_in_view(
        { is_archived: true, is_trashed: false, is_spam: false },
        "snoozed",
      ),
    ).toBe(true);
  });

  it("still drops trashed or spam starred messages", () => {
    expect(
      should_keep_email_in_view(
        { is_archived: true, is_trashed: true },
        "starred",
      ),
    ).toBe(false);
    expect(
      should_keep_email_in_view(
        { is_archived: false, is_spam: true },
        "starred",
      ),
    ).toBe(false);
  });

  it("still drops archived messages from the inbox", () => {
    const flags = { is_archived: true, is_trashed: false, is_spam: false };

    expect(should_keep_email_in_view(flags, "inbox")).toBe(false);
  });

  it("keeps archived sent messages in the sent list", () => {
    const flags = {
      is_archived: true,
      is_trashed: false,
      is_spam: false,
      item_type: "sent",
    };

    expect(should_keep_email_in_view(flags, "sent")).toBe(true);
    expect(
      compute_should_remove_from_view({ id: "a", is_archived: true }, "sent"),
    ).toBe(false);
  });

  it("keeps archived messages in archive, all mail and folder views", () => {
    const flags = { is_archived: true, is_trashed: false, is_spam: false };

    expect(should_keep_email_in_view(flags, "archive")).toBe(true);
    expect(should_keep_email_in_view(flags, "all")).toBe(true);
    expect(should_keep_email_in_view(flags, "folder-work")).toBe(true);
    expect(should_keep_email_in_view(flags, "tag-urgent")).toBe(true);
  });

  it("does not remove a message from starred when it is archived", () => {
    expect(
      compute_should_remove_from_view(
        { id: "a", is_archived: true },
        "starred",
      ),
    ).toBe(false);
  });

  it("removes a message from starred when it is unstarred", () => {
    expect(
      compute_should_remove_from_view(
        { id: "a", is_archived: true, is_starred: false },
        "starred",
      ),
    ).toBe(true);
  });

  it("still removes an archived message from the inbox", () => {
    expect(
      compute_should_remove_from_view({ id: "a", is_archived: true }, "inbox"),
    ).toBe(true);
  });
});

describe("filed mail in the archive view", () => {
  it("removes a message from archive once it is filed in a folder", () => {
    expect(
      compute_should_remove_from_view(
        {
          id: "a",
          folders: [{ folder_token: "f1", name: "Receipts" }],
        },
        "archive",
      ),
    ).toBe(true);
  });

  it("keeps an archived message with no folder in archive", () => {
    expect(
      compute_should_remove_from_view({ id: "a", folders: [] }, "archive"),
    ).toBe(false);
  });
});
