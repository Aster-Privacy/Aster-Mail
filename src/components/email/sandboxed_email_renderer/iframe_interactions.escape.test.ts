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

import { attach_iframe_interactions } from "./iframe_interactions";

function mount_message(): Document {
  const iframe = document.createElement("iframe");

  document.body.appendChild(iframe);

  const frame_doc = document.implementation.createHTMLDocument("message");

  frame_doc.body.innerHTML = "<p>Hello</p>";
  attach_iframe_interactions(iframe, frame_doc, frame_doc.body, () => {}, {
    current: null,
  });

  return frame_doc;
}

function press_in_frame(
  frame_doc: Document,
  init: KeyboardEventInit,
): KeyboardEvent {
  const event = new KeyboardEvent("keydown", {
    bubbles: true,
    cancelable: true,
    ...init,
  });

  frame_doc.body.dispatchEvent(event);

  return event;
}

describe("Escape inside a message frame", () => {
  const host_listener = vi.fn((e: KeyboardEvent) => {
    if (!(e.target instanceof Node)) forwarded.push(e);
  });
  let forwarded: KeyboardEvent[] = [];

  afterEach(() => {
    window.removeEventListener("keydown", host_listener);
    host_listener.mockClear();
    forwarded = [];
    document.body.innerHTML = "";
  });

  it("passes Escape to the app so the popup can close", () => {
    window.addEventListener("keydown", host_listener);
    const frame_doc = mount_message();

    press_in_frame(frame_doc, { key: "Escape" });

    expect(forwarded).toHaveLength(1);
    expect(forwarded[0].key).toBe("Escape");
    expect(forwarded[0].cancelable).toBe(true);
  });

  it("keeps Escape inside the frame when something there handled it", () => {
    window.addEventListener("keydown", host_listener);
    const frame_doc = mount_message();

    frame_doc.body.addEventListener("keydown", (e) => e.preventDefault(), {
      capture: true,
    });
    press_in_frame(frame_doc, { key: "Escape" });

    expect(forwarded).toHaveLength(0);
  });

  it("ignores Escape with a modifier and other keys", () => {
    window.addEventListener("keydown", host_listener);
    const frame_doc = mount_message();

    press_in_frame(frame_doc, { key: "Escape", shiftKey: true });
    press_in_frame(frame_doc, { key: "u" });

    expect(forwarded).toHaveLength(0);
  });
});
