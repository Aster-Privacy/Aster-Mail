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
  CANCEL_HELP_URL,
  EARLY_CANCEL_WINDOW_HOURS,
  is_early_cancel,
} from "./cancel_early_step";

import { en } from "@/lib/i18n/translations/en";

const now = new Date("2026-09-08T12:00:00.000Z");

function hours_ago(hours: number): string {
  return new Date(now.getTime() - hours * 3_600_000).toISOString();
}

describe("is_early_cancel", () => {
  it("catches a subscription started inside the window", () => {
    expect(is_early_cancel(hours_ago(1), now)).toBe(true);
    expect(is_early_cancel(hours_ago(71), now)).toBe(true);
  });

  it("leaves an older subscription alone", () => {
    expect(is_early_cancel(hours_ago(EARLY_CANCEL_WINDOW_HOURS), now)).toBe(
      false,
    );
    expect(is_early_cancel(hours_ago(24 * 30), now)).toBe(false);
  });

  it("ignores a missing or unreadable start date", () => {
    expect(is_early_cancel(null, now)).toBe(false);
    expect(is_early_cancel(undefined, now)).toBe(false);
    expect(is_early_cancel("", now)).toBe(false);
    expect(is_early_cancel("not a date", now)).toBe(false);
  });

  it("ignores a start date in the future", () => {
    expect(is_early_cancel(hours_ago(-2), now)).toBe(false);
  });
});

describe("early cancel copy", () => {
  it("carries no retention offer", () => {
    const copy = [
      en.settings.cancel_early_title,
      en.settings.cancel_early_description,
      en.settings.cancel_early_body,
      en.settings.cancel_early_help,
      en.settings.cancel_early_continue,
    ];

    for (const line of copy) {
      expect(line).toBeTruthy();
      expect(line.toLowerCase()).not.toMatch(
        /discount|free month|refund|special offer|stay with us/,
      );
    }
  });

  it("points at the help center over https", () => {
    expect(CANCEL_HELP_URL.startsWith("https://")).toBe(true);
  });
});
