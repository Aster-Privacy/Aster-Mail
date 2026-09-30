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

import { RailTipLayer } from "./rail_tip_layer";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe("rail tip layer", () => {
  let container: HTMLDivElement;
  let root: Root;
  let trigger: HTMLButtonElement;

  const tip_text = () =>
    document.getElementById("aster_rail_tip")?.textContent ?? null;

  beforeEach(async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    trigger = document.createElement("button");
    trigger.setAttribute("data-rail-tip", "Security Center");
    trigger.setAttribute("data-rail-tip-side", "left");
    document.body.appendChild(trigger);
    root = createRoot(container);
    await act(async () => {
      root.render(<RailTipLayer />);
    });
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    trigger.remove();
  });

  it("shows the tip when the trigger takes focus", async () => {
    await act(async () => {
      trigger.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    });

    expect(tip_text()).toBe("Security Center");
  });

  it("hides the tip when the trigger drops its tip text", async () => {
    await act(async () => {
      trigger.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    });

    expect(tip_text()).toBe("Security Center");

    await act(async () => {
      trigger.removeAttribute("data-rail-tip");
      await Promise.resolve();
    });

    expect(tip_text()).toBeNull();
  });
});
