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
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const USER_ID = "0f8fad5b-d9cb-469f-a165-70867728950e";
const CHANGE_ID = "7c9e6679-7425-40de-944b-e07fc1f90ae7";

const h = vi.hoisted(() => ({
  device: null as unknown,
  proof: { type: "password", password_hash: "ph", totp_code: null } as unknown,
  skipped: [] as { id: string; proof: unknown }[],
  toasts: [] as {
    message: string;
    kind: string;
    action?: { label: string; on_click: () => void };
  }[],
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key }),
}));

vi.mock("@/components/toast/simple_toast", () => ({
  show_toast: (
    message: string,
    kind: string,
    _ms?: number,
    action?: { label: string; on_click: () => void },
  ) => h.toasts.push({ message, kind, action }),
}));

vi.mock("@/components/guard/guard_panic_dialog", () => ({
  GUARD_PANIC_OPEN_EVENT: "aster:guard_panic_open",
  GuardPanicDialog: () => null,
}));

vi.mock("@/components/guard/guard_switches_panel", () => ({
  use_guard_device: () => ({ device: null, checked: true }),
}));

vi.mock("@/components/guard/guard_waiting_screen", () => ({
  format_guard_short_time: () => "soon",
}));

vi.mock("@/components/guard/use_guard_step_up", () => ({
  use_guard_step_up: () => ({
    request_proof: async () => h.proof,
    step_up_modal: null,
  }),
}));

vi.mock("@/lib/settings_links", () => ({
  SETTINGS_ANCHORS: { guard: "guard" },
  open_settings_target: () => {},
}));

vi.mock("@/services/guard/guard_device", () => ({
  get_guard_device: async () => h.device,
}));

vi.mock("@/services/guard/guard_changes", () => ({
  skip_held_change: async (
    _device: unknown,
    _user: string,
    id: string,
    proof: unknown,
  ) => {
    h.skipped.push({ id, proof });

    return { data: { status: "applied" } };
  },
}));

import { GuardHeldToast } from "@/components/guard/guard_held_toast";
import { GUARD_HELD_EVENT } from "@/services/api/client/helpers";

let container: HTMLDivElement;
let root: Root;

async function flush(): Promise<void> {
  for (let i = 0; i < 10; i += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

async function fire_hold(kind: string): Promise<void> {
  await act(async () => {
    window.dispatchEvent(
      new CustomEvent(GUARD_HELD_EVENT, {
        detail: {
          id: CHANGE_ID,
          kind,
          apply_after: "2026-11-28T00:00:00Z",
          skippable: true,
        },
      }),
    );
  });
  await flush();
}

describe("GuardHeldToast", () => {
  beforeEach(async () => {
    (
      globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    h.device = null;
    h.skipped = [];
    h.toasts = [];
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(<GuardHeldToast user_id={USER_ID} />);
    });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("offers to confirm from a trusted device and applies the change", async () => {
    h.device = { id: "device" };
    await fire_hold("forwarding_change");

    expect(h.toasts[0].message).toBe("guard.held_toast_confirm");
    expect(h.toasts[0].action?.label).toBe("guard.held_skip");

    await act(async () => h.toasts[0].action?.on_click());
    await flush();

    expect(h.skipped).toEqual([{ id: CHANGE_ID, proof: h.proof }]);
    expect(h.toasts[1].message).toBe("guard.held_skipped");
  });

  it("points to settings when this browser is not a trusted device", async () => {
    await fire_hold("forwarding_change");

    expect(h.toasts[0].message).toBe("guard.held_toast");
    expect(h.toasts[0].action?.label).toBe("guard.held_view");
    expect(h.skipped).toEqual([]);
  });
});
