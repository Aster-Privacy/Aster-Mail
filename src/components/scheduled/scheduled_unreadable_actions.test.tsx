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

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const api = vi.hoisted(() => ({
  cancel_scheduled_email: vi.fn(async () => ({ data: { success: true } })),
  send_scheduled_now: vi.fn(async () => ({ data: { success: true } })),
  reschedule_email: vi.fn(async () => ({ data: { success: true } })),
  get_scheduled_email_for_edit: vi.fn(async () => ({ error: "nope" })),
}));

vi.mock("@/services/api/scheduled", () => api);

vi.mock("@/lib/i18n/context", () => {
  const i18n = { t: (k: string) => k };

  return { use_i18n: () => i18n };
});

vi.mock("@/contexts/auth_context", () => {
  const auth = { vault: { identity_key: "k" } };

  return { use_auth: () => auth };
});

vi.mock("@/contexts/preferences_context", () => {
  const prefs = { preferences: {} };

  return { use_preferences: () => prefs };
});

vi.mock("@/provider", () => ({ use_should_reduce_motion: () => true }));

vi.mock("@/components/email/hooks/popup_viewer_drag", () => ({
  use_popup_drag_resize: () => ({
    popup_size: "default",
    position: { x: 0, y: 0 },
    is_dragging: false,
    is_fullscreen: false,
    is_exiting_fullscreen: false,
    dimensions: { width: 600, height: 600 },
    popup_ref: { current: null },
    handle_drag_start: () => {},
    toggle_size: () => {},
    handle_fullscreen: () => {},
  }),
}));

vi.mock("@/components/compose/schedule_picker", () => ({
  SchedulePicker: ({
    trigger,
    on_schedule,
  }: {
    trigger: ReactNode;
    on_schedule: (d: Date | null) => void;
  }) => (
    <div
      data-picker
      role="presentation"
      onClick={() => on_schedule(new Date("2030-01-01T00:00:00Z"))}
    >
      {trigger}
    </div>
  ),
}));

vi.mock("@/components/ui/dropdown_menu", () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuContent: ({ children }: { children: ReactNode }) => (
    <div data-menu>{children}</div>
  ),
  DropdownMenuItem: ({
    children,
    onClick,
  }: {
    children: ReactNode;
    onClick?: () => void;
  }) => (
    <button role="menuitem" type="button" onClick={onClick}>
      {children}
    </button>
  ),
  DropdownMenuSeparator: () => null,
}));

vi.mock("@/components/modals/confirmation_modal", () => ({
  ConfirmationModal: ({
    is_open,
    on_confirm,
  }: {
    is_open: boolean;
    on_confirm: () => void;
  }) =>
    is_open ? (
      <button data-confirm type="button" onClick={on_confirm}>
        confirm
      </button>
    ) : null,
}));

vi.mock("@/components/email/sandboxed_email_renderer", () => ({
  SandboxedEmailRenderer: () => null,
}));
vi.mock("@/components/ui/profile_avatar", () => ({
  ProfileAvatar: () => null,
}));
vi.mock("@/components/compose/ddg_favicon", () => ({ DdgFavicon: () => null }));
vi.mock("@/components/toast/action_toast", () => ({
  show_action_toast: () => {},
}));
vi.mock("@/components/toast/simple_toast", () => ({ show_toast: () => {} }));
vi.mock("@/hooks/mail_events", () => ({
  emit_email_sent: () => {},
  emit_mail_changed: () => {},
  emit_scheduled_changed: () => {},
}));

const { ScheduledPopupViewer } = await import("./scheduled_popup_viewer");
const { SplitScheduledViewer } = await import("./split_scheduled_viewer");

const OFFERED_ONLY_WHEN_READABLE = [
  "common.send_now",
  "common.reschedule",
  "common.edit",
  "common.edit_reschedule",
];

function make_data(content_verified: boolean | undefined) {
  return {
    id: "s1",
    to_recipients: content_verified === false ? [] : ["a@example.org"],
    cc_recipients: [],
    bcc_recipients: [],
    subject:
      content_verified === false ? "common.unable_to_decrypt" : "Subject",
    body: "",
    scheduled_at: "2030-01-01T00:00:00Z",
    status: "pending",
    content_verified,
  };
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  for (const fn of Object.values(api)) fn.mockClear();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function offered_labels(): string[] {
  const labels: string[] = [];

  container.querySelectorAll("button").forEach((b) => {
    const aria = b.getAttribute("aria-label");

    if (aria) labels.push(aria);
    labels.push((b.textContent ?? "").trim());
  });

  return labels;
}

async function click_everything(): Promise<void> {
  const targets = [
    ...container.querySelectorAll("button"),
    ...container.querySelectorAll("[data-picker]"),
  ];

  for (const el of targets) {
    if (el.hasAttribute("data-confirm")) continue;
    await act(async () => {
      (el as HTMLElement).click();
    });
  }
}

async function confirm_cancel(): Promise<void> {
  const confirm = container.querySelector("[data-confirm]") as HTMLElement;

  expect(confirm).not.toBeNull();
  await act(async () => {
    confirm.click();
  });
}

const VIEWERS = [
  ["popup viewer", ScheduledPopupViewer],
  ["split viewer", SplitScheduledViewer],
] as const;

describe.each(VIEWERS)("scheduled %s", (_name, Viewer) => {
  it("offers only cancel for a message it could not open", async () => {
    await act(async () => {
      root.render(
        <Viewer
          on_close={() => {}}
          on_edit={() => {}}
          scheduled_data={make_data(false)}
        />,
      );
    });

    const labels = offered_labels();

    for (const label of OFFERED_ONLY_WHEN_READABLE) {
      expect(labels).not.toContain(label);
    }
    expect(container.querySelector("[data-picker]")).toBeNull();
    expect(
      labels.some(
        (l) =>
          l === "common.cancel_scheduled" ||
          l === "mail.cancel_scheduled_email",
      ),
    ).toBe(true);

    await click_everything();

    expect(api.send_scheduled_now).not.toHaveBeenCalled();
    expect(api.reschedule_email).not.toHaveBeenCalled();
    expect(api.get_scheduled_email_for_edit).not.toHaveBeenCalled();

    await confirm_cancel();

    expect(api.cancel_scheduled_email).toHaveBeenCalledWith("s1");
  });

  it("keeps every action for a message it opened", async () => {
    await act(async () => {
      root.render(
        <Viewer
          on_close={() => {}}
          on_edit={() => {}}
          scheduled_data={make_data(true)}
        />,
      );
    });

    const labels = offered_labels();

    expect(labels).toContain("common.send_now");
    expect(labels).toContain("common.reschedule");
    expect(labels).toContain("common.edit");
  });
});
