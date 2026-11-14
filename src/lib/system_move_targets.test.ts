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
  resolve_mail_location,
  system_move_targets,
} from "./system_move_targets";

const all = { inbox: true, archive: true, spam: true, trash: true };

describe("resolve_mail_location", () => {
  it("prefers the bins over every other flag", () => {
    expect(
      resolve_mail_location({
        current_view: "inbox",
        is_trashed: true,
        is_archived: true,
        in_custom_folder: true,
      }),
    ).toBe("trash");
    expect(resolve_mail_location({ current_view: "spam" })).toBe("spam");
  });

  it("reads archive, sent and custom folders", () => {
    expect(resolve_mail_location({ is_archived: true })).toBe("archive");
    expect(resolve_mail_location({ current_view: "sent" })).toBe("sent");
    expect(
      resolve_mail_location({
        current_view: "folder-abc",
        in_custom_folder: true,
      }),
    ).toBe("folder");
    expect(resolve_mail_location({ current_view: "inbox" })).toBe("inbox");
  });

  it("keeps drafts and scheduled mail where it is", () => {
    expect(resolve_mail_location({ current_view: "drafts" })).toBe("drafts");
    expect(system_move_targets("drafts", all)).toEqual([]);
    expect(system_move_targets("scheduled", all)).toEqual([]);
  });
});

describe("system_move_targets", () => {
  it("never offers the folder the message is already in", () => {
    expect(system_move_targets("inbox", all)).toEqual([
      "archive",
      "spam",
      "trash",
    ]);
    expect(system_move_targets("archive", all)).toEqual([
      "inbox",
      "spam",
      "trash",
    ]);
    expect(system_move_targets("spam", all)).toEqual(["inbox", "trash"]);
    expect(system_move_targets("trash", all)).toEqual(["inbox"]);
  });

  it("lets custom folder mail go back to the inbox", () => {
    expect(system_move_targets("folder", all)).toEqual([
      "inbox",
      "archive",
      "spam",
      "trash",
    ]);
  });

  it("never moves sent mail to the inbox or spam", () => {
    expect(system_move_targets("sent", all)).toEqual(["archive", "trash"]);
  });

  it("drops targets without a handler", () => {
    expect(system_move_targets("folder", { inbox: true, trash: true })).toEqual(
      ["inbox", "trash"],
    );
  });
});
