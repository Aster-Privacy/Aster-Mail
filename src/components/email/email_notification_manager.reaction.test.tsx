//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";

const show_notification = vi.fn();
let item_labels: Array<{ token: string }> = [];
let muted_folder_tokens: string[] = [];

vi.mock("@/contexts/auth_context", () => ({
  use_auth: () => ({ is_authenticated: true, current_account_id: "a1" }),
}));

vi.mock("@/contexts/preferences_context", () => ({
  use_preferences: () => ({
    preferences: {
      desktop_notifications: false,
      low_network_mode: true,
      notify_new_email: true,
      muted_folder_tokens,
      muted_notification_categories: [],
    },
  }),
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key }),
}));

vi.mock("@/services/notification_service", () => ({
  request_notification_permission: vi.fn(),
  show_notification: (...args: unknown[]) => show_notification(...args),
}));

vi.mock("@/services/category_index", () => ({
  get_arrival_reply_state: () => false,
  get_arrival_category: () => null,
  fold_to_active_tab: (category: string) => category,
}));

vi.mock("@/services/push_subscription", () => ({
  subscribe_to_push: vi.fn(),
}));

vi.mock("@/services/lockdown_store", () => ({
  is_lockdown_enabled: () => false,
}));

vi.mock("@/services/api/mail", () => ({
  get_mail_item_folders: async () => ({
    data: { labels: item_labels },
    error: null,
  }),
}));

vi.mock("@/services/locked_folders", () => ({
  get_locked_folder_tokens: () => new Set<string>(),
  has_protected_folders: () => false,
}));

const { EmailNotificationManager } =
  await import("./email_notification_manager");
const { MAIL_EVENTS } = await import("@/hooks/mail_events");

let container: HTMLDivElement;
let root: Root | null = null;

function mount(): void {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(createElement(EmailNotificationManager));
  });
}

async function receive_reaction(detail: {
  reaction_id?: string;
  target_id?: string;
}): Promise<void> {
  await act(async () => {
    window.dispatchEvent(
      new CustomEvent(MAIL_EVENTS.REACTION_RECEIVED, { detail }),
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}

describe("email notification manager reactions", () => {
  beforeEach(() => {
    show_notification.mockClear();
    item_labels = [];
    muted_folder_tokens = [];
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    root = null;
    container.remove();
  });

  it("shows a content-free notification that opens the reacted-to message", async () => {
    mount();

    await receive_reaction({ reaction_id: "r-a", target_id: "m-a" });

    expect(show_notification).toHaveBeenCalledTimes(1);

    const [type, options] = show_notification.mock.calls[0];

    expect(type).toBe("reaction");
    expect(options).toEqual({
      title: "common.aster_mail",
      body: "common.new_reaction_body",
      tag: "reaction-m-a",
      data: { email_id: "m-a" },
    });
  });

  it("notifies once when the same reaction is announced twice", async () => {
    mount();

    await receive_reaction({ reaction_id: "r-b", target_id: "m-b" });
    await receive_reaction({ reaction_id: "r-b", target_id: "m-b" });

    expect(show_notification).toHaveBeenCalledTimes(1);
  });

  it("ignores an event that lacks the reaction or the target", async () => {
    mount();

    await receive_reaction({ reaction_id: "r-c" });
    await receive_reaction({ target_id: "m-c" });

    expect(show_notification).not.toHaveBeenCalled();
  });
});
