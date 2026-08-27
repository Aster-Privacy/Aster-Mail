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
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { Popover, PopoverContent } from "@/components/ui/popover";
import { has_open_overlay_layer } from "@/lib/overlay_layer_stack";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function Harness({ open }: { open: boolean }) {
  return (
    <Popover open={open}>
      <PopoverContent>
        <span>panel</span>
      </PopoverContent>
    </Popover>
  );
}

describe("PopoverContent overlay layer registration", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("claims no overlay layer while the popover is closed", () => {
    act(() => root.render(<Harness open={false} />));

    expect(has_open_overlay_layer()).toBe(false);
  });

  it("claims an overlay layer only while the popover is open", () => {
    act(() => root.render(<Harness open={false} />));
    expect(has_open_overlay_layer()).toBe(false);

    act(() => root.render(<Harness open={true} />));
    expect(has_open_overlay_layer()).toBe(true);

    act(() => root.render(<Harness open={false} />));
    expect(has_open_overlay_layer()).toBe(false);
  });
});
