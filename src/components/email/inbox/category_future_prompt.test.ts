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
  future_done_message,
  future_prompt_message,
} from "@/components/email/inbox/category_future_prompt";

function t(key: string, params?: Record<string, string | number>): string {
  return `${key}|${JSON.stringify(params ?? {})}`;
}

describe("future_prompt_message", () => {
  it("skips the question when no sender can be remembered", () => {
    expect(future_prompt_message([], "Social", t)).toBeNull();
  });

  it("names a single sender", () => {
    expect(future_prompt_message(["a@example.com"], "Social", t)).toBe(
      `mail.category_future_prompt_one|${JSON.stringify({
        sender: "a@example.com",
        category: "Social",
      })}`,
    );
  });

  it("counts several senders", () => {
    expect(
      future_prompt_message(["a@example.com", "b@example.com"], "Deals", t),
    ).toBe(
      `mail.category_future_prompt_many|${JSON.stringify({
        count: 2,
        category: "Deals",
      })}`,
    );
  });
});

describe("future_done_message", () => {
  it("confirms a single sender", () => {
    expect(future_done_message(["a@example.com"], "Social", t)).toBe(
      `mail.category_future_done_one|${JSON.stringify({
        sender: "a@example.com",
        category: "Social",
      })}`,
    );
  });

  it("confirms several senders", () => {
    expect(
      future_done_message(["a@example.com", "b@example.com"], "Social", t),
    ).toBe(
      `mail.category_future_done_many|${JSON.stringify({
        count: 2,
        category: "Social",
      })}`,
    );
  });
});
