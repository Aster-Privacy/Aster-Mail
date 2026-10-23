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
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const preferences_value: Record<string, unknown> = {};
const update_preference = vi.fn();
const show_toast = vi.fn();
const on_open_full_settings = vi.fn();

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key }),
}));

vi.mock("@aster/ui", async (import_original) => ({
  ...(await import_original<typeof import("@aster/ui")>()),
  Button: ({ children, ...rest }: Record<string, unknown>) => (
    <button type="button" {...rest}>
      {children as never}
    </button>
  ),
  Switch: ({
    checked,
    onCheckedChange,
    ...rest
  }: {
    checked?: boolean;
    onCheckedChange?: (next: boolean) => void;
  }) => (
    <input
      checked={checked}
      data-switch=""
      type="checkbox"
      onChange={() => onCheckedChange?.(!checked)}
      {...rest}
    />
  ),
}));

vi.mock("@/components/ui/info_popover", () => ({
  InfoPopover: ({ description }: { description: string }) => (
    <span data-info={description} />
  ),
}));

vi.mock("@/components/toast/simple_toast", () => ({
  show_toast: (...args: unknown[]) => show_toast(...args),
}));

vi.mock("@/lib/overlay_layer_stack", () => ({
  use_escape_layer: () => {},
}));

vi.mock("@/contexts/theme_context", () => ({
  useTheme: () => ({
    theme_preference: "dark",
    set_theme_preference: () => {},
  }),
}));

vi.mock("@/contexts/preferences_context", () => ({
  use_preferences: () => ({
    preferences: preferences_value,
    update_preference,
    update_preferences: () => {},
  }),
}));

const { QuickSettingsPanel } = await import("./quick_settings_panel");

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function render(): HTMLDivElement {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(
      <QuickSettingsPanel
        is_open={true}
        on_close={() => {}}
        on_open_full_settings={on_open_full_settings}
      />,
    );
  });

  return container;
}

function categories_section(el: HTMLDivElement): HTMLElement {
  const found = Array.from(el.querySelectorAll("section")).find(
    (section) =>
      section.querySelector("h3")?.textContent === "settings.categories_title",
  );

  expect(found).toBeTruthy();

  return found as HTMLElement;
}

beforeEach(() => {
  for (const key of Object.keys(preferences_value)) {
    delete preferences_value[key];
  }
  Object.assign(preferences_value, {
    reading_pane_position: "right",
    inbox_categories_enabled: true,
    enabled_categories: ["promotions", "social"],
    custom_categories: [
      {
        id: "custom:a",
        name: "Work",
        icon: "briefcase",
        match_domains: ["example.com"],
        match_keywords: [],
        enabled: true,
      },
    ],
  });
  update_preference.mockClear();
  show_toast.mockClear();
  on_open_full_settings.mockClear();
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  root = null;
  container = null;
});

describe("QuickSettingsPanel inbox categories", () => {
  it("shows a labeled toggle with an info popover", () => {
    const el = categories_section(render());
    const toggle = el.querySelector<HTMLInputElement>("[data-switch]")!;

    expect(toggle.checked).toBe(true);
    expect(
      el.querySelector(`#${toggle.getAttribute("aria-labelledby")}`)
        ?.textContent,
    ).toBe("settings.quick_inbox_categories");
    expect(
      el.querySelector("[data-info]")?.getAttribute("data-info"),
    ).toBe("settings.inbox_categories_description");
  });

  it("reflects the setting when turned off", () => {
    preferences_value["inbox_categories_enabled"] = false;

    const el = categories_section(render());

    expect(el.querySelector<HTMLInputElement>("[data-switch]")!.checked).toBe(
      false,
    );
  });

  it("turns categories off with an undo toast", () => {
    const el = categories_section(render());

    act(() => {
      el.querySelector<HTMLInputElement>("[data-switch]")!.click();
    });

    expect(update_preference).toHaveBeenCalledWith(
      "inbox_categories_enabled",
      false,
      true,
    );
    expect(show_toast).toHaveBeenCalledTimes(1);

    const [message, icon, , action] = show_toast.mock.calls[0];

    expect(message).toBe("settings.quick_categories_turned_off");
    expect(icon).toBe("success");
    expect(action.label).toBe("common.undo");

    act(() => {
      action.on_click();
    });

    expect(update_preference).toHaveBeenLastCalledWith(
      "inbox_categories_enabled",
      true,
      true,
    );
    expect(show_toast.mock.calls[1][0]).toBe(
      "settings.quick_categories_turned_on",
    );
    expect(show_toast.mock.calls[1][3]).toBeUndefined();
  });

  it("opens the categories settings tab", () => {
    const el = categories_section(render());

    const manage = Array.from(el.querySelectorAll("button")).find(
      (button) => button.textContent === "settings.quick_manage_categories",
    );

    act(() => {
      manage!.click();
    });

    expect(on_open_full_settings).toHaveBeenCalledWith("categories");
  });
});
