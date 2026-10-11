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
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const mock_load = vi.fn();
const mock_save = vi.fn();
const mock_list_blocked = vi.fn();
const stable_vault = { id: "vault" };

vi.mock("@/contexts/auth_context", () => ({
  use_auth: () => ({ vault: stable_vault }),
}));

vi.mock("@/services/subscription_cache", () => ({
  load_subscription_cache: (...args: unknown[]) => mock_load(...args),
  save_subscription_cache: (...args: unknown[]) => mock_save(...args),
  SUBSCRIPTION_CACHE_SAVED_EVENT: "astermail:subscription-cache-saved",
  SUBSCRIPTION_CACHE_VERSION: 3,
}));

vi.mock("@/services/api/blocked_senders", () => ({
  list_blocked_senders: (...args: unknown[]) => mock_list_blocked(...args),
  BLOCKED_SENDERS_CHANGED_EVENT: "astermail:blocked-senders-changed",
}));

vi.mock("@/utils/unsubscribe_detector", () => ({
  perform_unsubscribe: vi.fn(),
  execute_unsubscribe: vi.fn(),
  unsubscribe_info_from_stored: vi.fn(),
  UnsubscribeError: class extends Error {},
}));

vi.mock("@/components/modals/unsubscribe_confirmation_modal", () => ({
  confirm_unsubscribe: vi.fn(),
  confirm_unsubscribe_bulk: vi.fn(),
}));

vi.mock("@/hooks/use_unsubscribed_senders", () => ({
  UNSUBSCRIBE_EVENT: "astermail:unsubscribed",
  persist_resubscribe: vi.fn(),
  persist_unsubscribe: vi.fn(),
}));

vi.mock("@/components/toast/simple_toast", () => ({ show_toast: vi.fn() }));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key }),
}));

import { use_subscriptions } from "./use_subscriptions";

let latest_senders: string[] = [];
let latest_is_loading = true;

function Probe() {
  const { subscriptions, is_loading } = use_subscriptions();

  latest_senders = subscriptions.map((entry) => entry.sender_email);
  latest_is_loading = is_loading;

  return null;
}

function stored(sender_email: string, status = "active") {
  return {
    sender_email,
    sender_name: "",
    domain: sender_email.split("@")[1],
    email_count: 1,
    last_received: "2026-01-01T00:00:00Z",
    has_one_click: false,
    category: "unknown",
    status,
  };
}

function cache_of(...sender_emails: string[]) {
  return {
    subscriptions: sender_emails.map((sender_email) => stored(sender_email)),
    last_scan_ts: "2026-01-01T00:00:00Z",
    version: 3,
  };
}

function blocked(email: string, is_domain = false) {
  return {
    id: email,
    sender_token: email,
    email,
    blocked_at: "2026-01-01T00:00:00Z",
    is_domain,
    action: "spam",
    created_at: "2026-01-01T00:00:00Z",
  };
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

async function mount(): Promise<void> {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);

  await act(async () => {
    root!.render(createElement(Probe));
    await vi.advanceTimersByTimeAsync(0);
  });
}

async function announce_block_change(): Promise<void> {
  await act(async () => {
    window.dispatchEvent(new CustomEvent("astermail:blocked-senders-changed"));
    await vi.advanceTimersByTimeAsync(0);
  });
}

describe("use_subscriptions with blocked senders", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mock_load.mockReset();
    mock_load.mockResolvedValue(
      cache_of("news@shop.example", "deals@store.example", "hi@friend.example"),
    );
    mock_save.mockReset();
    mock_save.mockResolvedValue(true);
    mock_list_blocked.mockReset();
    mock_list_blocked.mockResolvedValue({ data: [] });
    latest_senders = [];
    latest_is_loading = true;
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container?.remove();
    root = null;
    container = null;
    vi.useRealTimers();
  });

  it("shows every subscription when nothing is blocked", async () => {
    await mount();

    expect(latest_senders).toEqual([
      "news@shop.example",
      "deals@store.example",
      "hi@friend.example",
    ]);
    expect(latest_is_loading).toBe(false);
  });

  it("leaves out a sender that is blocked by address", async () => {
    mock_list_blocked.mockResolvedValue({
      data: [blocked("news@shop.example")],
    });

    await mount();

    expect(latest_senders).toEqual([
      "deals@store.example",
      "hi@friend.example",
    ]);
  });

  it("leaves out every sender on a blocked domain", async () => {
    mock_list_blocked.mockResolvedValue({
      data: [blocked("store.example", true)],
    });

    await mount();

    expect(latest_senders).toEqual(["news@shop.example", "hi@friend.example"]);
  });

  it("leaves out a blocked sender that was already unsubscribed", async () => {
    mock_load.mockResolvedValue({
      ...cache_of("hi@friend.example"),
      subscriptions: [
        stored("news@shop.example", "unsubscribed"),
        stored("hi@friend.example"),
      ],
    });
    mock_list_blocked.mockResolvedValue({
      data: [blocked("news@shop.example")],
    });

    await mount();

    expect(latest_senders).toEqual(["hi@friend.example"]);
  });

  it("drops a sender as soon as it is blocked", async () => {
    await mount();

    expect(latest_senders).toContain("news@shop.example");

    mock_list_blocked.mockResolvedValue({
      data: [blocked("news@shop.example")],
    });
    await announce_block_change();

    expect(latest_senders).toEqual([
      "deals@store.example",
      "hi@friend.example",
    ]);
  });

  it("brings a sender back as soon as it is unblocked", async () => {
    mock_list_blocked.mockResolvedValue({
      data: [blocked("news@shop.example")],
    });

    await mount();

    expect(latest_senders).not.toContain("news@shop.example");

    mock_list_blocked.mockResolvedValue({ data: [] });
    await announce_block_change();

    expect(latest_senders).toContain("news@shop.example");
  });

  it("keeps blocked senders out when the scan saves them again", async () => {
    mock_list_blocked.mockResolvedValue({
      data: [blocked("news@shop.example")],
    });

    await mount();

    mock_load.mockResolvedValue(
      cache_of("news@shop.example", "new@list.example"),
    );

    await act(async () => {
      window.dispatchEvent(
        new CustomEvent("astermail:subscription-cache-saved"),
      );
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(latest_senders).toEqual(["new@list.example"]);
  });

  it("keeps the last known blocked list when a refresh fails", async () => {
    mock_list_blocked.mockResolvedValue({
      data: [blocked("news@shop.example")],
    });

    await mount();

    mock_list_blocked.mockResolvedValue({ error: "offline" });
    await announce_block_change();

    expect(latest_senders).not.toContain("news@shop.example");

    mock_list_blocked.mockRejectedValue(new Error("offline"));
    await announce_block_change();

    expect(latest_senders).not.toContain("news@shop.example");
  });

  it("stays in the loading state until the blocked list has answered", async () => {
    let answer: (value: unknown) => void = () => {};

    mock_list_blocked.mockReturnValue(
      new Promise((resolve) => {
        answer = resolve;
      }),
    );

    await mount();

    expect(latest_is_loading).toBe(true);

    await act(async () => {
      answer({ data: [blocked("news@shop.example")] });
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(latest_is_loading).toBe(false);
    expect(latest_senders).not.toContain("news@shop.example");
  });

  it("still shows the list when the blocked list cannot be loaded", async () => {
    mock_list_blocked.mockResolvedValue({ error: "offline" });

    await mount();

    expect(latest_is_loading).toBe(false);
    expect(latest_senders).toHaveLength(3);
  });
});
