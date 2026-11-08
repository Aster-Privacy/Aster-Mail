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
import { act, createElement, useSyncExternalStore } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";

(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

interface LayoutPrefs {
  sidebar_section_order: string[];
  sidebar_hidden_items: string[];
}

const store = vi.hoisted(() => {
  let state = {
    sidebar_section_order: ["mail", "folders", "labels", "aliases"],
    sidebar_hidden_items: [] as string[],
  };
  const listeners = new Set<() => void>();
  const calls: Array<{ key: string; value: unknown; immediate?: boolean }> = [];

  return {
    get: () => state,
    set: (next: Partial<typeof state>) => {
      state = { ...state, ...next };
      listeners.forEach((listener) => listener());
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },
    calls,
  };
});

vi.mock("@/lib/i18n/context", () => {
  const t = (key: string, params?: Record<string, string>) =>
    params?.name ? `${key}:${params.name}` : key;
  const i18n = { t };

  return { use_i18n: () => i18n };
});

vi.mock("@/contexts/preferences_context", () => ({
  use_preferences: () => {
    const preferences = useSyncExternalStore(store.subscribe, store.get);

    return {
      preferences,
      update_preference: (key: string, value: unknown, immediate?: boolean) => {
        store.calls.push({ key, value, immediate });
        store.set({ [key]: value });
      },
      update_preferences: (
        updates: Record<string, unknown>,
        immediate?: boolean,
      ) => {
        Object.entries(updates).forEach(([key, value]) =>
          store.calls.push({ key, value, immediate }),
        );
        store.set(updates);
      },
    };
  },
}));

import { SidebarLayoutSetting } from "./sidebar_layout_setting";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function set_prefs(next: Partial<LayoutPrefs>) {
  act(() => {
    store.set(next);
  });
}

function render_setting() {
  act(() => {
    root!.render(createElement(SidebarLayoutSetting));
  });
}

function prefs(): LayoutPrefs {
  return store.get();
}

function switch_for(label: string): HTMLInputElement {
  const input = container!.querySelector<HTMLInputElement>(
    `input[type="checkbox"][aria-label="${label}"]`,
  );

  if (!input) throw new Error(`switch ${label} not found`);

  return input;
}

function move_button(direction: "up" | "down", name: string) {
  const button = container!.querySelector<HTMLButtonElement>(
    `button[aria-label="settings.sidebar_move_section_${direction}:${name}"]`,
  );

  if (!button) throw new Error(`move ${direction} ${name} not found`);

  return button;
}

function reset_button(): HTMLButtonElement {
  const button = Array.from(container!.querySelectorAll("button")).find(
    (candidate) =>
      candidate.textContent?.trim() === "settings.reset_sidebar_layout",
  );

  if (!button) throw new Error("reset button not found");

  return button as HTMLButtonElement;
}

function section_names(): string[] {
  return Array.from(
    container!.querySelectorAll<HTMLButtonElement>(
      'button[aria-label^="settings.sidebar_move_section_up:"]',
    ),
  ).map((button) => button.getAttribute("aria-label")!.split(":")[1]);
}

function click(element: HTMLElement) {
  act(() => {
    element.click();
  });
}

beforeEach(() => {
  store.calls.length = 0;
  store.set({
    sidebar_section_order: ["mail", "folders", "labels", "aliases"],
    sidebar_hidden_items: [],
  });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  root = null;
  container = null;
  document.body.innerHTML = "";
});

describe("SidebarLayoutSetting", () => {
  it("lists the sections in the saved order", () => {
    set_prefs({ sidebar_section_order: ["aliases", "mail", "labels"] });
    render_setting();

    expect(section_names()).toEqual([
      "common.aliases",
      "common.mail",
      "common.labels",
      "common.folders",
    ]);
  });

  it("disables moving the first section up and the last section down", () => {
    render_setting();

    expect(move_button("up", "common.mail").disabled).toBe(true);
    expect(move_button("down", "common.mail").disabled).toBe(false);
    expect(move_button("down", "common.aliases").disabled).toBe(true);
    expect(move_button("up", "common.aliases").disabled).toBe(false);
  });

  it("moves a section and saves right away", () => {
    render_setting();
    click(move_button("up", "common.labels"));

    expect(prefs().sidebar_section_order).toEqual([
      "mail",
      "labels",
      "folders",
      "aliases",
    ]);
    expect(store.calls.at(-1)).toEqual({
      key: "sidebar_section_order",
      value: ["mail", "labels", "folders", "aliases"],
      immediate: true,
    });
    expect(section_names()).toEqual([
      "common.mail",
      "common.labels",
      "common.folders",
      "common.aliases",
    ]);
  });

  it("keeps unknown section ids from newer clients when moving", () => {
    set_prefs({
      sidebar_section_order: [
        "mail",
        "calendar",
        "folders",
        "labels",
        "aliases",
      ],
    });
    render_setting();
    click(move_button("up", "common.folders"));

    expect(prefs().sidebar_section_order).toEqual([
      "folders",
      "calendar",
      "mail",
      "labels",
      "aliases",
    ]);
  });

  it("offers no visibility switch for the Mail section", () => {
    render_setting();

    expect(
      container!.querySelector('input[aria-label="common.mail"]'),
    ).toBeNull();
    expect(container!.textContent).toContain(
      "settings.sidebar_mail_section_description",
    );
  });

  it("hides and shows a section", () => {
    render_setting();

    expect(switch_for("common.labels").checked).toBe(true);

    click(switch_for("common.labels"));
    expect(prefs().sidebar_hidden_items).toEqual(["labels"]);
    expect(switch_for("common.labels").checked).toBe(false);

    click(switch_for("common.labels"));
    expect(prefs().sidebar_hidden_items).toEqual([]);
  });

  it("does not toggle a section when its move buttons are clicked", () => {
    render_setting();
    click(move_button("down", "common.folders"));

    expect(prefs().sidebar_hidden_items).toEqual([]);
    expect(prefs().sidebar_section_order).toEqual([
      "mail",
      "labels",
      "folders",
      "aliases",
    ]);
  });

  it("hides mail items and never offers Inbox", () => {
    render_setting();

    expect(
      container!.querySelector('input[aria-label="mail.inbox"]'),
    ).toBeNull();

    click(switch_for("mail.trash"));
    click(switch_for("common.subscriptions"));

    expect(prefs().sidebar_hidden_items).toEqual(["trash", "subscriptions"]);
    expect(store.calls.every((call) => call.immediate === true)).toBe(true);
  });

  it("keeps unknown hidden ids when toggling", () => {
    set_prefs({ sidebar_hidden_items: ["future_item"] });
    render_setting();
    click(switch_for("mail.spam"));

    expect(prefs().sidebar_hidden_items).toEqual(["future_item", "spam"]);
  });

  it("enables reset only when the layout differs from the default", () => {
    render_setting();
    expect(reset_button().disabled).toBe(true);

    click(switch_for("mail.sent"));
    expect(reset_button().disabled).toBe(false);

    click(reset_button());
    expect(prefs()).toEqual({
      sidebar_section_order: ["mail", "folders", "labels", "aliases"],
      sidebar_hidden_items: [],
    });
    expect(reset_button().disabled).toBe(true);
    expect(switch_for("mail.sent").checked).toBe(true);
  });

  it("renders safely when the stored values are malformed", () => {
    set_prefs({
      sidebar_section_order: "aliases" as unknown as string[],
      sidebar_hidden_items: { 0: "trash" } as unknown as string[],
    });
    render_setting();

    expect(section_names()).toEqual([
      "common.mail",
      "common.folders",
      "common.labels",
      "common.aliases",
    ]);
    expect(switch_for("mail.trash").checked).toBe(true);
  });
});
