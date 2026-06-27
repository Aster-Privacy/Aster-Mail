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

import { should_keep_email_in_view } from "./email_list_helpers";

describe("should_keep_email_in_view", () => {
  it("keeps an archived item in folder-, tag- and alias- views", () => {
    for (const view of ["folder-work", "tag-bills", "alias-shop@aster.cx"]) {
      expect(
        should_keep_email_in_view({ is_archived: true }, view),
      ).toBe(true);
    }
  });

  it("excludes trashed and spam items in folder-like views", () => {
    expect(
      should_keep_email_in_view({ is_trashed: true }, "folder-work"),
    ).toBe(false);
    expect(should_keep_email_in_view({ is_spam: true }, "tag-bills")).toBe(
      false,
    );
  });

  it("excludes archived items in inbox", () => {
    expect(
      should_keep_email_in_view(
        { is_archived: true, item_type: "received" },
        "inbox",
      ),
    ).toBe(false);
  });

  it("excludes a non-received item in inbox", () => {
    expect(
      should_keep_email_in_view({ item_type: "sent" }, "inbox"),
    ).toBe(false);
    expect(
      should_keep_email_in_view({ item_type: "draft" }, ""),
    ).toBe(false);
  });

  it("keeps a normal received item in inbox", () => {
    expect(
      should_keep_email_in_view({ item_type: "received" }, "inbox"),
    ).toBe(true);
  });

  it("keeps an archived item in the archive view", () => {
    expect(
      should_keep_email_in_view({ is_archived: true }, "archive"),
    ).toBe(true);
  });

  it("keeps an archived item in the all-mail view", () => {
    expect(
      should_keep_email_in_view(
        { is_archived: true, item_type: "received" },
        "all",
      ),
    ).toBe(true);
  });

  it("still excludes trashed and spam items in the all-mail view", () => {
    expect(should_keep_email_in_view({ is_trashed: true }, "all")).toBe(false);
    expect(should_keep_email_in_view({ is_spam: true }, "all")).toBe(false);
  });

  it("excludes trashed and spam items in inbox", () => {
    expect(
      should_keep_email_in_view(
        { is_trashed: true, item_type: "received" },
        "inbox",
      ),
    ).toBe(false);
    expect(
      should_keep_email_in_view(
        { is_spam: true, item_type: "received" },
        "inbox",
      ),
    ).toBe(false);
  });

  it("keeps every item in views that do not exclude trashed or spam", () => {
    expect(
      should_keep_email_in_view(
        { is_trashed: true, is_spam: true, is_archived: true },
        "trash",
      ),
    ).toBe(true);
    expect(
      should_keep_email_in_view({ is_trashed: true }, "spam"),
    ).toBe(true);
  });
});
