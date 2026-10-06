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
import type { ComponentType, SVGProps } from "react";

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { ViewerToolbarActions } from "./toolbar_actions";

import {
  NotSpamIcon,
  ReportSpamIcon,
} from "@/components/email/spam_action_icons";

let toolbar_mode: "simple" | "advanced" = "advanced";

vi.mock("@aster/ui", async (import_original) => ({
  ...(await import_original<typeof import("@aster/ui")>()),
  Button: React.forwardRef<HTMLButtonElement, Record<string, unknown>>(
    function Button({ children, ...rest }, ref) {
      return React.createElement(
        "button",
        { ...(rest as object), ref },
        children as React.ReactNode,
      );
    },
  ),
  Tooltip: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({
    t: (key: string, params?: Record<string, string | number>) =>
      params ? `${key}:${JSON.stringify(params)}` : key,
  }),
}));

vi.mock("@/contexts/preferences_context", () => ({
  use_preferences: () => ({
    preferences: { viewer_toolbar_mode: toolbar_mode },
    update_preference: vi.fn(),
  }),
}));

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const icon_markup = (Icon: ComponentType<SVGProps<SVGSVGElement>>) => {
  const host = document.createElement("div");
  const icon_root = createRoot(host);

  act(() => icon_root.render(<Icon />));
  const markup = host.querySelector("svg")?.innerHTML;

  act(() => icon_root.unmount());

  return markup;
};

const noop = () => {};

const props = {
  is_pinned: false,
  is_pin_loading: false,
  is_archive_loading: false,
  is_trash_loading: false,
  is_spam_loading: false,
  is_read: true,
  thread_messages: [],
  thread_expand_state: {
    all_expanded: false,
    all_collapsed: false,
    has_unread: false,
  },
  thread_list_ref: { current: null },
  email: {} as never,
  mail_item: null,
  on_pin_toggle: noop,
  on_archive: noop,
  on_trash: noop,
  on_read_toggle: noop,
  on_spam: noop,
  on_print: noop,
  on_unsubscribe: noop,
  folders: [{ id: "f1", name: "Receipts", color: "#ff0000" }],
  on_folder_toggle: noop,
};

describe("ViewerToolbarActions button order", () => {
  let container: HTMLDivElement;
  let root: Root;

  const labels = () =>
    Array.from(container.querySelectorAll("button")).map(
      (b) => b.getAttribute("aria-label") ?? b.getAttribute("title") ?? "more",
    );

  const render = async () => {
    await act(async () => {
      root.render(<ViewerToolbarActions {...props} />);
    });
  };

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("renders archive, spam, delete, unread, move to, then the overflow menu", async () => {
    toolbar_mode = "advanced";
    await render();

    expect(labels()).toEqual([
      "mail.pin_to_top",
      "mail.archive_action",
      "mail.report_spam",
      "mail.move_to_trash",
      "mail.mark_as_unread",
      "mail.move_to_folder",
      "common.more",
    ]);
  });

  it("names the message count on a multi message conversation", async () => {
    toolbar_mode = "advanced";
    await act(async () => {
      root.render(
        <ViewerToolbarActions
          {...props}
          thread_messages={[{}, {}, {}] as never}
        />,
      );
    });

    expect(labels()).toContain('mail.archive_conversation_count:{"count":3}');
    expect(labels()).toContain(
      'mail.move_conversation_to_trash_count:{"count":3}',
    );
  });

  it("keeps the reduced set when the account opts back into simple mode", async () => {
    toolbar_mode = "simple";
    await render();

    expect(labels()).toEqual([
      "mail.pin_to_top",
      "mail.archive_action",
      "mail.move_to_trash",
      "common.more",
    ]);
  });

  it("gives not spam its own icon instead of the report spam one", async () => {
    toolbar_mode = "advanced";
    const button_icon = (label: string) =>
      container
        .querySelector(`button[aria-label="${label}"]`)
        ?.querySelector("svg")?.innerHTML;

    await render();
    const report_icon = button_icon("mail.report_spam");

    await act(async () => {
      root.render(
        <ViewerToolbarActions {...props} is_spam on_not_spam={noop} />,
      );
    });
    const not_spam_icon = button_icon("mail.not_spam");

    expect(report_icon).toBe(icon_markup(ReportSpamIcon));
    expect(not_spam_icon).toBe(icon_markup(NotSpamIcon));
  });
});
