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

const preferences_value: Record<string, unknown> = {
  theme: "dark",
  color_theme: "default",
  custom_theme_seed: "#3b82f6",
  theme_sync_enabled_web: true,
  theme_web: "",
  color_theme_web: "",
  custom_theme_seed_web: "",
  reading_pane_position: "right",
  conversation_grouping: true,
  inbox_categories_enabled: true,
  show_profile_pictures: true,
  mail_list_density: "comfortable",
};

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key }),
}));

vi.mock("@aster/ui", () => ({
  Button: ({ children, ...rest }: Record<string, unknown>) => (
    <button type="button" {...rest}>
      {children as never}
    </button>
  ),
  Switch: ({ checked }: { checked?: boolean }) => (
    <span data-checked={String(checked)} />
  ),
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
    update_preference: () => {},
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
        on_open_full_settings={() => {}}
      />,
    );
  });

  return container;
}

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  root = null;
  container = null;
  preferences_value["color_theme"] = "default";
  preferences_value["color_theme_web"] = "";
});

function theme_radio(el: HTMLDivElement, label: string): HTMLButtonElement {
  const found = Array.from(
    el.querySelectorAll<HTMLButtonElement>("[role='radio']"),
  ).find((button) => button.textContent?.includes(label));

  expect(found, `no option labelled ${label}`).toBeTruthy();

  return found as HTMLButtonElement;
}

describe("QuickSettingsPanel theme selection", () => {
  it("marks dark as selected when no color theme is active", () => {
    const el = render();

    expect(theme_radio(el, "settings.theme_dark").getAttribute("aria-checked")).toBe(
      "true",
    );
  });

  it("marks neither light nor dark when a color theme is active", () => {
    preferences_value["color_theme"] = "purple";

    const el = render();

    expect(theme_radio(el, "settings.theme_dark").getAttribute("aria-checked")).toBe(
      "false",
    );
    expect(
      theme_radio(el, "settings.theme_light").getAttribute("aria-checked"),
    ).toBe("false");
  });
});
