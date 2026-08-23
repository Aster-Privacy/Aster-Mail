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
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { LinkDialog } from "@/components/compose/link_dialog";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({
    t: (key: string) => key,
  }),
}));

describe("LinkDialog", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    globalThis.requestAnimationFrame = ((callback: FrameRequestCallback) => {
      callback(0);

      return 0;
    }) as typeof requestAnimationFrame;
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
  });

  it("closes the dialog after inserting so it can be opened again", () => {
    const on_close = vi.fn();
    const on_insert = vi.fn();

    act(() => {
      root.render(
        <LinkDialog
          open={true}
          on_close={on_close}
          on_insert={on_insert}
          selected_text=""
        />,
      );
    });

    const url_input = document.querySelector(
      "#link-dialog-url",
    ) as HTMLInputElement;

    expect(url_input).toBeTruthy();

    act(() => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set;

      setter?.call(url_input, "https://example.com");
      url_input.dispatchEvent(new Event("input", { bubbles: true }));
    });

    const insert_button = Array.from(
      document.querySelectorAll("button"),
    ).find((button) => button.textContent === "mail.insert_link");

    expect(insert_button).toBeTruthy();

    act(() => {
      insert_button?.click();
    });

    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(on_insert).toHaveBeenCalledTimes(1);
    expect(on_close).toHaveBeenCalledTimes(1);
  });
});
