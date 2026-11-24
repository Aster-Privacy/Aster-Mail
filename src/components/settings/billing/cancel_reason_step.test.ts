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

import {
  CANCEL_REASONS,
  clamp_cancel_reason_text,
  MAX_CANCEL_REASON_TEXT,
} from "./cancel_reason_step";

import { en } from "@/lib/i18n/translations/en";

describe("cancel reason placeholders", () => {
  it("gives every reason its own prompt", () => {
    const prompts = CANCEL_REASONS.map((reason) => {
      const key = `cancel_reason_placeholder_${reason}` as const;
      const prompt = en.settings[key];

      expect(prompt, `missing placeholder for ${reason}`).toBeTruthy();

      return prompt;
    });

    expect(new Set(prompts).size).toBe(CANCEL_REASONS.length);
  });
});

describe("clamp_cancel_reason_text", () => {
  it("caps the answer at the length the server accepts", () => {
    expect(clamp_cancel_reason_text("x".repeat(5000))).toHaveLength(
      MAX_CANCEL_REASON_TEXT,
    );
  });
});
