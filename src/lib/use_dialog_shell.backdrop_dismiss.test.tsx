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

import { use_dialog_shell } from "@/lib/use_dialog_shell";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function DialogShell({
  is_open,
  on_close,
}: {
  is_open: boolean;
  on_close: () => void;
}) {
  const { dialog_ref, handle_backdrop_pointer_down } =
    use_dialog_shell<HTMLDivElement>(is_open, on_close, "test_dialog");

  if (!is_open) return null;

  return (
    <>
      <div
        data-testid="backdrop"
        onPointerDown={handle_backdrop_pointer_down}
      />
      <div ref={dialog_ref} data-testid="dialog" tabIndex={-1}>
        <input data-testid="field" />
      </div>
    </>
  );
}

function dispatch_pointer_down(node: Element, button = 0): void {
  node.dispatchEvent(
    new PointerEvent("pointerdown", { bubbles: true, button }),
  );
}

describe("dialog shell backdrop dismissal", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    document.body.style.overflow = "";
  });

  const query = (id: string) =>
    container.querySelector(`[data-testid="${id}"]`) as HTMLElement;

  it("dismisses on a primary pointerdown directly on the backdrop", () => {
    const on_close = vi.fn();

    act(() => {
      root.render(<DialogShell is_open on_close={on_close} />);
    });

    act(() => dispatch_pointer_down(query("backdrop")));

    expect(on_close).toHaveBeenCalledTimes(1);
  });

  it("does not dismiss when the pointer goes down inside the dialog", () => {
    const on_close = vi.fn();

    act(() => {
      root.render(<DialogShell is_open on_close={on_close} />);
    });

    act(() => dispatch_pointer_down(query("field")));
    act(() => {
      query("backdrop").dispatchEvent(
        new PointerEvent("pointerup", { bubbles: true, button: 0 }),
      );
      query("backdrop").dispatchEvent(
        new MouseEvent("click", { bubbles: true, button: 0 }),
      );
    });

    expect(on_close).not.toHaveBeenCalled();
  });

  it("does not dismiss on a non-primary pointerdown", () => {
    const on_close = vi.fn();

    act(() => {
      root.render(<DialogShell is_open on_close={on_close} />);
    });

    act(() => dispatch_pointer_down(query("backdrop"), 2));

    expect(on_close).not.toHaveBeenCalled();
  });

  it("locks and restores body scroll once per stacked dialog", () => {
    const on_close = vi.fn();

    act(() => {
      root.render(
        <>
          <DialogShell is_open on_close={on_close} />
          <DialogShell is_open on_close={on_close} />
        </>,
      );
    });

    expect(document.body.style.overflow).toBe("hidden");

    act(() => {
      root.render(
        <>
          <DialogShell is_open on_close={on_close} />
          <DialogShell is_open={false} on_close={on_close} />
        </>,
      );
    });

    expect(document.body.style.overflow).toBe("hidden");

    act(() => {
      root.render(
        <>
          <DialogShell is_open={false} on_close={on_close} />
          <DialogShell is_open={false} on_close={on_close} />
        </>,
      );
    });

    expect(document.body.style.overflow).toBe("");
  });

  it("restores focus to the trigger when the dialog closes", () => {
    const trigger = document.createElement("button");

    document.body.appendChild(trigger);
    trigger.focus();

    act(() => {
      root.render(<DialogShell is_open on_close={() => {}} />);
    });

    expect(document.activeElement).toBe(query("dialog"));

    act(() => {
      root.render(<DialogShell is_open={false} on_close={() => {}} />);
    });

    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });
});
