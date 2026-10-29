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

import { build_measurement_controls } from "./measurement_controls";

class StubResizeObserver {
  observe(): void {}
  disconnect(): void {}
}

const mount = () => {
  const doc = document.implementation.createHTMLDocument("");
  const body = doc.body;
  let content_height = 900;
  let selection_collapsed = true;

  Object.defineProperty(body, "scrollHeight", {
    configurable: true,
    get: () => content_height,
  });
  doc.getSelection = () =>
    ({ isCollapsed: selection_collapsed }) as unknown as Selection;

  const frame_window = new EventTarget() as EventTarget & {
    ResizeObserver: typeof StubResizeObserver;
    getComputedStyle: (el: HTMLElement) => Partial<CSSStyleDeclaration>;
  };

  frame_window.ResizeObserver = StubResizeObserver;
  frame_window.getComputedStyle = () => ({ zoom: "1" });

  const iframe = {
    clientWidth: 0,
    contentDocument: doc,
    contentWindow: frame_window,
    parentElement: null,
    style: { height: "" },
  } as unknown as HTMLIFrameElement;
  const set_iframe_height = vi.fn();
  const controls = build_measurement_controls({
    iframe,
    email_id: undefined,
    base_zoom_ref: { current: 1 },
    document_ready_cleanup_ref: { current: null },
    has_fired_ready_ref: { current: false },
    mutation_observer_ref: { current: null },
    observer_ref: { current: null },
    raf_ref: { current: 0 },
    remeasure_ref: { current: null },
    on_document_ready_ref: { current: undefined },
    set_height_ready: vi.fn(),
    set_iframe_height,
  });

  controls.attach_observer();

  return {
    doc,
    controls,
    set_iframe_height,
    set_content_height: (value: number) => {
      content_height = value;
    },
    select_text: () => {
      selection_collapsed = false;
    },
  };
};

const last_height = (spy: ReturnType<typeof vi.fn>) =>
  spy.mock.calls[spy.mock.calls.length - 1]?.[0];

describe("remeasuring the email frame while text is selected", () => {
  beforeEach(() => {
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      cb(0);

      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", () => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shrinks the frame when quoted text collapses under a kept selection", () => {
    const frame = mount();

    expect(last_height(frame.set_iframe_height)).toBe("908px");

    frame.select_text();
    frame.set_content_height(300);
    frame.controls.update_height();

    expect(last_height(frame.set_iframe_height)).toBe("308px");
  });

  it("waits for the pointer to lift while the reader drags a selection", () => {
    const frame = mount();

    frame.doc.dispatchEvent(new MouseEvent("pointerdown", { button: 0 }));
    frame.select_text();
    frame.set_content_height(300);
    frame.controls.update_height();

    expect(last_height(frame.set_iframe_height)).toBe("908px");

    frame.doc.dispatchEvent(new MouseEvent("pointerup", { button: 0 }));

    expect(last_height(frame.set_iframe_height)).toBe("308px");
  });

  it("releases a held measurement when the pointer lifts outside the frame", () => {
    const frame = mount();

    frame.doc.dispatchEvent(new MouseEvent("pointerdown", { button: 0 }));
    frame.select_text();
    frame.set_content_height(300);
    frame.controls.update_height();
    window.dispatchEvent(new MouseEvent("pointerup", { button: 0 }));

    expect(last_height(frame.set_iframe_height)).toBe("308px");
  });
});
