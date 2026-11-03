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
import { useRef } from "react";
import { createRoot, type Root } from "react-dom/client";

import {
  get_panel_inset,
  subscribe_panel_inset,
  use_panel_inset,
} from "./use_panel_inset";

function Panel({ is_open, width }: { is_open: boolean; width: number }) {
  const panel_ref = useRef<HTMLDivElement | null>(null);

  use_panel_inset(is_open, panel_ref);

  return (
    <div
      ref={(node) => {
        if (node) {
          node.getBoundingClientRect = () => ({ width }) as DOMRect;
        }
        panel_ref.current = node;
      }}
    />
  );
}

function Rail({
  contacts_open,
  security_open,
}: {
  contacts_open: boolean;
  security_open: boolean;
}) {
  return (
    <>
      <Panel is_open={contacts_open} width={320} />
      <Panel is_open={security_open} width={272} />
    </>
  );
}

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const read_inset = () => get_panel_inset();

describe("use_panel_inset", () => {
  let container: HTMLDivElement;
  let root: Root;

  const render_rail = async (
    contacts_open: boolean,
    security_open: boolean,
  ) => {
    await act(async () => {
      root.render(
        <Rail contacts_open={contacts_open} security_open={security_open} />,
      );
    });
  };

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("stays at zero while both panels are closed", async () => {
    await render_rail(false, false);

    expect(read_inset()).toBe(0);
  });

  it("reports the width of the open panel", async () => {
    await render_rail(true, false);

    expect(read_inset()).toBe(320);
  });

  it("hands the inset over when the later panel opens", async () => {
    await render_rail(true, false);
    await render_rail(false, true);

    expect(read_inset()).toBe(272);
  });

  it("hands the inset back when the earlier panel opens", async () => {
    await render_rail(false, true);
    await render_rail(true, false);

    expect(read_inset()).toBe(320);
  });

  it("clears the inset once every panel closes", async () => {
    await render_rail(false, true);
    await render_rail(false, false);

    expect(read_inset()).toBe(0);
  });

  it("never touches the document style", async () => {
    await render_rail(true, false);

    expect(document.documentElement.getAttribute("style") ?? "").not.toContain(
      "--quick_panel_inset",
    );
  });

  it("notifies subscribers only when the inset changes", async () => {
    const listener = vi.fn();
    const unsubscribe = subscribe_panel_inset(listener);

    await render_rail(true, false);

    expect(listener).toHaveBeenCalledTimes(1);

    await render_rail(true, false);

    expect(listener).toHaveBeenCalledTimes(1);

    await render_rail(false, true);

    const handed_over_calls = listener.mock.calls.length;

    expect(handed_over_calls).toBeGreaterThan(1);
    expect(read_inset()).toBe(272);

    unsubscribe();
    await render_rail(false, false);

    expect(listener).toHaveBeenCalledTimes(handed_over_calls);
  });
});
