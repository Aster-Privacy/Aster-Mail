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
  is_system_drop_target,
  system_drop_verdict,
} from "./system_drop_targets";

describe("system drop verdict", () => {
  it("accepts inbox mail on Archive, Spam, Trash and Starred", () => {
    const source = { location: "inbox" as const, all_starred: false };

    expect(system_drop_verdict("archive", source)).toBe("accept");
    expect(system_drop_verdict("spam", source)).toBe("accept");
    expect(system_drop_verdict("trash", source)).toBe("accept");
    expect(system_drop_verdict("starred", source)).toBe("accept");
  });

  it("treats the folder the mail already sits in as a no-op", () => {
    expect(system_drop_verdict("inbox", { location: "inbox" })).toBe("same");
    expect(system_drop_verdict("archive", { location: "archive" })).toBe(
      "same",
    );
    expect(system_drop_verdict("spam", { location: "spam" })).toBe("same");
    expect(system_drop_verdict("trash", { location: "trash" })).toBe("same");
    expect(
      system_drop_verdict("starred", {
        location: "inbox",
        all_starred: true,
      }),
    ).toBe("same");
  });

  it("never lets a drop on Trash permanently delete mail that is already there", () => {
    expect(system_drop_verdict("trash", { location: "trash" })).not.toBe(
      "accept",
    );
  });

  it("blocks drafts and scheduled mail everywhere", () => {
    for (const target of ["inbox", "archive", "spam", "trash", "starred"]) {
      expect(system_drop_verdict(target, { location: "drafts" })).toBe(
        "blocked",
      );
      expect(system_drop_verdict(target, { location: "scheduled" })).toBe(
        "blocked",
      );
    }
  });

  it("follows the Move to menu for mail outside the inbox", () => {
    expect(system_drop_verdict("inbox", { location: "archive" })).toBe(
      "accept",
    );
    expect(system_drop_verdict("inbox", { location: "spam" })).toBe("accept");
    expect(system_drop_verdict("inbox", { location: "trash" })).toBe("accept");
    expect(system_drop_verdict("spam", { location: "trash" })).toBe("blocked");
    expect(system_drop_verdict("archive", { location: "spam" })).toBe(
      "blocked",
    );
    expect(system_drop_verdict("spam", { location: "sent" })).toBe("blocked");
    expect(system_drop_verdict("archive", { location: "sent" })).toBe(
      "accept",
    );
    expect(system_drop_verdict("inbox", { location: "folder" })).toBe(
      "blocked",
    );
  });

  it("blocks folders that cannot receive mail", () => {
    for (const target of [
      "sent",
      "drafts",
      "scheduled",
      "snoozed",
      "subscriptions",
      "all",
      "contacts",
    ]) {
      expect(is_system_drop_target(target)).toBe(false);
      expect(system_drop_verdict(target, { location: "inbox" })).toBe(
        "blocked",
      );
    }
  });

  it("blocks a drag that carries no source location", () => {
    expect(system_drop_verdict("archive", null)).toBe("blocked");
    expect(system_drop_verdict("archive", {})).toBe("blocked");
  });
});
