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
import type { SenderOption } from "@/hooks/use_sender_aliases";
import type { UseGhostModeReturn } from "@/hooks/use_ghost_mode";

import { describe, it, expect, vi } from "vitest";
import { useState } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";

import { use_ghost_sender_binding } from "@/hooks/use_ghost_sender_binding";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const primary: SenderOption = {
  id: "primary",
  email: "hello@astermail.org",
  type: "primary",
  is_enabled: true,
};

const alias: SenderOption = {
  id: "alias-1",
  email: "legal@astermail.org",
  type: "alias",
  is_enabled: true,
};

const ghost: SenderOption = {
  id: "ghost-1",
  email: "ample.orbitu5xk2awr@realiased.me",
  type: "ghost",
  is_enabled: true,
};

interface Harness {
  selected: SenderOption | null;
  select: (val: SenderOption | null) => void;
  set_ghost_enabled: (val: boolean) => void;
  disable_calls: () => number;
}

function render_harness(): Harness {
  const container = document.createElement("div");

  document.body.appendChild(container);

  const root = createRoot(container);
  const disable_spy = vi.fn();
  const state: Harness = {
    selected: null,
    select: () => {},
    set_ghost_enabled: () => {},
    disable_calls: () => disable_spy.mock.calls.length,
  };

  function Probe() {
    const [selected, set_selected] = useState<SenderOption | null>(primary);
    const [enabled, set_enabled] = useState(false);
    const ghost_mode = {
      is_ghost_enabled: enabled,
      is_thread_locked: false,
      toggle_ghost_mode: () => {},
      disable_ghost_mode: () => {
        disable_spy();
        set_enabled(false);
      },
      ghost_sender: enabled ? ghost : null,
      ghost_expiry_days: 30,
      set_ghost_expiry_days: () => {},
      is_creating: false,
      error: null,
    } satisfies UseGhostModeReturn;

    const select = use_ghost_sender_binding(ghost_mode, selected, set_selected);

    state.selected = selected;
    state.select = select;
    state.set_ghost_enabled = set_enabled;

    return null;
  }

  act(() => {
    root.render(<Probe />);
  });

  return state;
}

describe("use_ghost_sender_binding", () => {
  it("adopts the ghost address when ghost mode turns on", () => {
    const h = render_harness();

    expect(h.selected).toEqual(primary);

    act(() => {
      h.set_ghost_enabled(true);
    });

    expect(h.selected).toEqual(ghost);
  });

  it("keeps a manually picked alias instead of snapping back to the ghost", () => {
    const h = render_harness();

    act(() => {
      h.set_ghost_enabled(true);
    });

    expect(h.selected).toEqual(ghost);

    act(() => {
      h.select(alias);
    });

    expect(h.selected).toEqual(alias);
    expect(h.disable_calls()).toBe(1);

    act(() => {});

    expect(h.selected).toEqual(alias);
  });

  it("keeps the primary address after picking it back", () => {
    const h = render_harness();

    act(() => {
      h.set_ghost_enabled(true);
    });

    act(() => {
      h.select(primary);
    });

    expect(h.selected).toEqual(primary);
  });

  it("restores the pre-ghost sender when ghost mode is switched off", () => {
    const h = render_harness();

    act(() => {
      h.select(alias);
    });

    act(() => {
      h.set_ghost_enabled(true);
    });

    expect(h.selected).toEqual(ghost);

    act(() => {
      h.set_ghost_enabled(false);
    });

    expect(h.selected).toEqual(alias);
  });
});
