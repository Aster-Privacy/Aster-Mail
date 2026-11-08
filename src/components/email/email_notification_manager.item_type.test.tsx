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
const item_types = new Map<string, string>();
let list_fails = false;

vi.mock("@/contexts/auth_context", () => ({
  use_auth: () => ({ is_authenticated: true, current_account_id: "a1" }),
}));

vi.mock("@/contexts/preferences_context", () => ({
  use_preferences: () => ({
    preferences: {
      desktop_notifications: false,
      low_network_mode: true,
      notify_new_email: true,
      muted_folder_tokens: [],
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
  get_arrival_category_state: () => ({
    category: "primary",
    provisional: false,
  }),
  fold_to_active_tab: (category: string) => category,
}));

vi.mock("@/services/push_subscription", () => ({
  subscribe_to_push: vi.fn(),
}));

vi.mock("@/services/lockdown_store", () => ({
  is_lockdown_enabled: () => false,
}));

vi.mock("@/services/api/mail", () => ({
  get_mail_item_folders: async () => ({ data: { labels: [] }, error: null }),
  list_mail_items: async (params: { ids?: string[] }) => {
    if (list_fails) {
      return { data: null, error: "network" };
    }
    const items = (params.ids ?? [])
      .filter((id) => item_types.has(id))
      .map((id) => ({ id, item_type: item_types.get(id) }));

    return {
      data: { items, total: items.length, has_more: false },
      error: null,
    };
  },
}));

vi.mock("@/services/locked_folders", () => ({
  get_locked_folder_tokens: () => new Set<string>(),
  has_protected_folders: () => false,
}));

const { EmailNotificationManager } = await import(
  "./email_notification_manager"
);
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

async function receive_email(email_id: string): Promise<void> {
  await act(async () => {
    window.dispatchEvent(
      new CustomEvent(MAIL_EVENTS.EMAIL_RECEIVED, { detail: { email_id } }),
    );
    await Promise.resolve();
  });
}

async function wait_for_burst_window(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 1600));
  });
}

describe("email notification manager item type", () => {
  beforeEach(() => {
    show_notification.mockClear();
    item_types.clear();
    list_fails = false;
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    root = null;
    container.remove();
  });

  it("notifies for a received message", async () => {
    item_types.set("m-received", "received");
    mount();

    await receive_email("m-received");
    await wait_for_burst_window();

    expect(show_notification).toHaveBeenCalledTimes(1);
  });

  for (const item_type of ["sent", "draft", "scheduled", "outbox"]) {
    it(`stays silent for a ${item_type} item`, async () => {
      item_types.set(`m-${item_type}`, item_type);
      mount();

      await receive_email(`m-${item_type}`);
      await wait_for_burst_window();

      expect(show_notification).not.toHaveBeenCalled();
    });
  }

  it("notifies when the item type cannot be read", async () => {
    item_types.set("m-offline", "sent");
    list_fails = true;
    mount();

    await receive_email("m-offline");
    await wait_for_burst_window();

    expect(show_notification).toHaveBeenCalledTimes(1);
  });

  it("notifies when the item is not returned yet", async () => {
    mount();

    await receive_email("m-pending");
    await wait_for_burst_window();

    expect(show_notification).toHaveBeenCalledTimes(1);
  });
});
