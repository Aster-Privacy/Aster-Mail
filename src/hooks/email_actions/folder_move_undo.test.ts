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
import { describe, expect, it } from "vitest";

import { plan_folder_move_undo } from "./folder_move_undo";

describe("plan_folder_move_undo", () => {
  it("removes the new folder and restores the one it came from", () => {
    expect(plan_folder_move_undo(["work"], "travel", "work")).toEqual({
      remove_token: "travel",
      restore_token: "work",
    });
  });

  it("only removes the new folder for mail that was in no folder", () => {
    expect(plan_folder_move_undo([], "travel", undefined)).toEqual({
      remove_token: "travel",
      restore_token: undefined,
    });
  });

  it("keeps a folder the message already had", () => {
    expect(plan_folder_move_undo(["travel", "work"], "travel", undefined)).toEqual(
      {
        remove_token: undefined,
        restore_token: undefined,
      },
    );
  });

  it("does not restore when the source and target are the same", () => {
    expect(plan_folder_move_undo(["travel"], "travel", "travel")).toEqual({
      remove_token: undefined,
      restore_token: undefined,
    });
  });
});
