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

import { afterEach, describe, expect, it, vi } from "vitest";

import { is_page_hidden, yield_to_visible_page } from "./scheduling";

function set_visibility(state: DocumentVisibilityState): void {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => state,
  });
}

afterEach(() => {
  set_visibility("visible");
  vi.restoreAllMocks();
});

describe("yield_to_visible_page", () => {
  it("waits for a timer task while the page is visible", async () => {
    set_visibility("visible");
    const timer = vi.spyOn(globalThis, "setTimeout");

    await yield_to_visible_page();

    expect(is_page_hidden()).toBe(false);
    expect(timer).toHaveBeenCalledTimes(1);
  });

  it("does not wait on a throttled timer while the page is hidden", async () => {
    set_visibility("hidden");
    const timer = vi.spyOn(globalThis, "setTimeout");

    await yield_to_visible_page();

    expect(is_page_hidden()).toBe(true);
    expect(timer).not.toHaveBeenCalled();
  });
});
