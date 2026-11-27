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
import type { ReactNode } from "react";
import type { ComposeToolbarState } from "@/components/compose/compose_shared";

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { ComposeToolbar } from "./toolbar";
import { PriorityTag } from "./priority_picker";

import { I18nProvider } from "@/lib/i18n/context";

(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const noop = () => {};

function make_compose(): ComposeToolbarState {
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
    draft_status: "saved",
    last_saved_time: null,
    handle_show_delete_confirm: null,
    priority: "high",
    set_priority: noop,
  };
}

describe("compose priority chip placement", () => {
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

  async function render(node: ReactNode) {
    await act(async () => {
      root.render(<I18nProvider default_language="en">{node}</I18nProvider>);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }

  it("keeps the chip out of the footer when the header shows it", async () => {
    await render(
      <ComposeToolbar
        compose={make_compose()}
        reduce_motion={true}
        show_priority_tag={false}
      />,
    );

    expect(container.textContent).not.toContain("High priority");
  });

  it("still shows the chip in the footer by default", async () => {
    await render(
      <ComposeToolbar compose={make_compose()} reduce_motion={true} />,
    );

    expect(container.textContent).toContain("High priority");
  });

  it("renders the header chip next to a truncating title", async () => {
    await render(
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <h2 className="min-w-0 truncate">A very long subject line</h2>
        <PriorityTag compose={make_compose()} />
      </div>,
    );
    const chip = Array.from(container.querySelectorAll("*")).find(
      (el) => el.textContent === "High priority",
    );

    expect(chip?.className).toContain("flex-shrink-0");
  });

  it("lets the saved label truncate instead of overflowing", async () => {
    await render(
      <ComposeToolbar compose={make_compose()} reduce_motion={true} />,
    );
    const status = container.querySelector(
      '[data-testid="compose_draft_status"]',
    );
    const label = status?.querySelector("span.truncate");

    expect(status?.className).toContain("min-w-0");
    expect(label?.textContent).toBe("Saved");
    expect(label?.parentElement?.getAttribute("title")).toBe("Saved");
  });
});
