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

import { active_reading_pane, reading_pane_patch } from "@/lib/reading_pane";

describe("reading_pane_patch", () => {
  it("switches to split view when choosing a visible pane", () => {
    expect(reading_pane_patch({ email_view_mode: "popup" }, "bottom")).toEqual({
      reading_pane_position: "bottom",
      email_view_mode: "split",
    });
    expect(
      reading_pane_patch({ email_view_mode: "fullpage" }, "right"),
    ).toEqual({ reading_pane_position: "right", email_view_mode: "split" });
  });

  it("keeps the view mode when already split", () => {
    expect(reading_pane_patch({ email_view_mode: "split" }, "bottom")).toEqual(
      { reading_pane_position: "bottom" },
    );
  });

  it("never changes the view mode when hiding the pane", () => {
    expect(reading_pane_patch({ email_view_mode: "popup" }, "hidden")).toEqual(
      { reading_pane_position: "hidden" },
    );
  });
});

describe("active_reading_pane", () => {
  it("reports hidden outside split view", () => {
    expect(
      active_reading_pane({
        email_view_mode: "popup",
        reading_pane_position: "bottom",
      }),
    ).toBe("hidden");
    expect(
      active_reading_pane({
        email_view_mode: "split",
        reading_pane_position: "bottom",
      }),
    ).toBe("bottom");
  });
});
