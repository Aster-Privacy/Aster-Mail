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
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

import { describe, it, expect, vi, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

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
    preferences: {
      theme: "dark",
      color_theme: "default",
      reading_pane_position: "right",
      conversation_grouping: true,
      inbox_categories_enabled: true,
      show_profile_pictures: true,
      mail_list_density: "comfortable",
    },
    update_preference: () => {},
    update_preferences: () => {},
  }),
}));

const { QuickSettingsPanel } = await import("./quick_settings_panel");
const { use_quick_settings_toggle } = await import(
  "./use_quick_settings_toggle"
);

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function read_tailwind_breakpoint_rem(name: string): number {
  const theme_css = readFileSync(
    createRequire(import.meta.url).resolve("tailwindcss/theme.css"),
    "utf8",
  );
  const found = theme_css.match(
    new RegExp(`--breakpoint-${name}:\\s*([\\d.]+)rem`),
  );

  if (!found) throw new Error(`tailwind breakpoint ${name} not found`);

  return Number(found[1]);
}

interface Viewport {
  css_width: number;
  rem_px_in_media_queries: number;
}

function evaluate_query(query: string, viewport: Viewport): boolean {
  const min_width = query.match(/^\(min-width:\s*([\d.]+)(px|rem)\)$/);
  const width_gte = query.match(/^\(width\s*>=\s*([\d.]+)(px|rem)\)$/);
  const found = min_width ?? width_gte;

  if (!found) throw new Error(`unsupported query ${query}`);

  const value = Number(found[1]);
  const threshold =
    found[2] === "rem" ? value * viewport.rem_px_in_media_queries : value;

  return viewport.css_width >= threshold;
}

function install_viewport(viewport: Viewport) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: evaluate_query(query, viewport),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }));
}

function panel_breakpoint_query(): string {
  const container = document.createElement("div");
  const panel_root = createRoot(container);

  act(() => {
    panel_root.render(
      <QuickSettingsPanel
        is_open={true}
        on_close={() => {}}
        on_open_full_settings={() => {}}
      />,
    );
  });
  const panel_class = container.querySelector("aside")?.className ?? "";

  act(() => panel_root.unmount());

  const prefix = panel_class.match(/(?:^|\s)(sm|md|lg|xl|2xl):flex(?:\s|$)/);

  expect(panel_class.split(/\s+/)).toContain("hidden");
  if (!prefix) throw new Error(`panel has no breakpoint: ${panel_class}`);

  return `(width >= ${read_tailwind_breakpoint_rem(prefix[1])}rem)`;
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function render_toggle(open_full_settings: () => void) {
  const result: { current: ReturnType<typeof use_quick_settings_toggle> } = {
    current: null as never,
  };

  function Harness() {
    result.current = use_quick_settings_toggle(open_full_settings);

    return null;
  }

  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root!.render(<Harness />));

  return result;
}

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  vi.unstubAllGlobals();
});

const viewports: Array<[string, Viewport]> = [
  ["a wide window", { css_width: 1280, rem_px_in_media_queries: 16 }],
  ["a narrow window", { css_width: 960, rem_px_in_media_queries: 16 }],
  [
    "WebKitGTK at 125% interface zoom",
    { css_width: 1024, rem_px_in_media_queries: 20 },
  ],
  [
    "WebKitGTK with a 1.125 text scaling factor",
    { css_width: 1137, rem_px_in_media_queries: 18 },
  ],
  [
    "WebKitGTK at 110% interface zoom",
    { css_width: 1163, rem_px_in_media_queries: 17.6 },
  ],
];

describe("use_quick_settings_toggle", () => {
  it.each(viewports)(
    "the settings button always shows something in %s",
    (_label, viewport) => {
      install_viewport(viewport);
      const panel_visible_by_css = evaluate_query(
        panel_breakpoint_query(),
        viewport,
      );
      const open_full_settings = vi.fn();
      const toggle = render_toggle(open_full_settings);

      act(() => toggle.current.toggle());

      const panel_shown = toggle.current.is_open && panel_visible_by_css;
      const full_settings_opened = open_full_settings.mock.calls.length === 1;

      expect(panel_shown || full_settings_opened).toBe(true);
      expect(toggle.current.is_open).toBe(panel_visible_by_css);
    },
  );

  it("closes the open panel on a second click", () => {
    install_viewport({ css_width: 1280, rem_px_in_media_queries: 16 });
    const open_full_settings = vi.fn();
    const toggle = render_toggle(open_full_settings);

    act(() => toggle.current.toggle());
    expect(toggle.current.is_open).toBe(true);
    act(() => toggle.current.toggle());
    expect(toggle.current.is_open).toBe(false);
    expect(open_full_settings).not.toHaveBeenCalled();
  });

  it("opens full settings and keeps the panel closed below the breakpoint", () => {
    install_viewport({ css_width: 900, rem_px_in_media_queries: 16 });
    const open_full_settings = vi.fn();
    const toggle = render_toggle(open_full_settings);

    act(() => toggle.current.toggle());
    expect(toggle.current.is_open).toBe(false);
    expect(open_full_settings).toHaveBeenCalledTimes(1);
  });
});
