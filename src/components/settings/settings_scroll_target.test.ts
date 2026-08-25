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
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import {
  find_scroll_target,
  start_scroll_seek,
} from "./settings_scroll_target";

describe("find_scroll_target", () => {
  it("finds the element that renders the setting label", () => {
    const container = document.createElement("div");

    container.innerHTML = "<div><span>Undo send</span></div>";

    const target = find_scroll_target(container, "undo send");

    expect(target?.tagName).toBe("SPAN");
  });

  it("ignores text inside form controls and scripts", () => {
    const container = document.createElement("div");

    container.innerHTML =
      "<textarea>Undo send</textarea><p>Undo send delay</p>";

    const target = find_scroll_target(container, "undo send");

    expect(target?.tagName).toBe("P");
  });

  it("returns nothing when the label is not on screen", () => {
    const container = document.createElement("div");

    container.innerHTML = "<p>Signature</p>";

    expect(find_scroll_target(container, "Undo send")).toBeNull();
  });
});

describe("start_scroll_seek", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("waits for a lazily loaded section to render the setting", () => {
    const container = document.createElement("div");
    const on_settled = vi.fn();

    start_scroll_seek(container, "Create rule", on_settled);

    vi.advanceTimersByTime(500);
    expect(on_settled).not.toHaveBeenCalled();

    container.innerHTML = "<button>Create rule</button>";
    vi.advanceTimersByTime(200);

    expect(on_settled).toHaveBeenCalledTimes(1);
    expect(on_settled.mock.calls[0][0]?.tagName).toBe("BUTTON");
  });

  it("gives up instead of retrying forever", () => {
    const container = document.createElement("div");
    const on_settled = vi.fn();

    start_scroll_seek(container, "Never rendered", on_settled);
    vi.advanceTimersByTime(30000);

    expect(on_settled).toHaveBeenCalledTimes(1);
    expect(on_settled).toHaveBeenCalledWith(null);
  });

  it("stops seeking once cancelled", () => {
    const container = document.createElement("div");
    const on_settled = vi.fn();

    const cancel = start_scroll_seek(container, "Create rule", on_settled);

    cancel();
    container.innerHTML = "<button>Create rule</button>";
    vi.advanceTimersByTime(30000);

    expect(on_settled).not.toHaveBeenCalled();
  });
});
