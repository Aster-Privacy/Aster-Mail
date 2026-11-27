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
import type { ReactNode } from "react";

import { readFileSync } from "node:fs";

import { describe, it, expect, vi, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key }),
  use_translation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/provider", () => ({
  use_should_reduce_motion: () => true,
}));

vi.mock("@/contexts/preferences_context", () => ({
  use_preferences: () => ({ preferences: { toast_position: "bottom" } }),
}));

vi.mock("@/services/iconic_sounds", () => ({
  play_iconic_sound: () => undefined,
}));

const { SimpleToast, show_toast, dismiss_toast } =
  await import("./simple_toast");
const { ActionToast, show_action_toast, hide_action_toast } =
  await import("./action_toast");
const { TOAST_FRAME_ANCHOR } = await import("./toast_position");

const GLOBALS_CSS = readFileSync("src/styles/globals.css", "utf8");
const LONG_MESSAGE =
  "You can add up to two reactions to a message. To add another, remove one of yours.";
const CLIPPING_CLASSES = [
  "truncate",
  "line-clamp-",
  "whitespace-nowrap",
  "overflow-hidden",
  "max-w-[",
];

let root: Root | null = null;
let host: HTMLDivElement | null = null;
const shown_ids: string[] = [];

function mount(node: ReactNode): HTMLDivElement {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root?.render(node);
  });

  return host;
}

function css_rule(selector: string): string {
  const start = GLOBALS_CSS.indexOf(`${selector} {`);

  if (start < 0) throw new Error(`missing rule ${selector}`);

  return GLOBALS_CSS.slice(start, GLOBALS_CSS.indexOf("}", start));
}

function expect_no_clipping(class_name: string) {
  for (const clipping of CLIPPING_CLASSES) {
    expect(class_name).not.toContain(clipping);
  }
  expect(class_name).not.toMatch(/(^|\s)h-\[?\d/);
}

afterEach(() => {
  act(() => {
    shown_ids.splice(0).forEach((id) => dismiss_toast(id));
    hide_action_toast();
  });
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

describe("toast frame css", () => {
  it("bounds the frame to the viewport minus the safe areas", () => {
    expect(css_rule(".aster_toast_frame")).toContain(
      "max-width: var(--aster-toast-max-width)",
    );
    expect(GLOBALS_CSS).toMatch(/--aster-toast-max-width:[^;]*100vw/);
    expect(GLOBALS_CSS).toMatch(
      /--aster-toast-max-width:[^;]*safe-area-inset-left[^;]*safe-area-inset-right/,
    );
  });

  it("lets simple toast text wrap without a fixed height", () => {
    const box = css_rule(".aster_simple_toast_host .bg-modal-bg.border");
    const text = css_rule(
      ".aster_simple_toast_host .bg-modal-bg.border > span.font-medium",
    );

    expect(box).toContain("max-width: 100%");
    expect(box).not.toMatch(/(^|[\s;{])height:/);
    expect(text).toContain("white-space: normal");
    expect(text).toContain("overflow-wrap: anywhere");
  });
});

describe("simple toast", () => {
  function show_simple(message: string, kind?: "error" | "success") {
    const element = mount(<SimpleToast />);

    act(() => {
      shown_ids.push(show_toast(message, kind));
    });

    return element;
  }

  it("uses the viewport-bound frame instead of a fixed width", () => {
    const element = show_simple(LONG_MESSAGE, "success");
    const frame = element.querySelector<HTMLElement>(
      ".aster_simple_toast_host > div",
    );

    expect(frame?.className).toContain(TOAST_FRAME_ANCHOR);
    expect_no_clipping(frame?.className ?? "");
  });

  it("renders the message as plain text", () => {
    const element = show_simple("<img src=x onerror=alert(1)>");
    const text = element.querySelector(
      ".bg-modal-bg.border > span.font-medium",
    );

    expect(element.querySelector("img")).toBeNull();
    expect(text?.textContent).toBe("<img src=x onerror=alert(1)>");
  });

  it("shows one close button on an error toast", () => {
    const element = show_simple(LONG_MESSAGE, "error");
    const buttons = element.querySelectorAll("button");
    const leading_path = element
      .querySelector(".bg-modal-bg.border > span:first-child > svg > path")
      ?.getAttribute("d");

    expect(buttons).toHaveLength(1);
    expect(buttons[0].getAttribute("aria-label")).toBe("common.dismiss");
    expect(GLOBALS_CSS).toContain(
      `span:first-child:has(> svg > path[d="${leading_path}"])`,
    );
  });
});

describe("action toast", () => {
  function show_action(progress?: { completed: number; total: number }) {
    const element = mount(<ActionToast />);

    act(() => {
      show_action_toast({
        message: LONG_MESSAGE,
        action_type: "archive",
        email_ids: [],
        duration_ms: 60000,
        progress,
        on_undo: progress ? undefined : async () => {},
      });
    });

    const frame = element.querySelector<HTMLElement>("div.fixed");
    const box = frame?.firstElementChild as HTMLElement | null;
    const text = box?.querySelector<HTMLElement>("span.font-medium");

    if (!frame || !box || !text) throw new Error("toast not rendered");

    return { frame, box, text };
  }

  it("wraps long text instead of clamping it", () => {
    const { frame, box, text } = show_action();

    expect(frame.className).toContain(TOAST_FRAME_ANCHOR);
    expect(box.style.maxWidth).toBe("");
    expect(box.style.height).toBe("");
    expect(text.className).toContain("[overflow-wrap:anywhere]");
    expect_no_clipping(text.className);
    expect(text.hasAttribute("title")).toBe(false);
  });

  it("keeps progress toasts wrapping and inside the viewport", () => {
    const { box, text } = show_action({ completed: 1, total: 4 });

    expect(box.style.minWidth).toContain("var(--aster-toast-max-width)");
    expect(text.className).toContain("[overflow-wrap:anywhere]");
    expect_no_clipping(text.className);
  });
});
