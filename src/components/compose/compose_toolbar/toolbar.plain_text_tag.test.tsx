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
import type { LanguageCode } from "@/lib/i18n/types";

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";

import { ComposeToolbar } from "./toolbar";

import { I18nProvider } from "@/lib/i18n/context";
import { get_translations_async } from "@/lib/i18n/translations";

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

function Harness({
  initial_plain,
  on_toggle,
}: {
  initial_plain: boolean;
  on_toggle?: () => void;
}) {
  const [is_plain, set_is_plain] = useState(initial_plain);

  return (
    <ComposeToolbar
      compose={make_compose({
        is_plain_text_mode: is_plain,
        toggle_plain_text_mode: () => {
          on_toggle?.();
          set_is_plain((p) => !p);
        },
      })}
      reduce_motion={true}
    />
  );
}

describe("compose toolbar plain text tag", () => {
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
  });

  async function render(node: React.ReactNode, language: LanguageCode = "en") {
    await act(async () => {
      root.render(
        <I18nProvider default_language={language}>{node}</I18nProvider>,
      );
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }

  function find_tag(name: string) {
    return Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === name,
    );
  }

  it("shows the tag only in plain text mode", async () => {
    await render(<Harness initial_plain={true} />);
    expect(find_tag("Plain text")).toBeDefined();

    await render(<Harness key="rich" initial_plain={false} />);
    expect(find_tag("Plain text")).toBeUndefined();
  });

  it("has an accessible name, a pressed state and a description", async () => {
    await render(<Harness initial_plain={true} />);
    const tag = find_tag("Plain text")!;

    expect(tag.tagName).toBe("BUTTON");
    expect(tag.getAttribute("type")).toBe("button");
    expect(tag.tabIndex).toBe(0);
    expect(tag.getAttribute("aria-pressed")).toBe("true");
    expect(tag.getAttribute("title")).toBe("Switch to rich text");
  });

  it("uses the European Portuguese label", async () => {
    await get_translations_async("pt");
    await render(<Harness initial_plain={true} />, "pt");
    expect(find_tag("Texto simples")).toBeDefined();
  });

  it("leaves plain text mode when pressed", async () => {
    const on_toggle = vi.fn();

    await render(<Harness initial_plain={true} on_toggle={on_toggle} />);
    const tag = find_tag("Plain text")!;

    await act(async () => {
      tag.click();
    });

    expect(on_toggle).toHaveBeenCalledTimes(1);
    expect(find_tag("Plain text")).toBeUndefined();
    expect(
      container.querySelector('button[title="Switch to plain text"]'),
    ).not.toBeNull();
  });

  it("moves focus to the editor when activated from the keyboard", async () => {
    const focus = vi.fn();

    function FocusHarness() {
      const [is_plain, set_is_plain] = useState(true);

      return (
        <ComposeToolbar
          compose={make_compose({
            is_plain_text_mode: is_plain,
            toggle_plain_text_mode: () => set_is_plain(false),
            editor: { focus } as unknown as ComposeToolbarState["editor"],
          })}
          reduce_motion={true}
        />
      );
    }

    await render(<FocusHarness />);
    const tag = find_tag("Plain text")!;

    tag.focus();
    await act(async () => {
      tag.click();
    });

    expect(focus).toHaveBeenCalledTimes(1);
  });
});
