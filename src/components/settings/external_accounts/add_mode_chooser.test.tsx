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

import { AddModeChooser } from "./add_mode_chooser";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const t = ((key: string) => key) as never;

let root: Root | null = null;
let host: HTMLDivElement | null = null;

function render_chooser(props: {
  sync_full?: boolean;
  send_only_full?: boolean;
  on_choose?: (mode: string) => void;
}) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(
      <AddModeChooser
        is_open
        send_only_full={props.send_only_full ?? false}
        sync_full={props.sync_full ?? false}
        t={t}
        on_choose={props.on_choose ?? (() => {})}
        on_close={() => {}}
      />,
    );
  });
}

function row(mode: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(
    `[data-testid="ext-mode-${mode}"]`,
  );

  expect(element).not.toBeNull();

  return element!;
}

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

describe("AddModeChooser", () => {
  it("offers both modes as island rows without a bordered card", () => {
    render_chooser({});
    for (const mode of ["server_sync", "send_only"]) {
      const element = row(mode);

      expect(element.className).not.toMatch(/\bborder\b/);
      expect(element.closest(".aster_island")).not.toBeNull();
    }
  });

  it("reports the chosen mode", () => {
    const on_choose = vi.fn();

    render_chooser({ on_choose });
    act(() => row("send_only").click());
    act(() => row("server_sync").click());
    expect(on_choose.mock.calls).toEqual([["send_only"], ["server_sync"]]);
  });

  it("marks only the full mode with the upgrade badge", () => {
    render_chooser({ sync_full: true });
    expect(row("server_sync").textContent).toContain(
      "settings.ext_v2_upgrade_badge",
    );
    expect(row("send_only").textContent).not.toContain(
      "settings.ext_v2_upgrade_badge",
    );
  });

  it("still lets a full mode be chosen so the upgrade prompt can open", () => {
    const on_choose = vi.fn();

    render_chooser({ send_only_full: true, on_choose });
    act(() => row("send_only").click());
    expect(on_choose).toHaveBeenCalledWith("send_only");
  });
});
