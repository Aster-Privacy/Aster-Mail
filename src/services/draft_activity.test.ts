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
import { beforeEach, describe, expect, it } from "vitest";

import {
  DRAFT_ACTIVITY_WINDOW_MS,
  begin_draft_write,
  end_draft_write,
  is_draft_busy,
  note_draft_activity,
  register_open_draft_check,
  reset_draft_activity,
} from "./draft_activity";

describe("draft activity", () => {
  beforeEach(() => {
    reset_draft_activity();
  });

  it("treats a draft as busy while a save is in flight", () => {
    begin_draft_write("d", 0);

    expect(is_draft_busy("d", DRAFT_ACTIVITY_WINDOW_MS * 10)).toBe(true);

    end_draft_write("d", 0);

    expect(is_draft_busy("d", DRAFT_ACTIVITY_WINDOW_MS * 10)).toBe(false);
  });

  it("treats a recently saved draft as busy for the activity window", () => {
    note_draft_activity("d", 1_000);

    expect(is_draft_busy("d", 1_000 + DRAFT_ACTIVITY_WINDOW_MS - 1)).toBe(true);
    expect(is_draft_busy("d", 1_000 + DRAFT_ACTIVITY_WINDOW_MS)).toBe(false);
  });

  it("asks the open draft checks", () => {
    const unregister = register_open_draft_check((id) => id === "open");

    expect(is_draft_busy("open", 0)).toBe(true);
    expect(is_draft_busy("other", 0)).toBe(false);

    unregister();

    expect(is_draft_busy("open", 0)).toBe(false);
  });
});
