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
  checklist: {
    state: null as ChecklistState | null,
    is_loading: false,
    account_id: null as string | null,
    dismiss: vi.fn(async () => {}),
    refresh: vi.fn(async () => {}),
    mark_install_app_done: vi.fn(),
  },
  plan_code: "free" as string | null,
  open_external: vi.fn(),
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key} ${JSON.stringify(params)}` : key,
  }),
}));
vi.mock("@/provider", () => ({ use_should_reduce_motion: () => true }));
vi.mock("@/hooks/use_onboarding_checklist", () => ({
  use_onboarding_checklist: () => mocks.checklist,
}));
vi.mock("@/hooks/use_plan_limits", () => ({
  use_plan_limits: () => ({
    limits: mocks.plan_code ? { plan_code: mocks.plan_code } : null,
  }),
}));
vi.mock("@/utils/open_link", () => ({ open_external: mocks.open_external }));

const COLLAPSED_KEY = "aster_tutorial_list_collapsed";
const SEEN_KEY = "aster_tutorial_list_seen_incomplete";

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

function make_handlers() {
  return {
    on_compose: vi.fn<() => void>(),
    on_open_settings: vi.fn<(section: string) => void>(),
    on_open_shortcuts: vi.fn<() => void>(),
    on_all_tasks_done: vi.fn<() => void>(),
    on_visibility_change: vi.fn<(visible: boolean) => void>(),
  };
}

type Handlers = ReturnType<typeof make_handlers>;

async function render(
  handlers: Handlers,
  extra: { hidden?: boolean; without_shortcuts?: boolean } = {},
): Promise<void> {
  const { OnboardingChecklist } = await import("./onboarding_checklist");

  await act(async () => {
    root.render(
      <OnboardingChecklist
        hidden={extra.hidden}
        on_all_tasks_done={handlers.on_all_tasks_done}
        on_compose={handlers.on_compose}
        on_open_settings={handlers.on_open_settings}
        on_open_shortcuts={
          extra.without_shortcuts ? undefined : handlers.on_open_shortcuts
        }
        on_visibility_change={handlers.on_visibility_change}
      />,
    );
  });
}

function find_button(text: string): HTMLButtonElement | null {
  return (
    Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes(text),
    ) ?? null
  );
}

function launcher(): HTMLButtonElement {
  return container.querySelector("button[aria-expanded]") as HTMLButtonElement;
}

function progress_width(): string | undefined {
  return container.querySelector<HTMLElement>(
    '[data-testid="tutorial-list-progress"]',
  )?.style.width;
}

function remaining_badge(): Element | null {
  return container.querySelector('[data-testid="tutorial-list-remaining"]');
}

async function click(element: Element | null): Promise<void> {
  expect(element).not.toBeNull();
  await act(async () => {
    (element as HTMLElement).click();
  });
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  mocks.checklist.state = make_state();
  mocks.checklist.is_loading = false;
  mocks.checklist.account_id = null;
  mocks.checklist.dismiss.mockClear();
  mocks.checklist.refresh.mockClear();
  mocks.checklist.mark_install_app_done.mockClear();
  mocks.open_external.mockClear();
  mocks.plan_code = "free";
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

describe("OnboardingChecklist", () => {
  it("renders nothing while loading or without state", async () => {
    const handlers = make_handlers();

    mocks.checklist.is_loading = true;
    await render(handlers);
    expect(container.innerHTML).toBe("");
    expect(handlers.on_visibility_change).not.toHaveBeenCalled();

    mocks.checklist.is_loading = false;
    mocks.checklist.state = null;
    await render(handlers);
    expect(container.innerHTML).toBe("");
    expect(handlers.on_visibility_change).toHaveBeenLastCalledWith(false);
  });

  it("shows the open list with every task and both domain rows", async () => {
    const handlers = make_handlers();

    mocks.checklist.state = make_state({ first_email: true });
    await render(handlers);

    expect(launcher().getAttribute("aria-expanded")).toBe("true");
    expect(launcher().getAttribute("aria-label")).toBe(
      "common.onboarding_checklist_close",
    );
    expect(container.querySelectorAll("[data-done]").length).toBe(4);
    expect(container.querySelectorAll('[data-done="true"]').length).toBe(1);
    expect(container.textContent).toContain(
      "common.onboarding_checklist_title",
    );
    expect(
      find_button("common.onboarding_checklist_domain_get"),
    ).not.toBeNull();
    expect(
      find_button("common.onboarding_checklist_domain_existing"),
    ).not.toBeNull();
    expect(handlers.on_visibility_change).toHaveBeenLastCalledWith(true);
    expect(handlers.on_all_tasks_done).not.toHaveBeenCalled();
    expect(localStorage.getItem(SEEN_KEY)).toBe("1");
  });

  it("collapses to the launcher, remembers it, and reopens", async () => {
    const handlers = make_handlers();

    await render(handlers);
    await click(launcher());

    expect(launcher().getAttribute("aria-expanded")).toBe("false");
    expect(launcher().getAttribute("aria-label")).toBe(
      "common.onboarding_checklist_open",
    );
    expect(container.querySelectorAll("[data-done]").length).toBe(0);
    expect(localStorage.getItem(COLLAPSED_KEY)).toBe("1");
    expect(handlers.on_visibility_change).toHaveBeenLastCalledWith(true);
    expect(mocks.checklist.dismiss).not.toHaveBeenCalled();

    await click(launcher());
    expect(launcher().getAttribute("aria-expanded")).toBe("true");
    expect(container.querySelectorAll("[data-done]").length).toBe(4);
    expect(localStorage.getItem(COLLAPSED_KEY)).toBeNull();
  });

  it("keeps the collapsed and seen flags separate per account", async () => {
    const handlers = make_handlers();

    mocks.checklist.account_id = "account-a";
    await render(handlers);
    await click(launcher());

    expect(localStorage.getItem(`${COLLAPSED_KEY}_account-a`)).toBe("1");
    expect(localStorage.getItem(`${SEEN_KEY}_account-a`)).toBe("1");
    expect(localStorage.getItem(COLLAPSED_KEY)).toBeNull();
    expect(localStorage.getItem(SEEN_KEY)).toBeNull();

    mocks.checklist.account_id = "account-b";
    mocks.checklist.state = make_state(ALL_DONE);
    await render(handlers);

    expect(container.innerHTML).toBe("");
    expect(localStorage.getItem(`${SEEN_KEY}_account-b`)).toBeNull();
    expect(localStorage.getItem(`${COLLAPSED_KEY}_account-b`)).toBeNull();

    mocks.checklist.state = make_state();
    await render(handlers);

    expect(launcher().getAttribute("aria-expanded")).toBe("true");
    expect(localStorage.getItem(`${SEEN_KEY}_account-b`)).toBe("1");
  });

  it("collapses on Escape from the launcher and names the progress", async () => {
    await render(make_handlers());

    expect(launcher().getAttribute("aria-describedby")).toBeNull();
    await act(async () => {
      launcher().dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    });

    expect(launcher().getAttribute("aria-expanded")).toBe("false");
    const described_by = launcher().getAttribute("aria-describedby");

    expect(described_by).not.toBeNull();
    expect(document.getElementById(described_by as string)?.textContent).toBe(
      'common.x_of_y {"current":0,"total":4}',
    );
  });

  it("puts the launcher before the panel in keyboard order", async () => {
    await render(make_handlers());
    const buttons = Array.from(container.querySelectorAll("button"));

    expect(buttons[0]).toBe(launcher());
  });

  it("starts collapsed when the stored flag is set", async () => {
    localStorage.setItem(COLLAPSED_KEY, "1");
    await render(make_handlers());

    expect(launcher().getAttribute("aria-expanded")).toBe("false");
    expect(container.querySelectorAll("[data-done]").length).toBe(0);
  });

  it("collapses on Escape and returns focus to the launcher", async () => {
    await render(make_handlers());
    const row = find_button("common.onboarding_checklist_import_mail");

    await act(async () => {
      row?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    });

    expect(launcher().getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(launcher());
  });

  it("routes each task to its destination", async () => {
    const handlers = make_handlers();

    await render(handlers);

    await click(find_button("common.onboarding_checklist_import_mail"));
    expect(handlers.on_open_settings).toHaveBeenLastCalledWith("import");

    await click(find_button("common.onboarding_checklist_first_email"));
    expect(handlers.on_compose).toHaveBeenCalledTimes(1);

    await click(find_button("common.onboarding_checklist_recovery_method"));
    expect(handlers.on_open_settings).toHaveBeenLastCalledWith("account");

    await click(find_button("common.onboarding_checklist_install_app"));
    expect(mocks.open_external).toHaveBeenCalledWith(
      "https://astermail.org/download",
    );
    expect(mocks.checklist.mark_install_app_done).toHaveBeenCalledTimes(1);
    expect(mocks.checklist.refresh).toHaveBeenCalledTimes(3);
  });

  it("opens the domain settings from both domain rows", async () => {
    const handlers = make_handlers();
    const purchase_listener = vi.fn();

    window.addEventListener("aster:open-domain-purchase", purchase_listener);
    await render(handlers);

    await click(find_button("common.onboarding_checklist_domain_existing"));
    expect(handlers.on_open_settings).toHaveBeenLastCalledWith("domains");
    expect(sessionStorage.getItem("alias_domains_purchase_open")).toBeNull();
    expect(purchase_listener).not.toHaveBeenCalled();

    await click(find_button("common.onboarding_checklist_domain_get"));
    expect(handlers.on_open_settings).toHaveBeenCalledTimes(2);
    expect(sessionStorage.getItem("alias_domains_purchase_open")).toBe("1");
    expect(purchase_listener).toHaveBeenCalledTimes(1);
    window.removeEventListener("aster:open-domain-purchase", purchase_listener);
  });

  it("dismisses permanently from the hide link", async () => {
    await render(make_handlers());
    await click(find_button("common.onboarding_checklist_hide_forever"));

    expect(mocks.checklist.dismiss).toHaveBeenCalledTimes(1);
  });

  it("renders nothing once dismissed", async () => {
    const handlers = make_handlers();

    mocks.checklist.state = make_state({}, "2026-10-12T00:00:00.000Z");
    await render(handlers);

    expect(container.innerHTML).toBe("");
    expect(handlers.on_visibility_change).toHaveBeenLastCalledWith(false);
    expect(localStorage.getItem(SEEN_KEY)).toBeNull();
  });

  it("opens keyboard shortcuts, and omits the row without a handler", async () => {
    const handlers = make_handlers();

    await render(handlers);
    await click(find_button("common.onboarding_checklist_shortcuts"));
    expect(handlers.on_open_shortcuts).toHaveBeenCalledTimes(1);

    await render(handlers, { without_shortcuts: true });
    expect(find_button("common.onboarding_checklist_shortcuts")).toBeNull();
  });

  it("stays hidden for an account that finished before this list existed", async () => {
    const handlers = make_handlers();

    mocks.checklist.state = make_state(ALL_DONE);
    await render(handlers);

    expect(container.innerHTML).toBe("");
    expect(handlers.on_all_tasks_done).toHaveBeenCalledTimes(1);
    expect(handlers.on_visibility_change).toHaveBeenLastCalledWith(false);
  });

  it("shows the completed row with a plans link on the free plan", async () => {
    const handlers = make_handlers();

    await render(handlers);
    mocks.checklist.state = make_state(ALL_DONE);
    await render(handlers);

    expect(container.querySelectorAll('[data-done="true"]').length).toBe(4);
    expect(container.textContent).not.toContain(
      "common.onboarding_checklist_title",
    );
    expect(handlers.on_all_tasks_done).toHaveBeenCalledTimes(1);
    expect(handlers.on_visibility_change).toHaveBeenLastCalledWith(true);

    expect(container.textContent).toContain(
      "common.onboarding_checklist_complete",
    );
    await click(find_button("common.plan_prompt_action"));
    expect(handlers.on_open_settings).toHaveBeenLastCalledWith("billing");
  });

  it("shows a static completed row on a paid or unknown plan", async () => {
    for (const plan_code of ["star", null]) {
      const handlers = make_handlers();

      mocks.plan_code = plan_code;
      mocks.checklist.state = make_state();
      await render(handlers);
      mocks.checklist.state = make_state(ALL_DONE);
      await render(handlers);

      expect(container.textContent).toContain(
        "common.onboarding_checklist_complete",
      );
      expect(find_button("common.onboarding_checklist_complete")).toBeNull();
      expect(find_button("common.plan_prompt_action")).toBeNull();
      expect(handlers.on_open_settings).not.toHaveBeenCalled();
    }
  });

  it("treats a non-boolean task value as not done", async () => {
    const handlers = make_handlers();

    mocks.checklist.state = make_state({
      ...ALL_DONE,
      first_email: "yes" as unknown as boolean,
    });
    await render(handlers);

    expect(container.querySelectorAll('[data-done="true"]').length).toBe(3);
    expect(handlers.on_all_tasks_done).not.toHaveBeenCalled();
  });

  it("renders nothing while hidden but still reports visibility", async () => {
    const handlers = make_handlers();

    await render(handlers, { hidden: true });

    expect(container.innerHTML).toBe("");
    expect(handlers.on_visibility_change).toHaveBeenLastCalledWith(true);
  });

  it("keeps working when storage throws", async () => {
    const handlers = make_handlers();

    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("denied");
    });

    await render(handlers);
    expect(launcher().getAttribute("aria-expanded")).toBe("true");

    await click(launcher());
    expect(launcher().getAttribute("aria-expanded")).toBe("false");

    await click(launcher());
    await click(find_button("common.onboarding_checklist_domain_get"));
    expect(handlers.on_open_settings).toHaveBeenLastCalledWith("domains");
  });

  it("renders labels as text, never as markup", async () => {
    const { TutorialList } = await import("./tutorial_list");
    const payload = '<img src=x onerror="window.pwned=1">';

    await act(async () => {
      root.render(
        <TutorialList
          is_open
          reduce_motion
          domain_links={[{ key: "a", label: payload, on_click: () => {} }]}
          labels={{
            heading: payload,
            complete: payload,
            complete_action: payload,
            progress: payload,
            task_done: payload,
            domain_heading: payload,
            domain_badge: payload,
            hide_forever: payload,
            shortcuts: payload,
            open: payload,
            close: payload,
          }}
          on_hide_forever={() => {}}
          on_toggle={() => {}}
          tasks={[{ key: "t", label: payload, done: true, on_click: () => {} }]}
        />,
      );
    });

    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toContain(payload);
  });

  it("shows the default heading for an empty task list", async () => {
    const { TutorialList } = await import("./tutorial_list");

    await act(async () => {
      root.render(
        <TutorialList
          is_open
          reduce_motion
          domain_links={[]}
          labels={{
            heading: "heading",
            complete: "complete",
            complete_action: "action",
            progress: "0 of 0",
            task_done: "done",
            domain_heading: "domain",
            domain_badge: "badge",
            hide_forever: "hide",
            shortcuts: "shortcuts",
            open: "open",
            close: "close",
          }}
          on_hide_forever={() => {}}
          on_toggle={() => {}}
          tasks={[]}
        />,
      );
    });

    expect(container.textContent).toContain("heading");
    expect(container.textContent).not.toContain("complete");
    expect(container.textContent).not.toContain("domain");
    expect(progress_width()).toBe("0%");
  });

  it("shows progress in the header, the bar, and the collapsed badge", async () => {
    const handlers = make_handlers();

    mocks.checklist.state = make_state({ first_email: true });
    await render(handlers);

    expect(container.textContent).toContain(
      'common.x_of_y {"current":1,"total":4}',
    );
    expect(progress_width()).toBe("25%");
    expect(remaining_badge()).toBeNull();

    await click(launcher());
    expect(remaining_badge()?.textContent).toBe("3");

    mocks.checklist.state = make_state(ALL_DONE);
    await render(handlers);
    expect(remaining_badge()).toBeNull();

    await click(launcher());
    expect(progress_width()).toBe("100%");
  });

  it("keeps the completed task rows usable", async () => {
    const handlers = make_handlers();

    await render(handlers);
    mocks.checklist.state = make_state(ALL_DONE);
    await render(handlers);

    await click(find_button("common.onboarding_checklist_recovery_method"));
    expect(handlers.on_open_settings).toHaveBeenLastCalledWith("account");
  });
});
