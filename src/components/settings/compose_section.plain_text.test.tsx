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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const h = vi.hoisted(() => ({
  i18n: { t: (key: string) => key },
  preferences: {
    compose_mode: "rich_text" as string,
    compose_font_size: "normal",
    compose_font_color: "",
    reply_include_quoted: true,
    reply_prefix_subject: true,
  },
  update_preference: vi.fn(),
}));

vi.mock("@/lib/i18n/context", () => ({ use_i18n: () => h.i18n }));

vi.mock("@/contexts/preferences_context", () => ({
  use_preferences: () => ({
    preferences: h.preferences,
    update_preference: h.update_preference,
  }),
}));

vi.mock("@/components/settings/search_context", () => ({
  use_register_search_items: () => undefined,
}));

vi.mock("@/components/settings/default_sender_setting", () => ({
  DefaultSenderSetting: () => null,
}));

vi.mock("@/components/settings/appearance/color_swatch_picker", () => ({
  ColorSwatchPicker: () => null,
}));

const { ComposeSection } = await import("./compose_section");

let root: Root;
let container: HTMLDivElement;

async function render() {
  await act(async () => root.render(<ComposeSection />));
}

function plain_text_switch(): HTMLInputElement {
  return container.querySelector(
    '[aria-label="settings.plain_text_compose_label"]',
  ) as HTMLInputElement;
}

beforeEach(() => {
  h.update_preference.mockReset();
  h.preferences.compose_mode = "rich_text";
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe("compose in plain text setting", () => {
  it("is off while compose mode is rich text", async () => {
    await render();

    expect(plain_text_switch().checked).toBe(false);
  });

  it("turns plain text compose mode on", async () => {
    await render();
    await act(async () => plain_text_switch().click());

    expect(h.update_preference).toHaveBeenCalledWith(
      "compose_mode",
      "plain_text",
      true,
    );
  });

  it("turns plain text compose mode off again", async () => {
    h.preferences.compose_mode = "plain_text";
    await render();

    expect(plain_text_switch().checked).toBe(true);

    await act(async () => plain_text_switch().click());

    expect(h.update_preference).toHaveBeenCalledWith(
      "compose_mode",
      "rich_text",
      true,
    );
  });
});
