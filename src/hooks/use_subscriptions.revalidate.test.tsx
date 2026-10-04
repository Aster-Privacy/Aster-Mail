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
const stable_vault = { id: "vault" };

vi.mock("@/contexts/auth_context", () => ({
  use_auth: () => ({ vault: stable_vault }),
}));

vi.mock("@/services/subscription_cache", () => ({
  load_subscription_cache: (...args: unknown[]) => mock_load(...args),
  save_subscription_cache: () => Promise.resolve(true),
  SUBSCRIPTION_CACHE_SAVED_EVENT: "astermail:subscription-cache-saved",
  SUBSCRIPTION_CACHE_VERSION: 2,
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

let latest_count = -1;

function Probe() {
  const { subscriptions } = use_subscriptions();

  latest_count = subscriptions.length;

  return null;
}

function cache_with(count: number) {
  return {
    subscriptions: Array.from({ length: count }, (_, index) => ({
      sender_email: `sender${index}@example.com`,
      sender_name: "",
      domain: "example.com",
      email_count: 1,
      last_received: "2026-01-01T00:00:00Z",
      has_one_click: false,
      category: "unknown",
      status: "active",
    })),
    last_scan_ts: "2026-01-01T00:00:00Z",
    version: 2,
  };
}

function set_visibility(state: "visible" | "hidden"): void {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => state,
  });
  document.dispatchEvent(new Event("visibilitychange"));
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

describe("use_subscriptions revalidation", () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    mock_load.mockReset();
    mock_load.mockResolvedValue(cache_with(1));
    latest_count = -1;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root!.render(createElement(Probe));
    });
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container?.remove();
    root = null;
    container = null;
    set_visibility("visible");
    vi.useRealTimers();
  });

  it("loads once on mount and does not poll every few seconds", async () => {
    expect(mock_load).toHaveBeenCalledTimes(1);
    expect(latest_count).toBe(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });

    expect(mock_load).toHaveBeenCalledTimes(1);
  });

  it("reloads as soon as the stored list is saved", async () => {
    mock_load.mockResolvedValue(cache_with(3));

    await act(async () => {
      window.dispatchEvent(
        new CustomEvent("astermail:subscription-cache-saved"),
      );
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(mock_load).toHaveBeenCalledTimes(2);
    expect(latest_count).toBe(3);
  });

  it("reloads on the long interval while the tab is visible", async () => {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    });

    expect(mock_load).toHaveBeenCalledTimes(2);
  });

  it("skips the interval while the tab is hidden and reloads on return", async () => {
    await act(async () => {
      set_visibility("hidden");
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    });

    expect(mock_load).toHaveBeenCalledTimes(1);

    await act(async () => {
      set_visibility("visible");
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(mock_load).toHaveBeenCalledTimes(2);
  });

  it("does not reload on a quick tab switch", async () => {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
      set_visibility("hidden");
      set_visibility("visible");
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(mock_load).toHaveBeenCalledTimes(1);
  });
});
