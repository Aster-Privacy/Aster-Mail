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
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const recovery = vi.hoisted(() => ({
  recovery_email_set: true,
}));

vi.mock("@/services/api/recovery", () => ({
  get_recovery_methods: async () => ({
    data: { recovery_email_set: recovery.recovery_email_set },
  }),
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key }),
}));

vi.mock("@/provider", () => ({
  use_should_reduce_motion: () => true,
}));

vi.mock("@aster/ui", () => ({
  Button: ({ children }: { children?: unknown }) => children,
}));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const { PlanPrompt } = await import("@/components/onboarding/plan_prompt");
const {
  clear_first_run_tour,
  FIRST_RUN_AT_KEY,
  FIRST_RUN_PLAN_KEY,
  FIRST_RUN_SETUP_KEY,
  FIRST_RUN_TOUR_KEY,
} = await import("@/lib/first_run");

function mount(checklist_complete: boolean) {
  const container = document.createElement("div");
  let root: Root | null = null;

  act(() => {
    root = createRoot(container);
    root.render(
      <PlanPrompt
        checklist_complete={checklist_complete}
        on_open_plans={() => {}}
      />,
    );
  });

  return { container, unmount: () => act(() => root?.unmount()) };
}

describe("PlanPrompt", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    localStorage.setItem(FIRST_RUN_PLAN_KEY, "pending");
    localStorage.setItem(FIRST_RUN_AT_KEY, String(Date.now()));
    localStorage.removeItem(FIRST_RUN_SETUP_KEY);
    localStorage.setItem(FIRST_RUN_TOUR_KEY, "pending");
    recovery.recovery_email_set = true;
  });

  it("stays hidden on signup day when the checklist is unfinished", async () => {
    const view = mount(false);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(view.container.textContent).toBe("");
    view.unmount();
  });

  it("appears a moment after the tour finishes", async () => {
    const view = mount(false);

    await act(async () => {
      clear_first_run_tour();
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(view.container.textContent).toBe("");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(45000);
    });

    expect(view.container.textContent).toContain("common.plan_prompt_title");
    view.unmount();
  });

  it("appears once the checklist is finished, without waiting a day", async () => {
    const view = mount(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(view.container.textContent).toContain("common.plan_prompt_title");
    view.unmount();
  });

  it("stays hidden after the user dismissed it once", async () => {
    localStorage.removeItem(FIRST_RUN_PLAN_KEY);

    const view = mount(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(view.container.textContent).toBe("");
    view.unmount();
  });
});
