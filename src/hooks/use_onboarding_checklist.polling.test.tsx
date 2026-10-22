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
import type { ChecklistState } from "@/services/api/onboarding";

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  state: null as ChecklistState | null,
  fetches: 0,
  dismiss_ok: true,
  auth: { vault: { identity_key: "k" }, user: { id: "u1" } },
}));

vi.mock("@/contexts/auth_context", () => ({
  use_auth: () => mocks.auth,
}));

vi.mock("@/services/api/onboarding", async (import_original) => {
  const actual =
    await import_original<typeof import("@/services/api/onboarding")>();

  return {
    ...actual,
    fetch_onboarding_checklist: async () => {
      mocks.fetches += 1;

      return { kind: "ok", state: mocks.state };
    },
    dismiss_onboarding_checklist: async () => mocks.dismiss_ok,
  };
});

const { use_onboarding_checklist } =
  await import("@/hooks/use_onboarding_checklist");

type Checklist = ReturnType<typeof use_onboarding_checklist>;

function make_state(
  done: Partial<ChecklistState["tasks"]> = {},
  dismissed_at: string | null = null,
): ChecklistState {
  return {
    dismissed_at,
    tasks: {
      install_app: false,
      import_mail: false,
      recovery_method: false,
      first_email: false,
      ...done,
    },
  };
}

const ALL_DONE = {
  install_app: true,
  import_mail: true,
  recovery_method: true,
  first_email: true,
};

let container: HTMLDivElement;
let root: Root;
let checklist: Checklist;
let visibility: DocumentVisibilityState;

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

async function advance(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

async function focus_window(): Promise<void> {
  await act(async () => {
    window.dispatchEvent(new Event("focus"));
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  mocks.state = make_state();
  mocks.fetches = 0;
  mocks.dismiss_ok = true;
  visibility = "visible";
  vi.spyOn(document, "visibilityState", "get").mockImplementation(
    () => visibility,
  );
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

describe("use_onboarding_checklist polling", () => {
  it("keeps polling while the checklist is visible and incomplete", async () => {
    await mount();
    expect(mocks.fetches).toBe(1);

    await advance(60_000);
    expect(mocks.fetches).toBe(4);

    await focus_window();
    expect(mocks.fetches).toBe(5);
  });

  it("notices a task completed on the server while polling", async () => {
    await mount();
    mocks.state = make_state({ first_email: true });

    await advance(20_000);
    expect(checklist.state?.tasks.first_email).toBe(true);
  });

  it("stops polling once every task is complete", async () => {
    await mount();
    mocks.state = make_state(ALL_DONE);

    await advance(20_000);
    expect(mocks.fetches).toBe(2);

    await advance(600_000);
    await focus_window();
    expect(mocks.fetches).toBe(2);
  });

  it("does not poll when the checklist loads already complete", async () => {
    mocks.state = make_state(ALL_DONE);
    await mount();

    await advance(600_000);
    await focus_window();
    expect(mocks.fetches).toBe(1);
  });

  it("stops polling when the last task is completed locally", async () => {
    mocks.state = make_state({
      import_mail: true,
      recovery_method: true,
      first_email: true,
    });
    await mount();

    await act(async () => {
      checklist.mark_install_app_done();
    });

    await advance(600_000);
    await focus_window();
    expect(mocks.fetches).toBe(1);
  });

  it("stops polling once the checklist is dismissed", async () => {
    await mount();

    await act(async () => {
      await checklist.dismiss();
    });

    await advance(600_000);
    await focus_window();
    expect(mocks.fetches).toBe(1);
  });

  it("does not poll when the server already reports it dismissed", async () => {
    mocks.state = make_state({}, "2026-01-01T00:00:00Z");
    await mount();

    await advance(600_000);
    await focus_window();
    expect(mocks.fetches).toBe(1);
  });

  it("resumes polling when a dismissal fails to save", async () => {
    mocks.dismiss_ok = false;
    await mount();

    await act(async () => {
      await checklist.dismiss();
    });

    await advance(20_000);
    expect(mocks.fetches).toBe(2);
  });

  it("skips interval polls while the document is hidden", async () => {
    await mount();
    visibility = "hidden";

    await advance(600_000);
    expect(mocks.fetches).toBe(1);

    visibility = "visible";
    await focus_window();
    expect(mocks.fetches).toBe(2);
  });
});
