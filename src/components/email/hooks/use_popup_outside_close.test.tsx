//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
import { describe, it, expect, vi, afterEach } from "vitest";
import { act, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createPortal } from "react-dom";

import { use_popup_outside_close } from "@/components/email/hooks/use_popup_outside_close";
import { DEFAULT_PREFERENCES } from "@/services/api/preferences";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

interface HarnessProps {
  enabled: boolean;
  on_close: () => void;
  with_inline_reply?: boolean;
  with_portal_menu?: boolean;
}

function Harness({
  enabled,
  on_close,
  with_inline_reply = false,
  with_portal_menu = false,
}: HarnessProps) {
  const popup_ref = useRef<HTMLDivElement>(null);

  use_popup_outside_close({ enabled, popup_ref, on_close });

  return (
    <>
      <div data-testid="message_list">
        <span data-testid="list_row">Row</span>
      </div>
      <div ref={popup_ref} data-testid="popup">
        <p data-testid="popup_text">Message body</p>
        {with_inline_reply && <div data-inline-reply-composer="" />}
      </div>
      {with_portal_menu &&
        createPortal(
          <div data-radix-popper-content-wrapper="">
            <div data-state="open" data-testid="menu_item" role="menu">
              Move to folder
            </div>
          </div>,
          document.body,
        )}
      <div data-popup-outside-ignore="" data-testid="compose_dock">
        <div data-testid="compose_field">Compose</div>
      </div>
    </>
  );
}

let root: Root | null = null;
let host: HTMLDivElement | null = null;

function mount(props: HarnessProps) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(<Harness {...props} />);
  });
}

function by_test_id(id: string): HTMLElement {
  const node = document.querySelector(`[data-testid="${id}"]`);

  if (!(node instanceof HTMLElement)) throw new Error(`missing ${id}`);

  return node;
}

function pointer(
  type: "pointerdown" | "pointerup",
  target: Element,
  x: number,
  y: number,
  button = 0,
) {
  act(() => {
    target.dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        button,
        clientX: x,
        clientY: y,
      }),
    );
  });
}

function click(target: Element, button = 0) {
  pointer("pointerdown", target, 10, 10, button);
  pointer("pointerup", target, 10, 10, button);
}

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  document.body.style.pointerEvents = "";
});

describe("popup closes on outside click", () => {
  it("ships the setting turned off", () => {
    expect(DEFAULT_PREFERENCES.close_popup_on_outside_click).toBe(false);
  });

  it("stays open on an outside click when the setting is off", () => {
    const on_close = vi.fn();

    mount({ enabled: false, on_close });
    click(by_test_id("list_row"));

    expect(on_close).not.toHaveBeenCalled();
  });

  it("closes on an outside click when the setting is on", () => {
    const on_close = vi.fn();

    mount({ enabled: true, on_close });
    click(by_test_id("list_row"));

    expect(on_close).toHaveBeenCalledTimes(1);
  });

  it("stays open on a click inside the popup", () => {
    const on_close = vi.fn();

    mount({ enabled: true, on_close });
    click(by_test_id("popup_text"));

    expect(on_close).not.toHaveBeenCalled();
  });

  it("stays open on a click inside a menu rendered in a portal", () => {
    const on_close = vi.fn();

    mount({ enabled: true, on_close, with_portal_menu: true });
    click(by_test_id("menu_item"));

    expect(on_close).not.toHaveBeenCalled();
  });

  it("stays open while a menu or dialog layer is open elsewhere", () => {
    const on_close = vi.fn();

    mount({ enabled: true, on_close, with_portal_menu: true });
    click(by_test_id("list_row"));

    expect(on_close).not.toHaveBeenCalled();
  });

  it("stays open when a modal layer blocks pointer events on the page", () => {
    const on_close = vi.fn();

    mount({ enabled: true, on_close });
    document.body.style.pointerEvents = "none";
    click(by_test_id("list_row"));

    expect(on_close).not.toHaveBeenCalled();
  });

  it("stays open when a text drag starts inside and ends outside", () => {
    const on_close = vi.fn();

    mount({ enabled: true, on_close });
    pointer("pointerdown", by_test_id("popup_text"), 10, 10);
    pointer("pointerup", by_test_id("list_row"), 400, 300);

    expect(on_close).not.toHaveBeenCalled();
  });

  it("stays open when a drag starts outside and moves away", () => {
    const on_close = vi.fn();

    mount({ enabled: true, on_close });
    pointer("pointerdown", by_test_id("list_row"), 10, 10);
    pointer("pointerup", by_test_id("list_row"), 200, 10);

    expect(on_close).not.toHaveBeenCalled();
  });

  it("stays open on a click in a compose window", () => {
    const on_close = vi.fn();

    mount({ enabled: true, on_close });
    click(by_test_id("compose_field"));

    expect(on_close).not.toHaveBeenCalled();
  });

  it("stays open on a right-click outside", () => {
    const on_close = vi.fn();

    mount({ enabled: true, on_close });
    click(by_test_id("list_row"), 2);

    expect(on_close).not.toHaveBeenCalled();
  });

  it("stays open while an inline reply is in progress", () => {
    const on_close = vi.fn();

    mount({ enabled: true, on_close, with_inline_reply: true });
    click(by_test_id("list_row"));

    expect(on_close).not.toHaveBeenCalled();
  });
});
