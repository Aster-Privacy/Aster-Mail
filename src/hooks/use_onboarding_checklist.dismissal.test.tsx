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
//
import type { ChecklistState } from "@/services/api/onboarding";

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  state: null as ChecklistState | null,
  fetch_kind: "ok" as "ok" | "transient",
  dismiss_ok: true,
  dismiss_calls: 0,
  auth: {
    vault: { identity_key: "k" } as { identity_key: string } | null,
    user: { id: "u1" },
  },
}));

vi.mock("@/contexts/auth_context", () => ({
  use_auth: () => mocks.auth,
}));

vi.mock("@/services/api/onboarding", async (import_original) => {
  const actual =
    await import_original<typeof import("@/services/api/onboarding")>();

  return {
    ...actual,
    fetch_onboarding_checklist: async () =>
      mocks.fetch_kind === "ok"
        ? { kind: "ok", state: mocks.state }
        : { kind: "transient" },
    dismiss_onboarding_checklist: async () => {
      mocks.dismiss_calls += 1;

      return mocks.dismiss_ok;
    },
  };
});

const { use_onboarding_checklist } =
  await import("@/hooks/use_onboarding_checklist");

type Checklist = ReturnType<typeof use_onboarding_checklist>;

const FLAG_U1 = "aster_onboarding_checklist_dismissed_u1";
const FLAG_U2 = "aster_onboarding_checklist_dismissed_u2";

function open_state(): ChecklistState {
  return {
    dismissed_at: null,
    tasks: {
      install_app: false,
      import_mail: false,
      recovery_method: false,
      first_email: false,
    },
  };
}

let container: HTMLDivElement;
let root: Root;
let checklist: Checklist;

function Probe(): null {
  checklist = use_onboarding_checklist();

  return null;
}

async function mount(): Promise<void> {
  await act(async () => {
    root.render(<Probe />);
  });
  await act(async () => {
    await Promise.resolve();
  });
}

async function remount(): Promise<void> {
  act(() => {
    root.unmount();
  });
  root = createRoot(container);
  await mount();
}

async function advance(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

async function dismiss(): Promise<void> {
  await act(async () => {
    await checklist.dismiss();
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  mocks.state = open_state();
  mocks.fetch_kind = "ok";
  mocks.dismiss_ok = true;
  mocks.dismiss_calls = 0;
  mocks.auth = { vault: { identity_key: "k" }, user: { id: "u1" } };
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("use_onboarding_checklist dismissal", () => {
  it("records the choice for the account before the server answers", async () => {
    mocks.dismiss_ok = false;
    await mount();
    await dismiss();

    expect(localStorage.getItem(FLAG_U1)).toBe("pending");
    expect(checklist.state?.dismissed_at).toBeTruthy();
  });

  it("stays hidden when the save fails", async () => {
    mocks.dismiss_ok = false;
    await mount();
    await dismiss();
    await advance(120_000);

    expect(checklist.state?.dismissed_at).toBeTruthy();
  });

  it("retries the save until the server accepts it", async () => {
    mocks.dismiss_ok = false;
    await mount();
    await dismiss();
    expect(mocks.dismiss_calls).toBe(1);

    await advance(5_000);
    expect(mocks.dismiss_calls).toBe(2);

    await advance(10_000);
    expect(mocks.dismiss_calls).toBe(3);

    mocks.dismiss_ok = true;
    await advance(20_000);
    expect(mocks.dismiss_calls).toBe(4);
    expect(localStorage.getItem(FLAG_U1)).toBe("synced");

    await advance(3_600_000);
    expect(mocks.dismiss_calls).toBe(4);
  });

  it("retries when the window regains focus or the network returns", async () => {
    mocks.dismiss_ok = false;
    await mount();
    await dismiss();

    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      await Promise.resolve();
    });
    expect(mocks.dismiss_calls).toBe(2);

    mocks.dismiss_ok = true;
    await act(async () => {
      window.dispatchEvent(new Event("online"));
      await Promise.resolve();
    });
    expect(mocks.dismiss_calls).toBe(3);
    expect(localStorage.getItem(FLAG_U1)).toBe("synced");
  });

  it("stays hidden after a reload while the server still reports it open", async () => {
    mocks.dismiss_ok = false;
    await mount();
    await dismiss();

    await remount();

    expect(checklist.state?.dismissed_at).toBeTruthy();
  });

  it("finishes an unsaved dismissal on the next load", async () => {
    mocks.dismiss_ok = false;
    await mount();
    await dismiss();
    const calls_before = mocks.dismiss_calls;

    mocks.dismiss_ok = true;
    await remount();

    expect(mocks.dismiss_calls).toBe(calls_before + 1);
    expect(localStorage.getItem(FLAG_U1)).toBe("synced");
  });

  it("does not come back when a later response reports it open", async () => {
    await mount();
    await dismiss();
    expect(localStorage.getItem(FLAG_U1)).toBe("synced");

    mocks.state = open_state();
    await act(async () => {
      await checklist.refresh();
    });
    expect(checklist.state?.dismissed_at).toBeTruthy();

    await remount();
    expect(checklist.state?.dismissed_at).toBeTruthy();
    expect(mocks.dismiss_calls).toBe(1);
  });

  it("remembers a dismissal that happened on another device", async () => {
    mocks.state = { ...open_state(), dismissed_at: "2026-01-01T00:00:00Z" };
    await mount();
    expect(localStorage.getItem(FLAG_U1)).toBe("synced");

    mocks.state = open_state();
    await remount();
    expect(checklist.state?.dismissed_at).toBeTruthy();
    expect(mocks.dismiss_calls).toBe(0);
  });

  it("keeps the choice separate for each account", async () => {
    await mount();
    await dismiss();

    mocks.auth = { vault: { identity_key: "k" }, user: { id: "u2" } };
    await remount();

    expect(localStorage.getItem(FLAG_U2)).toBeNull();
    expect(checklist.state?.dismissed_at).toBeNull();

    mocks.auth = { vault: { identity_key: "k" }, user: { id: "u1" } };
    await remount();
    expect(checklist.state?.dismissed_at).toBeTruthy();
  });

  it("stops retrying after the account signs out", async () => {
    mocks.dismiss_ok = false;
    await mount();
    await dismiss();
    const calls_before = mocks.dismiss_calls;

    mocks.auth = { vault: null, user: { id: "u1" } };
    await act(async () => {
      root.render(<Probe />);
    });
    await advance(3_600_000);

    expect(mocks.dismiss_calls).toBe(calls_before);
    expect(localStorage.getItem(FLAG_U1)).toBe("pending");
  });
});
