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

import { build_forced_dark_mode_css } from "@/lib/email_body_styles";

function summary_selector(): string {
  const selector = build_forced_dark_mode_css()
    .split(/[,{]/)
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith("summary:not("));

  if (!selector) throw new Error("summary selector missing");

  return selector;
}

describe("forced dark quote toggle", () => {
  it("keeps the quote toggle pill background", () => {
    const toggle = document.createElement("summary");

    toggle.className = "aster-quote-toggle";
    expect(toggle.matches(summary_selector())).toBe(false);
  });

  it("still neutralizes other summaries", () => {
    expect(document.createElement("summary").matches(summary_selector())).toBe(
      true,
    );
  });
});
