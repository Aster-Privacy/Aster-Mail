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
import type { MouseEvent } from "react";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const desktop_state = vi.hoisted(() => ({ value: false }));

vi.mock("@/native/invoke_bridge", () => ({
  is_desktop: () => desktop_state.value,
}));

import { new_tab_handlers } from "@/components/layout/sidebar/new_tab_target";

function make_event(init: Partial<MouseEvent>) {
  return {
    button: 0,
    ctrlKey: false,
    metaKey: false,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    ...init,
  } as unknown as MouseEvent;
}

describe("new_tab_handlers", () => {
  let open_spy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    desktop_state.value = false;
    open_spy = vi.spyOn(window, "open").mockImplementation(() => null);
  });

  afterEach(() => {
    open_spy.mockRestore();
  });

  it("opens the folder in a new tab on middle click", () => {
    const handlers = new_tab_handlers("/sent");
    const event = make_event({ button: 1 });

    handlers.onAuxClick?.(event);

    expect(open_spy).toHaveBeenCalledWith(
      `${window.location.origin}/sent`,
      "_blank",
      "noopener",
    );
    expect(event.preventDefault).toHaveBeenCalled();
    expect(event.stopPropagation).toHaveBeenCalled();
  });

  it("stops middle button autoscroll on mouse down", () => {
    const event = make_event({ button: 1 });

    new_tab_handlers("/sent").onMouseDown?.(event);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(open_spy).not.toHaveBeenCalled();
  });

  it("opens a new tab on ctrl or cmd click and blocks in-app navigation", () => {
    const handlers = new_tab_handlers("/tag/abc");
    const ctrl_event = make_event({ ctrlKey: true });
    const meta_event = make_event({ metaKey: true });

    handlers.onClickCapture?.(ctrl_event);
    handlers.onClickCapture?.(meta_event);

    expect(open_spy).toHaveBeenCalledTimes(2);
    expect(ctrl_event.stopPropagation).toHaveBeenCalled();
    expect(meta_event.stopPropagation).toHaveBeenCalled();
  });

  it("leaves a plain left click to the router", () => {
    const event = make_event({});

    new_tab_handlers("/sent").onClickCapture?.(event);

    expect(open_spy).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it("ignores right click", () => {
    const event = make_event({ button: 2 });

    new_tab_handlers("/sent").onAuxClick?.(event);

    expect(open_spy).not.toHaveBeenCalled();
  });

  it("does nothing without a path or in the desktop app", () => {
    expect(new_tab_handlers(null)).toEqual({});
    desktop_state.value = true;
    expect(new_tab_handlers("/sent")).toEqual({});
  });
});
