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
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";

const show_notification = vi.fn();
const envelopes = new Map<string, unknown>();
const preferences = {
  desktop_notifications: false,
  low_network_mode: false,
  notify_new_email: true,
  show_profile_pictures: true,
  muted_folder_tokens: [] as string[],
  muted_notification_categories: [] as string[],
};

vi.mock("@/contexts/auth_context", () => ({
  use_auth: () => ({ is_authenticated: true, current_account_id: "a1" }),
}));

vi.mock("@/contexts/preferences_context", () => ({
  use_preferences: () => ({ preferences }),
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
  is_any_lockdown_active: () => false,
}));

vi.mock("@/hooks/email_list_helpers", () => ({
  decrypt_envelope: async (_encrypted: string, _nonce: string, id: string) =>
    envelopes.get(id) ?? null,
}));

vi.mock("@/lib/favicon_url", () => ({
  get_favicon_url: (domain: string) => `/api/images/v1/favicon/${domain}`,
}));

vi.mock("@/services/api/mail", () => ({
  get_mail_item_folders: async () => ({ data: { labels: [] }, error: null }),
  list_mail_items: async (params: { ids?: string[] }) => {
    const items = (params.ids ?? []).map((id) => ({
      id,
      item_type: "received",
      encrypted_envelope: "sealed",
      envelope_nonce: "nonce",
    }));

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

function last_options(): Record<string, unknown> {
  return show_notification.mock.calls.at(-1)?.[1] as Record<string, unknown>;
}

describe("email notification manager sender preview", () => {
  beforeEach(() => {
    show_notification.mockClear();
    envelopes.clear();
    preferences.show_profile_pictures = true;
    preferences.low_network_mode = false;
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    root = null;
    container.remove();
  });

  it("shows the decrypted sender, subject and sender logo", async () => {
    envelopes.set("m-shop", {
      subject: "Your order has shipped",
      body_text: "Tracking details inside",
      from: { name: "Example Shop", email: "orders@mail.example.com" },
    });
    mount();

    await receive_email("m-shop");
    await wait_for_burst_window();

    expect(show_notification).toHaveBeenCalledTimes(1);
    expect(last_options()).toMatchObject({
      title: "Example Shop",
      body: "Your order has shipped",
      icon: "/api/images/v1/favicon/example.com",
      data: { email_id: "m-shop" },
    });
  });

  it("leaves out the logo when profile pictures are off", async () => {
    preferences.show_profile_pictures = false;
    envelopes.set("m-plain", {
      subject: "Hello",
      body_text: "Hi",
      from: { name: "Robin", email: "robin@example.org" },
    });
    mount();

    await receive_email("m-plain");
    await wait_for_burst_window();

    expect(last_options()).toMatchObject({ title: "Robin", body: "Hello" });
    expect(last_options().icon).toBeUndefined();
  });

  it("names the sender of sealed mail without its subject", async () => {
    envelopes.set("m-sealed", {
      subject: "",
      body_text: JSON.stringify({ type: "double_ratchet_v1" }),
      from: { name: "", email: "sam@astermail.org" },
    });
    mount();

    await receive_email("m-sealed");
    await wait_for_burst_window();

    expect(last_options()).toMatchObject({
      title: "Sam",
      body: "common.new_email_body",
    });
  });

  it("falls back to the generic text when the envelope cannot be opened", async () => {
    mount();

    await receive_email("m-locked");
    await wait_for_burst_window();

    expect(last_options()).toMatchObject({
      title: "common.aster_mail",
      body: "common.new_email_body",
    });
    expect(last_options().icon).toBeUndefined();
  });

  it("keeps a burst of arrivals generic", async () => {
    envelopes.set("m-a", {
      subject: "First",
      body_text: "a",
      from: { name: "A", email: "a@example.com" },
    });
    envelopes.set("m-b", {
      subject: "Second",
      body_text: "b",
      from: { name: "B", email: "b@example.com" },
    });
    mount();

    await receive_email("m-a");
    await receive_email("m-b");
    await wait_for_burst_window();

    expect(show_notification).toHaveBeenCalledTimes(1);
    expect(last_options()).toMatchObject({ title: "common.aster_mail" });
  });
});
