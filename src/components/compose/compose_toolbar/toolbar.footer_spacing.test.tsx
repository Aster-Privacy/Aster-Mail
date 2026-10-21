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
import type { ComposeToolbarState } from "@/components/compose/compose_shared";

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { ComposeToolbar } from "./toolbar";
import { store_format_bar_preference } from "./shared";

import { I18nProvider } from "@/lib/i18n/context";

(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const noop = () => {};

function make_compose(
  overrides: Partial<ComposeToolbarState> = {},
): ComposeToolbarState {
  return {
    scheduled_time: null,
    is_scheduling: false,
    has_recipients: true,
    handle_scheduled_send: noop,
    handle_send: noop,
    is_mac: false,
    schedule_picker_element: null,
    expiration_picker_element: null,
    template_picker_element: null,
    active_formats: new Set<string>(),
    exec_format_command: noop,
    trigger_file_select: noop,
    draft_status: "idle",
    last_saved_time: null,
    handle_show_delete_confirm: null,
    ...overrides,
  };
}

describe("compose toolbar footer spacing", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    localStorage.clear();
  });

  async function action_row(compose: ComposeToolbarState) {
    await act(async () => {
      root.render(
        <I18nProvider default_language="en">
          <ComposeToolbar compose={compose} reduce_motion={true} />
        </I18nProvider>,
      );
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const send = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Send",
    );

    return send!.parentElement!;
  }

  it("pads the action row evenly when the format bar is closed", async () => {
    store_format_bar_preference(false);
    const row = await action_row(make_compose());

    expect(row.className).toContain("pt-2.5");
    expect(row.className).toContain("pb-2.5");
  });

  it("keeps the tight top padding below an open format bar", async () => {
    store_format_bar_preference(true);
    const row = await action_row(make_compose());

    expect(container.querySelector('[role="toolbar"]')).not.toBeNull();
    expect(row.className).toContain("pt-1");
    expect(row.className).not.toContain("pt-2.5");
  });

  it("pads evenly in plain text mode even with the format bar preference on", async () => {
    store_format_bar_preference(true);
    const row = await action_row(
      make_compose({ is_plain_text_mode: true, toggle_plain_text_mode: noop }),
    );

    expect(container.querySelector('[role="toolbar"]')).toBeNull();
    expect(row.className).toContain("pt-2.5");
  });
});
