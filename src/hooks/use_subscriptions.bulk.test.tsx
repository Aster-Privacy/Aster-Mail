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
const mock_execute = vi.fn();
const mock_persist_unsubscribe = vi.fn();
const stable_vault = { id: "vault" };

vi.mock("@/contexts/auth_context", () => ({
  use_auth: () => ({ vault: stable_vault }),
}));

vi.mock("@/services/subscription_cache", () => ({
  load_subscription_cache: (...args: unknown[]) => mock_load(...args),
  save_subscription_cache: (...args: unknown[]) => mock_save(...args),
  SUBSCRIPTION_CACHE_SAVED_EVENT: "astermail:subscription-cache-saved",
  SUBSCRIPTION_CACHE_VERSION: 4,
  with_deleted_senders: (cache: unknown) => cache,
}));

vi.mock("@/services/api/blocked_senders", () => ({
  list_blocked_senders: async () => ({ data: [] }),
  BLOCKED_SENDERS_CHANGED_EVENT: "astermail:blocked-senders-changed",
}));

vi.mock("@/utils/unsubscribe_detector", () => ({
  perform_unsubscribe: vi.fn(),
  execute_unsubscribe: (...args: unknown[]) => mock_execute(...args),
  unsubscribe_info_from_stored: (stored: {
    has_one_click: boolean;
    unsubscribe_link?: string;
  }) =>
    stored.has_one_click
      ? {
          has_unsubscribe: true,
          method: "one-click",
          unsubscribe_link: stored.unsubscribe_link,
        }
      : {
          has_unsubscribe: Boolean(stored.unsubscribe_link),
          method: stored.unsubscribe_link ? "link" : "none",
          unsubscribe_link: stored.unsubscribe_link,
          unsubscribe_page_url: stored.unsubscribe_link,
        },
  get_manual_unsubscribe_url: (info: { unsubscribe_page_url?: string }) =>
    info.unsubscribe_page_url ?? "",
  UnsubscribeError: class extends Error {},
}));

vi.mock("@/components/modals/unsubscribe_confirmation_modal", () => ({
  confirm_unsubscribe: vi.fn(async () => true),
  confirm_unsubscribe_bulk: vi.fn(async () => true),
}));

vi.mock("@/hooks/use_unsubscribed_senders", () => ({
  UNSUBSCRIBE_EVENT: "astermail:unsubscribed",
  persist_resubscribe: vi.fn(),
  persist_unsubscribe: (...args: unknown[]) =>
    mock_persist_unsubscribe(...args),
}));

vi.mock("@/components/toast/simple_toast", () => ({ show_toast: vi.fn() }));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key }),
}));

import { use_subscriptions } from "./use_subscriptions";

type Hook = ReturnType<typeof use_subscriptions>;

let latest: Hook | null = null;
let active_history: string[][] = [];

function Probe() {
  const hook = use_subscriptions();

  latest = hook;
  if (!hook.is_loading) {
    active_history.push(
      hook.subscriptions
        .filter((entry) => entry.status === "active")
        .map((entry) => entry.sender_email),
    );
  }

  return null;
}

interface TestSubscription {
  sender_email: string;
  sender_name: string;
  domain: string;
  email_count: number;
  last_received: string;
  unsubscribe_link?: string;
  has_one_click: boolean;
  category: string;
  status: string;
}

function page_only(sender_email: string): TestSubscription {
  return {
    sender_email,
    sender_name: sender_email.split("@")[0],
    domain: sender_email.split("@")[1],
    email_count: 3,
    last_received: "2026-01-01T00:00:00Z",
    unsubscribe_link: `https://${sender_email.split("@")[1]}/unsubscribe`,
    has_one_click: false,
    category: "newsletter",
    status: "active",
  };
}

function one_click(sender_email: string): TestSubscription {
  return { ...page_only(sender_email), has_one_click: true };
}

function no_route(sender_email: string): TestSubscription {
  return { ...page_only(sender_email), unsubscribe_link: undefined };
}

function cache_of(...subscriptions: TestSubscription[]) {
  return {
    subscriptions,
    last_scan_ts: "2026-01-01T00:00:00Z",
    version: 4,
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
  active_history = [];
}

function status_of(sender_email: string): string | undefined {
  return latest?.subscriptions.find((s) => s.sender_email === sender_email)
    ?.status;
}

describe("use_subscriptions bulk unsubscribe", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mock_load.mockReset();
    mock_save.mockReset();
    mock_save.mockResolvedValue(true);
    mock_execute.mockReset();
    mock_persist_unsubscribe.mockReset();
    mock_persist_unsubscribe.mockResolvedValue(undefined);
    latest = null;
    active_history = [];
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

  it("keeps senders that only have a web page listed and never empties the list", async () => {
    const senders = ["a@one.example", "b@two.example", "c@three.example"];

    mock_load.mockResolvedValue(cache_of(...senders.map(page_only)));
    mock_execute.mockResolvedValue("link");
    await mount();

    let summary: Awaited<ReturnType<Hook["bulk_unsubscribe"]>> | null = null;

    await act(async () => {
      summary = await latest!.bulk_unsubscribe(senders);
      await vi.advanceTimersByTimeAsync(0);
    });

    for (const snapshot of active_history) {
      expect(snapshot).toEqual(senders);
    }
    expect(mock_execute).not.toHaveBeenCalled();
    expect(summary).toEqual({
      unsubscribed: [],
      needs_page: senders,
      failed: [],
    });
    for (const sender of senders) {
      expect(status_of(sender)).toBe("active");
    }
  });

  it("unsubscribes one-click senders and sorts the rest by what they need", async () => {
    mock_load.mockResolvedValue(
      cache_of(
        one_click("ok@one.example"),
        one_click("refused@two.example"),
        page_only("page@three.example"),
        no_route("none@four.example"),
      ),
    );
    mock_execute.mockImplementation(
      async (info: { unsubscribe_link: string }) =>
        info.unsubscribe_link.includes("one.example") ? "api" : "failed",
    );
    await mount();

    let summary: Awaited<ReturnType<Hook["bulk_unsubscribe"]>> | null = null;

    await act(async () => {
      summary = await latest!.bulk_unsubscribe([
        "ok@one.example",
        "refused@two.example",
        "page@three.example",
        "none@four.example",
      ]);
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(summary).toEqual({
      unsubscribed: ["ok@one.example"],
      needs_page: ["page@three.example"],
      failed: ["refused@two.example", "none@four.example"],
    });
    expect(mock_execute).toHaveBeenCalledTimes(2);
    expect(status_of("ok@one.example")).toBe("unsubscribed");
    expect(status_of("refused@two.example")).toBe("active");
    expect(status_of("page@three.example")).toBe("active");
    expect(mock_persist_unsubscribe).toHaveBeenCalledTimes(1);
    expect(mock_persist_unsubscribe.mock.calls[0][0]).toBe("ok@one.example");

    const saved = mock_save.mock.calls.at(-1)?.[0] as {
      subscriptions: Array<{ sender_email: string; status: string }>;
    };

    expect(
      saved.subscriptions
        .filter((s) => s.status === "unsubscribed")
        .map((s) => s.sender_email),
    ).toEqual(["ok@one.example"]);
  });

  it("sends a limited number of requests at once and reports progress", async () => {
    const senders = Array.from(
      { length: 12 },
      (_, index) => `s${index}@list${index}.example`,
    );
    let in_flight = 0;
    let peak = 0;

    mock_load.mockResolvedValue(cache_of(...senders.map(one_click)));
    mock_execute.mockImplementation(async () => {
      in_flight++;
      peak = Math.max(peak, in_flight);
      await new Promise((resolve) => setTimeout(resolve, 10));
      in_flight--;

      return "api";
    });
    await mount();

    const progress: Array<[number, number]> = [];
    let run: Promise<unknown> = Promise.resolve();

    await act(async () => {
      run = latest!.bulk_unsubscribe(senders, (done, total) =>
        progress.push([done, total]),
      );
      await vi.advanceTimersByTimeAsync(200);
      await run;
    });

    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThanOrEqual(4);
    expect(progress.at(-1)).toEqual([12, 12]);
    expect(progress.map(([done]) => done)).toEqual(
      [...progress.map(([done]) => done)].sort((a, b) => a - b),
    );
    for (const sender of senders) {
      expect(status_of(sender)).toBe("unsubscribed");
    }
  });

  it("keeps the senders that succeeded when another request throws", async () => {
    mock_load.mockResolvedValue(
      cache_of(one_click("good@one.example"), one_click("boom@two.example")),
    );
    mock_execute.mockImplementation(
      async (info: { unsubscribe_link: string }) => {
        if (info.unsubscribe_link.includes("two.example")) {
          throw new Error("network");
        }

        return "api";
      },
    );
    await mount();

    let summary: Awaited<ReturnType<Hook["bulk_unsubscribe"]>> | null = null;

    await act(async () => {
      summary = await latest!.bulk_unsubscribe([
        "good@one.example",
        "boom@two.example",
      ]);
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(summary).toEqual({
      unsubscribed: ["good@one.example"],
      needs_page: [],
      failed: ["boom@two.example"],
    });
    expect(status_of("good@one.example")).toBe("unsubscribed");
    expect(status_of("boom@two.example")).toBe("active");
    expect(mock_save).toHaveBeenCalled();
  });

  it("marks a sender done after the person unsubscribes on its page", async () => {
    mock_load.mockResolvedValue(cache_of(page_only("page@three.example")));
    await mount();

    let saved = false;

    await act(async () => {
      saved = await latest!.mark_unsubscribed("page@three.example");
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(saved).toBe(true);
    expect(status_of("page@three.example")).toBe("unsubscribed");
    expect(mock_execute).not.toHaveBeenCalled();
    expect(mock_persist_unsubscribe).toHaveBeenCalledTimes(1);
  });
});
