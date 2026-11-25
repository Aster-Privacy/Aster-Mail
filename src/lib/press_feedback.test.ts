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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  PRESS_ATTRIBUTE,
  PRESS_MIN_HOLD_MS,
  PRESS_RELEASE_MS,
  PRESS_SLOP_PX,
  find_press_target,
  ripple_geometry,
  start_press_feedback,
} from "./press_feedback";

function pointer(
  type: string,
  target: Element,
  pointer_type = "mouse",
  x = 0,
  y = 0,
) {
  const event = new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    button: 0,
    pointerId: 1,
    pointerType: pointer_type,
    clientX: x,
    clientY: y,
  });

  target.dispatchEvent(event);

  return event;
}

function mouse_down(target: Element, detail: number) {
  const event = new MouseEvent("mousedown", {
    bubbles: true,
    cancelable: true,
    button: 0,
    detail,
  });

  target.dispatchEvent(event);

  return event;
}

describe("press_feedback", () => {
  let stop: () => void;
  let button: HTMLButtonElement;
  let clicks: number;

  beforeEach(() => {
    vi.useFakeTimers({
      toFake: ["setTimeout", "clearTimeout", "performance"],
    });
    document.body.innerHTML = `
      <button id="menu"><span id="icon">i</span></button>
      <button id="other">o</button>
      <button id="off" disabled>x</button>
      <div id="body"><p id="text">hello world</p></div>
      <div contenteditable="true"><button id="inside_editor">b</button></div>
      <textarea id="area"></textarea>
      <div role="switch" id="toggle" tabindex="0"></div>
      <button id="code_button"><span id="code" class="select-text">123456</span></button>
      <div role="button" id="strip" data-press-skip tabindex="0"><span id="strip_gap">g</span><button id="strip_action">a</button></div>
      <div style="opacity: 0"><button id="hidden_action">h</button></div>
    `;
    button = document.getElementById("menu") as HTMLButtonElement;
    clicks = 0;
    button.addEventListener("click", () => {
      clicks += 1;
    });
    stop = start_press_feedback();
  });

  afterEach(() => {
    stop();
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  it("marks the innermost control on pointer down", () => {
    pointer("pointerdown", document.getElementById("icon")!);

    expect(button.getAttribute(PRESS_ATTRIBUTE)).toBe("down");
  });

  it("holds a quick press for the minimum duration", () => {
    pointer("pointerdown", button);
    pointer("pointerup", button);

    expect(button.getAttribute(PRESS_ATTRIBUTE)).toBe("down");
    vi.advanceTimersByTime(PRESS_MIN_HOLD_MS - 1);
    expect(button.getAttribute(PRESS_ATTRIBUTE)).toBe("down");
    vi.advanceTimersByTime(1);
    expect(button.getAttribute(PRESS_ATTRIBUTE)).toBe("release");
    vi.advanceTimersByTime(PRESS_RELEASE_MS);
    expect(button.hasAttribute(PRESS_ATTRIBUTE)).toBe(false);
  });

  it("restarts cleanly on rapid clicks and never sticks", () => {
    for (let i = 0; i < 5; i += 1) {
      pointer("pointerdown", button);
      expect(button.getAttribute(PRESS_ATTRIBUTE)).toBe("down");
      pointer("pointerup", button);
      button.click();
      vi.advanceTimersByTime(100);
    }

    expect(clicks).toBe(5);
    vi.advanceTimersByTime(PRESS_MIN_HOLD_MS + PRESS_RELEASE_MS);
    expect(button.hasAttribute(PRESS_ATTRIBUTE)).toBe(false);
  });

  it("moves the press to a new control", () => {
    const other = document.getElementById("other")!;

    pointer("pointerdown", button);
    pointer("pointerup", button);
    pointer("pointerdown", other);

    expect(button.hasAttribute(PRESS_ATTRIBUTE)).toBe(false);
    expect(other.getAttribute(PRESS_ATTRIBUTE)).toBe("down");
  });

  it("clears the press on pointer cancel", () => {
    pointer("pointerdown", button);
    pointer("pointercancel", button);

    expect(button.hasAttribute(PRESS_ATTRIBUTE)).toBe(false);
  });

  it("never cancels pointer events", () => {
    const event = pointer("pointerdown", button);

    expect(event.defaultPrevented).toBe(false);
  });

  it("ignores disabled controls and editable areas", () => {
    expect(find_press_target(document.getElementById("off"))).toBeNull();
    expect(
      find_press_target(document.getElementById("inside_editor")),
    ).toBeNull();
    expect(find_press_target(document.getElementById("area"))).toBeNull();
    expect(find_press_target(document.getElementById("text"))).toBeNull();
  });

  it("blocks multi-click selection on controls only", () => {
    expect(mouse_down(button, 1).defaultPrevented).toBe(false);
    expect(mouse_down(button, 2).defaultPrevented).toBe(true);
    expect(mouse_down(button, 3).defaultPrevented).toBe(true);
    expect(
      mouse_down(document.getElementById("text")!, 2).defaultPrevented,
    ).toBe(false);
    expect(
      mouse_down(document.getElementById("area")!, 3).defaultPrevented,
    ).toBe(false);
  });

  it("presses on keyboard activation", () => {
    button.focus();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    expect(button.getAttribute(PRESS_ATTRIBUTE)).toBe("down");
    document.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter" }));
    vi.advanceTimersByTime(PRESS_MIN_HOLD_MS + PRESS_RELEASE_MS);
    expect(button.hasAttribute(PRESS_ATTRIBUTE)).toBe(false);
  });

  it("delays the touch press so scrolls do not flash", () => {
    pointer("pointerdown", button, "touch");
    expect(button.hasAttribute(PRESS_ATTRIBUTE)).toBe(false);
    pointer("pointercancel", button, "touch");
    vi.advanceTimersByTime(200);
    expect(button.hasAttribute(PRESS_ATTRIBUTE)).toBe(false);
  });

  it("shows a quick tap immediately", () => {
    pointer("pointerdown", button, "touch");
    pointer("pointerup", button, "touch");
    expect(button.getAttribute(PRESS_ATTRIBUTE)).toBe("down");
  });

  it("cancels the press when the pointer moves past the slop", () => {
    pointer("pointerdown", button, "mouse", 10, 10);
    pointer("pointermove", button, "mouse", 13, 12);
    expect(button.getAttribute(PRESS_ATTRIBUTE)).toBe("down");
    pointer("pointermove", button, "mouse", 10 + PRESS_SLOP_PX + 1, 10);
    expect(button.hasAttribute(PRESS_ATTRIBUTE)).toBe(false);
  });

  it("cancels the press when the page scrolls", () => {
    pointer("pointerdown", button);
    document.dispatchEvent(new Event("scroll"));
    expect(button.hasAttribute(PRESS_ATTRIBUTE)).toBe(false);
  });

  it("presses switches and keeps marked text selectable", () => {
    pointer("pointerdown", document.getElementById("toggle")!);
    expect(
      document.getElementById("toggle")!.getAttribute(PRESS_ATTRIBUTE),
    ).toBe("down");
    expect(
      mouse_down(document.getElementById("code")!, 2).defaultPrevented,
    ).toBe(false);
    expect(
      mouse_down(document.getElementById("code_button")!, 2).defaultPrevented,
    ).toBe(true);
  });

  it("presses row actions but not their strip or hidden actions", () => {
    expect(find_press_target(document.getElementById("strip_gap"))).toBeNull();
    expect(find_press_target(document.getElementById("strip_action"))).toBe(
      document.getElementById("strip_action"),
    );
    expect(
      find_press_target(document.getElementById("hidden_action")),
    ).toBeNull();
  });

  it("grows the ripple from the press point to cover the target", () => {
    const g = ripple_geometry(200, 40, 30, 10);

    expect([g.from_x, g.from_y, g.to_x, g.to_y]).toEqual([30, 10, 100, 20]);
    expect(g.from_r).toBeCloseTo(20);
    expect(g.to_r * 0.65).toBeGreaterThanOrEqual(Math.hypot(100, 20) - 0.001);
  });

  it("starts keyboard ripples at the center and clamps stray points", () => {
    const centered = ripple_geometry(40, 40, null, null);
    const clamped = ripple_geometry(40, 40, -5, 90);

    expect([centered.from_x, centered.from_y]).toEqual([20, 20]);
    expect([clamped.from_x, clamped.from_y]).toEqual([0, 40]);
  });
});
