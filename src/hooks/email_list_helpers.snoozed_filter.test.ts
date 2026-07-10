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
  is_snoozed_in_future,
  should_keep_email_in_view,
} from "./email_list_helpers";

const future = new Date(Date.now() + 3_600_000).toISOString();
const past = new Date(Date.now() - 3_600_000).toISOString();

describe("is_snoozed_in_future", () => {
  it("returns true for a future timestamp", () => {
    expect(is_snoozed_in_future(future)).toBe(true);
  });

  it("returns false for a past timestamp", () => {
    expect(is_snoozed_in_future(past)).toBe(false);
  });

  it("treats missing values as not snoozed", () => {
    expect(is_snoozed_in_future(undefined)).toBe(false);
    expect(is_snoozed_in_future(null)).toBe(false);
    expect(is_snoozed_in_future("")).toBe(false);
  });

  it("treats unparseable values as not snoozed", () => {
    expect(is_snoozed_in_future("not-a-date")).toBe(false);
  });
});

describe("should_keep_email_in_view snoozed handling", () => {
  it("drops a future-snoozed received item from the inbox", () => {
    expect(
      should_keep_email_in_view(
        { item_type: "received", snoozed_until: future },
        "inbox",
      ),
    ).toBe(false);
    expect(
      should_keep_email_in_view(
        { item_type: "received", snoozed_until: future },
        "",
      ),
    ).toBe(false);
  });

  it("keeps a past-snoozed received item in the inbox", () => {
    expect(
      should_keep_email_in_view(
        { item_type: "received", snoozed_until: past },
        "inbox",
      ),
    ).toBe(true);
  });

  it("keeps an item with unparseable snoozed_until in the inbox", () => {
    expect(
      should_keep_email_in_view(
        { item_type: "received", snoozed_until: "garbage" },
        "inbox",
      ),
    ).toBe(true);
  });

  it("keeps future-snoozed items in the snoozed view", () => {
    expect(
      should_keep_email_in_view({ snoozed_until: future }, "snoozed"),
    ).toBe(true);
  });

  it("keeps future-snoozed items in non-inbox views", () => {
    expect(should_keep_email_in_view({ snoozed_until: future }, "all")).toBe(
      true,
    );
    expect(
      should_keep_email_in_view(
        { is_archived: true, snoozed_until: future },
        "archive",
      ),
    ).toBe(true);
    expect(
      should_keep_email_in_view({ snoozed_until: future }, "folder-work"),
    ).toBe(true);
  });
});
