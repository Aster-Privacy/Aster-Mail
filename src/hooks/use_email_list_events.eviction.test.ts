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

import type { MailItemUpdatedEventDetail } from "./mail_events";

import { compute_should_remove_from_view } from "./use_email_list_events";

function detail(
  overrides: Partial<MailItemUpdatedEventDetail>,
): MailItemUpdatedEventDetail {
  return { id: "m1", ...overrides };
}

describe("compute_should_remove_from_view", () => {
  it("evicts an inbox item that gained a non-empty folders array", () => {
    expect(
      compute_should_remove_from_view(
        detail({ folders: [{ folder_token: "work", name: "Work" }] }),
        "inbox",
      ),
    ).toBe(true);
  });

  it("does not evict an inbox item on a read toggle (folders undefined)", () => {
    expect(
      compute_should_remove_from_view(detail({ is_read: true }), "inbox"),
    ).toBe(false);
    expect(
      compute_should_remove_from_view(detail({ is_starred: true }), "inbox"),
    ).toBe(false);
  });

  it("does not evict an archived item from a folder view", () => {
    expect(
      compute_should_remove_from_view(
        detail({ is_archived: true }),
        "folder-work",
      ),
    ).toBe(false);
  });

  it("does not evict from starred view when folders are present", () => {
    expect(
      compute_should_remove_from_view(
        detail({
          is_starred: true,
          folders: [{ folder_token: "work", name: "Work" }],
        }),
        "starred",
      ),
    ).toBe(false);
  });

  it("evicts from a folder view when the item no longer carries that folder", () => {
    expect(
      compute_should_remove_from_view(
        detail({ folders: [{ folder_token: "personal", name: "Personal" }] }),
        "folder-work",
      ),
    ).toBe(true);
  });

  it("keeps a folder item that still carries the matching folder", () => {
    expect(
      compute_should_remove_from_view(
        detail({ folders: [{ folder_token: "work", name: "Work" }] }),
        "folder-work",
      ),
    ).toBe(false);
  });

  it("evicts trashed and spam items from non-trash, non-spam views", () => {
    expect(
      compute_should_remove_from_view(detail({ is_trashed: true }), "inbox"),
    ).toBe(true);
    expect(
      compute_should_remove_from_view(detail({ is_spam: true }), "starred"),
    ).toBe(true);
  });

  it("evicts archived items from inbox but not from the archive view", () => {
    expect(
      compute_should_remove_from_view(detail({ is_archived: true }), "inbox"),
    ).toBe(true);
    expect(
      compute_should_remove_from_view(detail({ is_archived: false }), "archive"),
    ).toBe(true);
    expect(
      compute_should_remove_from_view(detail({ is_archived: true }), "archive"),
    ).toBe(false);
  });
});
