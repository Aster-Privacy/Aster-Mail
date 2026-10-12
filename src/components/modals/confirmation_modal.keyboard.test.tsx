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
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { ConfirmationModal } from "./confirmation_modal";

import { I18nProvider } from "@/lib/i18n/context";

(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function find_button(name: string) {
  return Array.from(document.body.querySelectorAll("button")).find(
    (button) => button.textContent?.trim() === name,
  );
}

async function settle(ms = 60) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

describe("confirmation modal keyboard confirm", () => {
  let container: HTMLDivElement;
  let root: Root;
  let trigger: HTMLButtonElement;

  beforeEach(() => {
    container = document.createElement("div");
    trigger = document.createElement("button");
    document.body.appendChild(trigger);
    document.body.appendChild(container);
    root = createRoot(container);
    trigger.focus();
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    trigger.remove();
  });

  async function render(on_confirm: () => void, on_cancel: () => void) {
    await act(async () => {
      root.render(
        <I18nProvider default_language="en">
          <ConfirmationModal
            cancel_text="Cancel"
            confirm_text="Delete"
            is_open={true}
            message="Delete this draft?"
            on_cancel={on_cancel}
            on_confirm={on_confirm}
            title="Delete Draft"
            variant="danger"
          />
        </I18nProvider>,
      );
    });
    await settle();
  }

  it("moves focus to the confirm button when it opens", async () => {
    await render(vi.fn(), vi.fn());

    const confirm = find_button("Delete");

    expect(confirm).toBeDefined();
    expect(document.activeElement).toBe(confirm);
  });

  it("confirms once when the focused button is activated", async () => {
    const on_confirm = vi.fn();
    const on_cancel = vi.fn();

    await render(on_confirm, on_cancel);

    await act(async () => {
      (document.activeElement as HTMLElement).click();
    });
    await settle(250);

    expect(on_confirm).toHaveBeenCalledTimes(1);
    expect(on_cancel).not.toHaveBeenCalled();
  });

  it("blocks a held Enter key from confirming", async () => {
    await render(vi.fn(), vi.fn());

    const held = new KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
      cancelable: true,
      repeat: true,
    });
    const fresh = new KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
      cancelable: true,
    });

    act(() => {
      document.activeElement!.dispatchEvent(held);
      document.activeElement!.dispatchEvent(fresh);
    });

    expect(held.defaultPrevented).toBe(true);
    expect(fresh.defaultPrevented).toBe(false);
  });
});
