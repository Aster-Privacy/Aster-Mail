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

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const card_props = vi.hoisted(() => ({ address_row: null as unknown }));

vi.mock("@aster/ui", () => ({
  is_aster_email_address: () => true,
  SenderProfileCardView: ({
    children,
    is_open,
    on_open_change,
    address_row,
  }: {
    children: ReactNode;
    is_open: boolean;
    on_open_change: (open: boolean) => void;
    address_row?: ReactNode;
  }) => {
    card_props.address_row = address_row;

    return (
      <button
        data-open={is_open ? "true" : "false"}
        type="button"
        onPointerDown={() => on_open_change(!is_open)}
      >
        {children}
      </button>
    );
  },
}));

vi.mock("react-router-dom", () => ({ useNavigate: () => () => {} }));
vi.mock("@/contexts/auth_context", () => ({
  use_auth: () => ({ has_keys: false }),
}));
vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key }),
}));
vi.mock("@/components/ui/profile_avatar", () => ({
  ProfileAvatar: () => null,
}));
vi.mock("@/components/profile/profile_notes_inline", () => ({
  ProfileNotesInline: () => null,
}));
vi.mock("@/components/toast/simple_toast", () => ({ show_toast: () => {} }));
vi.mock("@/services/api/contacts", () => ({
  create_contact_encrypted: vi.fn(),
  delete_contact: vi.fn(),
}));
vi.mock("@/services/contact_email_index", () => ({
  ensure_contact_email_index: () => Promise.resolve(),
  get_cached_contact_id: () => null,
}));
vi.mock("@/services/api/blocked_senders", () => ({
  block_sender: vi.fn(),
  unblock_sender: vi.fn(),
  check_blocked_senders: () => Promise.resolve(new Set()),
}));
vi.mock("@/services/api/allowed_senders", () => ({
  allow_sender: vi.fn(),
  remove_allowed_sender: vi.fn(),
  check_allowed_senders: () => Promise.resolve(new Set()),
}));

vi.mock("@/components/profile/sender_address_copy_row", () => ({
  SenderAddressCopyRow: () => null,
}));

const { SenderProfileTrigger } = await import("./sender_profile_trigger");
const { SenderAddressCopyRow } =
  await import("@/components/profile/sender_address_copy_row");

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  window.getSelection()?.removeAllRanges();
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

function render_trigger(
  selectable: boolean,
  on_outer_click?: () => void,
): HTMLButtonElement {
  act(() => {
    root!.render(
      <div onClick={on_outer_click}>
        <SenderProfileTrigger
          email="kosei@astermail.org"
          name="kosei"
          selectable={selectable}
        >
          <span data-testid="label">kosei</span>
        </SenderProfileTrigger>
      </div>,
    );
  });

  return container!.querySelector("button")!;
}

function press(target: Element, with_selection: boolean): void {
  act(() => {
    target.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        button: 0,
        pointerType: "mouse",
      }),
    );
  });
  if (with_selection) {
    const range = document.createRange();

    range.selectNodeContents(target);
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(range);
  }
  act(() => {
    target.dispatchEvent(
      new MouseEvent("mouseup", { bubbles: true, detail: 1 }),
    );
    target.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
  });
}

function card_state(): string | null {
  return container!.querySelector("[data-open]")!.getAttribute("data-open");
}

describe("SenderProfileTrigger selectable label", () => {
  it("renders the name outside any button so a selection can start", () => {
    render_trigger(true);
    const label = container!.querySelector('[data-testid="label"]')!;
    const name = label.closest("[data-selectable]")!;

    expect(name).not.toBeNull();
    expect(label.closest("button")).toBeNull();
    expect(name.getAttribute("role")).toBe("button");
    expect(name.getAttribute("tabindex")).toBe("0");
  });

  it("keeps the card closed when a mouseup ends a selection of the name", () => {
    render_trigger(true);
    press(container!.querySelector('[data-testid="label"]')!, true);

    expect(card_state()).toBe("false");
  });

  it("opens the card on a plain click of the name without bubbling", () => {
    const outer_click = vi.fn();

    render_trigger(true, outer_click);
    press(container!.querySelector('[data-testid="label"]')!, false);

    expect(card_state()).toBe("true");
    expect(outer_click).not.toHaveBeenCalled();
  });

  it("opens the card with Enter and Space", () => {
    for (const key of ["Enter", " "]) {
      render_trigger(true);
      const name = container!.querySelector("[data-selectable]")!;

      act(() => {
        name.dispatchEvent(
          new KeyboardEvent("keydown", { bubbles: true, key }),
        );
      });

      expect(card_state()).toBe("true");
      act(() => root?.unmount());
      root = createRoot(container!);
    }
  });

  it("keeps opening on pointerdown when the label is not selectable", () => {
    const button = render_trigger(false);
    const label = container!.querySelector('[data-testid="label"]')!;

    expect(label.closest("[data-selectable]")).toBeNull();
    expect(label.closest("button")).toBe(button);
    act(() => {
      label.dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          button: 0,
          pointerType: "mouse",
        }),
      );
    });

    expect(button.getAttribute("data-open")).toBe("true");
  });

  it("stops a double click on the name from selecting text", () => {
    render_trigger(true);
    const name = container!.querySelector("[data-selectable]")!;
    const first = new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
      button: 0,
      detail: 1,
    });
    const second = new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
      button: 0,
      detail: 2,
    });

    act(() => {
      name.dispatchEvent(first);
      name.dispatchEvent(second);
    });

    expect(first.defaultPrevented).toBe(false);
    expect(second.defaultPrevented).toBe(true);
  });

  it("hands the card the themed address copy row", () => {
    render_trigger(false);
    const row = card_props.address_row as {
      type: unknown;
      props: { email: string; on_copy: unknown };
    };

    expect(row.type).toBe(SenderAddressCopyRow);
    expect(row.props.email).toBe("kosei@astermail.org");
    expect(typeof row.props.on_copy).toBe("function");
  });
});
