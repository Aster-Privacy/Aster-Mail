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

import {
  has_open_overlay_layer,
  use_escape_layer,
} from "@/lib/overlay_layer_stack";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function EscapeLayer({
  is_open,
  on_close,
  label,
  blocking = true,
}: {
  is_open: boolean;
  on_close: () => void;
  label: string;
  blocking?: boolean;
}) {
  use_escape_layer(is_open, on_close, label, blocking);

  return null;
}

function press_escape(): void {
  document.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
  );
}

describe("overlay layer escape ordering", () => {
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
  });

  it("only closes the top layer when two overlays are stacked", () => {
    const close_lower = vi.fn();
    const close_upper = vi.fn();

    act(() => {
      root.render(
        <>
          <EscapeLayer is_open label="lower" on_close={close_lower} />
          <EscapeLayer is_open label="upper" on_close={close_upper} />
        </>,
      );
    });

    act(() => press_escape());

    expect(close_upper).toHaveBeenCalledTimes(1);
    expect(close_lower).not.toHaveBeenCalled();
  });

  it("falls back to the lower layer once the top layer unmounts", () => {
    const close_lower = vi.fn();
    const close_upper = vi.fn();

    act(() => {
      root.render(
        <>
          <EscapeLayer is_open label="lower" on_close={close_lower} />
          <EscapeLayer is_open label="upper" on_close={close_upper} />
        </>,
      );
    });

    act(() => {
      root.render(
        <>
          <EscapeLayer is_open label="lower" on_close={close_lower} />
        </>,
      );
    });

    act(() => press_escape());

    expect(close_lower).toHaveBeenCalledTimes(1);
    expect(close_upper).not.toHaveBeenCalled();
  });

  it("ignores escape while the layer is closed", () => {
    const on_close = vi.fn();

    act(() => {
      root.render(
        <EscapeLayer is_open={false} label="closed" on_close={on_close} />,
      );
    });

    act(() => press_escape());

    expect(on_close).not.toHaveBeenCalled();
  });

  it("reports no open overlay for a non-blocking docked panel", () => {
    const on_close = vi.fn();

    act(() => {
      root.render(
        <EscapeLayer
          is_open
          blocking={false}
          label="docked"
          on_close={on_close}
        />,
      );
    });

    expect(has_open_overlay_layer()).toBe(false);

    act(() => press_escape());

    expect(on_close).toHaveBeenCalledTimes(1);
  });

  it("reports an open overlay for a blocking layer and clears it on unmount", () => {
    act(() => {
      root.render(<EscapeLayer is_open label="modal" on_close={() => {}} />);
    });

    expect(has_open_overlay_layer()).toBe(true);

    act(() => {
      root.render(
        <EscapeLayer is_open={false} label="modal" on_close={() => {}} />,
      );
    });

    expect(has_open_overlay_layer()).toBe(false);
  });

  it("gives a blocking overlay opened over a docked panel escape priority", () => {
    const close_docked = vi.fn();
    const close_modal = vi.fn();

    act(() => {
      root.render(
        <EscapeLayer
          is_open
          blocking={false}
          label="docked"
          on_close={close_docked}
        />,
      );
    });

    act(() => {
      root.render(
        <>
          <EscapeLayer
            is_open
            blocking={false}
            label="docked"
            on_close={close_docked}
          />
          <EscapeLayer is_open label="modal" on_close={close_modal} />
        </>,
      );
    });

    act(() => press_escape());

    expect(close_modal).toHaveBeenCalledTimes(1);
    expect(close_docked).not.toHaveBeenCalled();
  });
});
