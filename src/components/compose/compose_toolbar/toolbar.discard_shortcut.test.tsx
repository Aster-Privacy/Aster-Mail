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
import type { ComposeToolbarState } from "@/components/compose/compose_shared";

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { ComposeToolbar } from "./toolbar";

import { I18nProvider } from "@/lib/i18n/context";

(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const noop = () => {};

const EDITOR_SELECTOR = "textarea";

function make_compose(
  overrides: Partial<ComposeToolbarState> = {},
): ComposeToolbarState {
  return {
    scheduled_time: null,
    is_scheduling: false,
    has_recipients: true,
    handle_scheduled_send: noop,
    handle_send: noop,
    is_mac: false,
    schedule_picker_element: null,
    expiration_picker_element: null,
    template_picker_element: null,
    active_formats: new Set<string>(),
    exec_format_command: noop,
    trigger_file_select: noop,
    draft_status: "idle",
    last_saved_time: null,
    handle_show_delete_confirm: null,
    ...overrides,
  };
}

function Composer({ compose }: { compose: ComposeToolbarState }) {
  return (
    <div>
      <textarea />
      <ComposeToolbar compose={compose} reduce_motion={true} />
    </div>
  );
}

function press(target: Element, init: KeyboardEventInit) {
  const event = new KeyboardEvent("keydown", {
    bubbles: true,
    cancelable: true,
    ...init,
  });

  act(() => {
    target.dispatchEvent(event);
  });

  return event;
}

describe("compose toolbar discard shortcut", () => {
  let container: HTMLDivElement;
  let root: Root;
  let outside: HTMLInputElement;

  beforeEach(() => {
    container = document.createElement("div");
    outside = document.createElement("input");
    document.body.appendChild(container);
    document.body.appendChild(outside);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    outside.remove();
  });

  async function render(node: React.ReactNode) {
    await act(async () => {
      root.render(<I18nProvider default_language="en">{node}</I18nProvider>);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }

  function editor() {
    return container.querySelector(EDITOR_SELECTOR)!;
  }

  it("opens the delete prompt on Ctrl+Shift+D inside the composer", async () => {
    const on_delete = vi.fn();

    await render(
      <Composer
        compose={make_compose({ handle_show_delete_confirm: on_delete })}
      />,
    );

    const event = press(editor(), {
      key: "D",
      code: "KeyD",
      ctrlKey: true,
      shiftKey: true,
    });

    expect(on_delete).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it("opens the delete prompt on Command+Shift+D", async () => {
    const on_delete = vi.fn();

    await render(
      <Composer
        compose={make_compose({
          handle_show_delete_confirm: on_delete,
          is_mac: true,
        })}
      />,
    );

    press(editor(), { key: "d", code: "KeyD", metaKey: true, shiftKey: true });

    expect(on_delete).toHaveBeenCalledTimes(1);
  });

  it("ignores the keys without Shift, with Alt, or on key repeat", async () => {
    const on_delete = vi.fn();

    await render(
      <Composer
        compose={make_compose({ handle_show_delete_confirm: on_delete })}
      />,
    );

    press(editor(), { key: "d", code: "KeyD", ctrlKey: true });
    press(editor(), { key: "D", code: "KeyD", shiftKey: true });
    press(editor(), {
      key: "D",
      code: "KeyD",
      ctrlKey: true,
      shiftKey: true,
      altKey: true,
    });
    press(editor(), {
      key: "D",
      code: "KeyD",
      ctrlKey: true,
      shiftKey: true,
      repeat: true,
    });

    expect(on_delete).not.toHaveBeenCalled();
  });

  it("ignores the shortcut when focus is outside the composer", async () => {
    const on_delete = vi.fn();

    await render(
      <Composer
        compose={make_compose({ handle_show_delete_confirm: on_delete })}
      />,
    );

    const event = press(outside, {
      key: "D",
      code: "KeyD",
      ctrlKey: true,
      shiftKey: true,
    });

    expect(on_delete).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it("only discards the composer that has focus", async () => {
    const first = vi.fn();
    const second = vi.fn();

    await render(
      <>
        <Composer
          compose={make_compose({ handle_show_delete_confirm: first })}
        />
        <Composer
          compose={make_compose({ handle_show_delete_confirm: second })}
        />
      </>,
    );

    const editors = container.querySelectorAll(EDITOR_SELECTOR);

    press(editors[1], {
      key: "D",
      code: "KeyD",
      ctrlKey: true,
      shiftKey: true,
    });

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("does nothing when the composer has no delete action", async () => {
    await render(<Composer compose={make_compose()} />);

    const event = press(editor(), {
      key: "D",
      code: "KeyD",
      ctrlKey: true,
      shiftKey: true,
    });

    expect(event.defaultPrevented).toBe(false);
  });

  it("shows the shortcut in the delete button tooltip", async () => {
    await render(
      <Composer compose={make_compose({ handle_show_delete_confirm: noop })} />,
    );

    const titles = Array.from(container.querySelectorAll("button")).map(
      (button) => button.getAttribute("title"),
    );

    expect(titles).toContain("Delete Draft (Ctrl+Shift+D)");
  });
});
