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
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { open_external, reset_open_external_state } from "@/utils/open_link";

const invoke = vi.fn(async (..._args: unknown[]) => undefined);

vi.mock("@/lib/public_origin", () => ({
  public_web_url: (url: string) => url,
}));

const CALENDAR_URL = "https://calendar.example.org/";

let clock = 0;

async function expect_opens(count: number): Promise<void> {
  await vi.waitFor(() => {
    expect(invoke).toHaveBeenCalledTimes(count);
  });
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(invoke).toHaveBeenCalledTimes(count);
}

describe("open_external in the desktop shell", () => {
  beforeEach(() => {
    clock = 1_000_000;
    vi.spyOn(Date, "now").mockImplementation(() => clock);
    invoke.mockClear();
    reset_open_external_state();
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {
      invoke,
    };
  });

  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
    vi.restoreAllMocks();
  });

  it("opens a link once when two requests arrive together", async () => {
    open_external(CALENDAR_URL);
    open_external(CALENDAR_URL);
    await expect_opens(1);

    expect(invoke.mock.calls[0].slice(0, 2)).toEqual([
      "open_external_url",
      { url: CALENDAR_URL },
    ]);
  });

  it("opens the same link again after the repeat window", async () => {
    open_external(CALENDAR_URL);
    clock += 1500;
    open_external(CALENDAR_URL);
    await expect_opens(2);
  });

  it("measures the repeat window from the last link that opened", async () => {
    open_external(CALENDAR_URL);
    clock += 700;
    open_external(CALENDAR_URL);
    clock += 700;
    open_external(CALENDAR_URL);
    await expect_opens(2);
  });

  it("opens two different links requested together", async () => {
    open_external(CALENDAR_URL);
    open_external("https://mail.example.org/");
    await expect_opens(2);
  });
});
