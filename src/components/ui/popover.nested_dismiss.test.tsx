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
import { describe, it, expect, vi, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { AnimatePresence, motion } from "framer-motion";

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key, language: "en" }),
}));

const { ColorSwatchRow } = await import("./color_wheel_picker");
const { Modal } = await import("./modal");

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  document.body.innerHTML = "";
  root = null;
  container = null;
  vi.restoreAllMocks();
});

function mount() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);

  return root;
}

function color_panel() {
  return document.querySelector("[data-color-wheel-panel]");
}

function swatch() {
  return document.querySelector(
    "[data-custom-color-swatch]",
  ) as HTMLButtonElement | null;
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}

async function open_custom_color() {
  const trigger = swatch();

  expect(trigger).not.toBeNull();
  await act(async () => {
    trigger!.click();
  });
  await settle();
  expect(color_panel()).not.toBeNull();
}

function animated_host(is_open: boolean) {
  return (
    <AnimatePresence>
      {is_open && (
        <motion.div
          key="host"
          data-test-host=""
          exit={{ opacity: 0 }}
          transition={{ duration: 10 }}
        >
          <ColorSwatchRow on_change={() => {}} value="#3b82f6" />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function press_escape() {
  const target = document.activeElement ?? document.body;

  act(() => {
    target.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        cancelable: true,
      }),
    );
  });
}

describe("nested color popover dismissal", () => {
  it("unmounts the popover as soon as its host starts closing", async () => {
    const r = mount();

    act(() => {
      r.render(animated_host(true));
    });
    await open_custom_color();

    act(() => {
      r.render(animated_host(false));
    });

    expect(document.querySelector("[data-test-host]")).not.toBeNull();
    expect(color_panel()).toBeNull();
  });

  it("unmounts the popover when the owning modal closes", async () => {
    const r = mount();
    const render_modal = (is_open: boolean) => (
      <Modal is_open={is_open} on_close={() => {}}>
        <ColorSwatchRow on_change={() => {}} value="#3b82f6" />
      </Modal>
    );

    act(() => {
      r.render(render_modal(true));
    });
    await open_custom_color();

    act(() => {
      r.render(render_modal(false));
    });

    expect(color_panel()).toBeNull();
  });

  it("closes the popover when the window loses focus", async () => {
    const r = mount();

    act(() => {
      r.render(animated_host(true));
    });
    await open_custom_color();

    act(() => {
      window.dispatchEvent(new Event("blur"));
    });

    expect(color_panel()).toBeNull();
  });

  it("closes the popover when the page is hidden", async () => {
    const r = mount();

    act(() => {
      r.render(animated_host(true));
    });
    await open_custom_color();

    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(color_panel()).toBeNull();
  });

  it("closes the popover on the first Escape and the modal on the second", async () => {
    const r = mount();
    const on_close = vi.fn();

    act(() => {
      r.render(
        <Modal is_open on_close={on_close}>
          <ColorSwatchRow on_change={() => {}} value="#3b82f6" />
        </Modal>,
      );
    });
    await open_custom_color();

    press_escape();
    await settle();

    expect(color_panel()).toBeNull();
    expect(on_close).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(swatch());

    press_escape();
    await settle();

    expect(on_close).toHaveBeenCalledTimes(1);
  });
});
