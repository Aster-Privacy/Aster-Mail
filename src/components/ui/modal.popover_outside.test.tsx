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
import { describe, it, expect, vi, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key, language: "en" }),
}));

const { Modal, ModalHeader, ModalTitle } = await import("./modal");
const { Popover, PopoverContent, PopoverTrigger } = await import("./popover");

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
});

async function press(target: Element) {
  await act(async () => {
    target.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        cancelable: true,
        button: 0,
        pointerType: "mouse",
      }),
    );
    target.dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true, button: 0 }),
    );
    target.dispatchEvent(
      new PointerEvent("pointerup", {
        bubbles: true,
        button: 0,
        pointerType: "mouse",
      }),
    );
    target.dispatchEvent(
      new MouseEvent("mouseup", { bubbles: true, button: 0 }),
    );
    target.dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0 }));
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
}

describe("Modal with a popover inside", () => {
  it("closes the popover when clicking elsewhere in the modal", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root!.render(
        <Modal is_open on_close={() => {}}>
          <ModalHeader>
            <ModalTitle>modal title</ModalTitle>
          </ModalHeader>
          <Popover>
            <PopoverTrigger>open popover</PopoverTrigger>
            <PopoverContent>popover body</PopoverContent>
          </Popover>
        </Modal>,
      );
    });

    const trigger = [...document.querySelectorAll("button")].find(
      (button) => button.textContent === "open popover",
    )!;

    await act(async () => {
      trigger.click();
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    expect(document.body.textContent).toContain("popover body");

    await press(document.querySelector("h3")!);

    expect(document.body.textContent).not.toContain("popover body");
    expect(document.body.textContent).toContain("modal title");
  });
});
