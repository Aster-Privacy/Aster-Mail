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
import { afterEach, describe, expect, it } from "vitest";

import {
  get_action_toast_box,
  publish_action_toast_box,
  stack_clear_of_action_toast,
} from "./toast_offset";

const BOTTOM = {
  anchor: "inset-x-0 mx-auto w-fit",
  align: "items-center",
  column: "flex-col-reverse",
  style: { bottom: "24px" },
};

const TOP = {
  anchor: "right-4",
  align: "items-end",
  column: "flex-col",
  style: { top: "12px" },
};

afterEach(() => publish_action_toast_box(null));

describe("stack_clear_of_action_toast", () => {
  it("leaves the layout alone without an action toast", () => {
    expect(stack_clear_of_action_toast(BOTTOM, null)).toBe(BOTTOM);
  });

  it("lifts bottom toasts above a visible action toast", () => {
    const layout = stack_clear_of_action_toast(BOTTOM, {
      height: 44,
      edge: "24px",
      is_top: false,
    });

    expect(layout.style).toEqual({ bottom: "calc(24px + 52px)" });
    expect(layout.anchor).toBe(BOTTOM.anchor);
  });

  it("lowers top toasts below a visible action toast", () => {
    const layout = stack_clear_of_action_toast(TOP, {
      height: 40,
      edge: "12px",
      is_top: true,
    });

    expect(layout.style).toEqual({ top: "calc(12px + 48px)" });
  });

  it("ignores an action toast on the other edge", () => {
    expect(
      stack_clear_of_action_toast(BOTTOM, {
        height: 40,
        edge: "12px",
        is_top: true,
      }),
    ).toBe(BOTTOM);
  });

  it("stacks above a lifted action toast", () => {
    const layout = stack_clear_of_action_toast(BOTTOM, {
      height: 44,
      edge: "80px",
      is_top: false,
    });

    expect(layout.style).toEqual({ bottom: "calc(80px + 52px)" });
  });
});

describe("publish_action_toast_box", () => {
  it("skips republishing an identical box", () => {
    publish_action_toast_box({ height: 40, edge: "24px", is_top: false });
    const first = get_action_toast_box();

    publish_action_toast_box({ height: 40, edge: "24px", is_top: false });
    expect(get_action_toast_box()).toBe(first);
  });
});
