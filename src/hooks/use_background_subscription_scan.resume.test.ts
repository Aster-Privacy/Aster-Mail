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

import type { ListMailItemsParams, MailItem } from "@/services/api/mail";
import type {
  CachedSubscription,
  SubscriptionCacheData,
} from "@/services/subscription_cache";

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

interface MailboxItem {
  item: MailItem;
  sender: string;
}

interface TestVault {
  identity_key: string;
}

const state = vi.hoisted(() => ({
  mailbox: [] as MailboxItem[],
  requests: [] as ListMailItemsParams[],
  saved: [] as SubscriptionCacheData[],
  cache: null as SubscriptionCacheData | null,
  failures: new Map<number, number>(),
  on_request: null as ((index: number) => void) | null,
  auth_vault: null as TestVault | null,
  memory_vault: null as TestVault | null,
}));

vi.mock("@/services/api/mail", () => ({
  list_mail_items: vi.fn(async (params: ListMailItemsParams) => {
    const index = state.requests.length;

    state.requests.push(params);
    state.on_request?.(index);

    const failure = state.failures.get(index);

    if (failure !== undefined) return { error: "failed", status: failure };
    if (params.cursor !== undefined && !/^\d+$/.test(params.cursor)) {
      return { error: "invalid", status: 400 };
    }

    const start = params.cursor ? Number(params.cursor) : 0;
    const limit = params.limit ?? 50;
    const page = state.mailbox
      .slice(start, start + limit)
      .map((entry) => entry.item);
    const has_more = start + limit < state.mailbox.length;

    return {
      data: {
        items: page,
        has_more,
        next_cursor: has_more ? String(start + limit) : undefined,
      },
    };
  }),
}));

vi.mock("@/components/email/shared/decrypt_envelope", () => ({
  decrypt_mail_envelope: vi.fn(
    async (_envelope: string, _nonce: string, id: string) => {
      const entry = state.mailbox.find((candidate) => candidate.item.id === id);

      if (!entry) return null;

      return {
        from: { name: entry.sender, email: entry.sender },
        list_unsubscribe: `<https://${entry.sender.split("@")[1]}/unsubscribe>`,
        list_unsubscribe_post: "List-Unsubscribe=One-Click",
      };
    },
  ),
}));

vi.mock("@/hooks/use_folders", () => ({
  has_protected_folder_label: () => false,
}));

vi.mock("@/contexts/auth_context", () => ({
  use_auth: () => ({ vault: state.auth_vault }),
}));

vi.mock("@/services/crypto/memory_key_store", () => ({
  get_vault_from_memory: () => state.memory_vault,
}));

vi.mock("@/services/subscription_cache", async (import_original) => {
  const actual =
    await import_original<typeof import("@/services/subscription_cache")>();

  return {
    ...actual,
    load_subscription_cache: vi.fn(async () => state.cache),
    save_subscription_cache: vi.fn(async (data: SubscriptionCacheData) => {
      state.saved.push(data);
      state.cache = data;

      return true;
    }),
  };
});

import {
  run_background_scan,
  upgrade_scan_delay_ms,
  use_background_subscription_scan,
  use_subscription_scan_in_flight,
  SCAN_UPGRADE_JITTER_MS,
  SCAN_UPGRADE_STORAGE_KEY,
  type BackgroundScanOptions,
} from "@/hooks/use_background_subscription_scan";
import { SUBSCRIPTION_CACHE_VERSION } from "@/services/subscription_cache";

type ScanVault = Parameters<typeof run_background_scan>[0];

const SENDER_COUNT = 30;
const account_a: TestVault = { identity_key: "account-a" };
const account_b: TestVault = { identity_key: "account-b" };
const vault = account_a as unknown as ScanVault;

function sender_address(index: number): string {
  return `sender${index % SENDER_COUNT}@news.example.com`;
}

function fill_mailbox(total: number): void {
  for (let index = 0; index < total; index++) {
    const ts = new Date(Date.UTC(2026, 8, 1) - index * 60000).toISOString();

    state.mailbox.push({
      sender: sender_address(index),
      item: {
        id: `m${index}`,
        item_type: "received",
        encrypted_envelope: "e",
        envelope_nonce: "n",
        folder_token: "",
        is_external: true,
        created_at: ts,
        message_ts: ts,
      } as MailItem,
    });
  }
}

function stored(
  sender_email: string,
  overrides: Partial<CachedSubscription> = {},
): CachedSubscription {
  return {
    sender_email,
    sender_name: sender_email,
    domain: "news.example.com",
    email_count: 999,
    last_received: "2026-01-01T00:00:00.000Z",
    has_one_click: true,
    category: "newsletter",
    status: "active",
    ...overrides,
  };
}

function total_count(data: SubscriptionCacheData | undefined): number {
  return (data?.subscriptions ?? []).reduce(
    (sum, sub) => sum + sub.email_count,
    0,
  );
}

function find(
  data: SubscriptionCacheData | undefined,
  sender_email: string,
): CachedSubscription | undefined {
  return data?.subscriptions.find((sub) => sub.sender_email === sender_email);
}

async function run(options?: BackgroundScanOptions): Promise<number> {
  const pending = run_background_scan(vault, options);

  await vi.runAllTimersAsync();

  return pending;
}

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  state.mailbox = [];
  state.requests = [];
  state.saved = [];
  state.cache = null;
  state.failures = new Map();
  state.on_request = null;
  state.auth_vault = account_a;
  state.memory_vault = account_a;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("upgrade scan delay", () => {
  it("spreads the first scan across the window", () => {
    expect(upgrade_scan_delay_ms(1000, () => 0)).toBe(0);
    localStorage.clear();
    expect(upgrade_scan_delay_ms(1000, () => 0.5)).toBe(
      SCAN_UPGRADE_JITTER_MS / 2,
    );
    localStorage.clear();
    expect(upgrade_scan_delay_ms(1000, () => 0.999999)).toBeLessThan(
      SCAN_UPGRADE_JITTER_MS,
    );
  });

  it("keeps the first deadline instead of rolling a new one", () => {
    expect(upgrade_scan_delay_ms(1000, () => 0.5)).toBe(300000);
    expect(upgrade_scan_delay_ms(101000, () => 0.9)).toBe(200000);
    expect(upgrade_scan_delay_ms(301000, () => 0.9)).toBe(0);
    expect(upgrade_scan_delay_ms(9000000, () => 0.9)).toBe(0);
  });

  it("rolls again when the stored deadline is unusable", () => {
    localStorage.setItem(SCAN_UPGRADE_STORAGE_KEY, "{not json");
    expect(upgrade_scan_delay_ms(1000, () => 0.25)).toBe(150000);

    localStorage.setItem(
      SCAN_UPGRADE_STORAGE_KEY,
      JSON.stringify({
        version: SUBSCRIPTION_CACHE_VERSION,
        not_before: 1000 + SCAN_UPGRADE_JITTER_MS * 50,
      }),
    );
    expect(upgrade_scan_delay_ms(1000, () => 0.25)).toBe(150000);

    localStorage.setItem(
      SCAN_UPGRADE_STORAGE_KEY,
      JSON.stringify({
        version: SUBSCRIPTION_CACHE_VERSION - 1,
        not_before: 2000,
      }),
    );
    expect(upgrade_scan_delay_ms(1000, () => 0.25)).toBe(150000);

    localStorage.setItem(
      SCAN_UPGRADE_STORAGE_KEY,
      JSON.stringify({ version: SUBSCRIPTION_CACHE_VERSION, not_before: "x" }),
    );
    expect(upgrade_scan_delay_ms(1000, () => 0.25)).toBe(150000);
  });
});

describe("background subscription scan upgrade stagger", () => {
  beforeEach(() => {
    fill_mailbox(60);
    state.cache = {
      subscriptions: [stored(sender_address(0))],
      last_scan_ts: "2026-01-01T00:00:00.000Z",
      version: SUBSCRIPTION_CACHE_VERSION - 1,
    };
  });

  it("returns the delay without touching the mailbox", async () => {
    const delay = await run({
      defer_upgrade: true,
      random: () => 0.5,
      now: () => 1000,
    });

    expect(delay).toBe(SCAN_UPGRADE_JITTER_MS / 2);
    expect(state.requests).toHaveLength(0);
    expect(state.saved).toHaveLength(0);
  });

  it("scans once the deadline has passed", async () => {
    await run({ defer_upgrade: true, random: () => 0.5, now: () => 1000 });

    const delay = await run({
      defer_upgrade: true,
      random: () => 0.5,
      now: () => 1000 + SCAN_UPGRADE_JITTER_MS,
    });

    expect(delay).toBe(0);
    expect(state.requests).toHaveLength(1);
    expect(state.saved.at(-1)?.version).toBe(SUBSCRIPTION_CACHE_VERSION);
    expect(total_count(state.saved.at(-1))).toBe(60);
  });

  it("does not delay a cache that is already current", async () => {
    state.cache = null;

    const delay = await run({ defer_upgrade: true, random: () => 0.5 });

    expect(delay).toBe(0);
    expect(state.requests).toHaveLength(1);

    state.requests = [];

    const next_delay = await run({ defer_upgrade: true, random: () => 0.5 });

    expect(next_delay).toBe(0);
    expect(state.requests).toHaveLength(1);
  });
});

describe("background subscription scan resume", () => {
  it("saves a cursor when a page fails and continues from it", async () => {
    fill_mailbox(1500);
    state.failures.set(6, 503);

    await run();

    expect(state.requests).toHaveLength(7);

    const checkpoint = state.saved.at(-1);

    expect(checkpoint?.version).toBe(SUBSCRIPTION_CACHE_VERSION);
    expect(checkpoint?.scan_progress?.cursor).toBe("1200");
    expect(total_count(checkpoint)).toBe(1200);

    state.requests = [];
    state.failures.clear();

    await run();

    expect(state.requests.map((params) => params.cursor)).toEqual([
      "1200",
      "1400",
    ]);

    const finished = state.saved.at(-1);

    expect(finished?.scan_progress).toBeUndefined();
    expect("scan_progress" in (finished ?? {})).toBe(false);
    expect(finished?.subscriptions).toHaveLength(SENDER_COUNT);
    expect(total_count(finished)).toBe(1500);
    expect(finished?.last_scan_ts).toBe(state.mailbox[0].item.created_at);
    expect(finished?.last_scan_message_ts).toBe(
      state.mailbox[0].item.message_ts,
    );

    state.requests = [];

    await run();

    expect(state.requests).toHaveLength(1);
    expect(total_count(state.saved.at(-1))).toBe(1500);
  });

  it("checkpoints during a long scan and clears the cursor at the end", async () => {
    fill_mailbox(2300);

    await run();

    expect(state.requests).toHaveLength(12);
    expect(state.saved.map((data) => data.scan_progress?.cursor)).toEqual([
      "1000",
      "2000",
      undefined,
    ]);
    expect(total_count(state.saved.at(-1))).toBe(2300);
  });

  it("saves nothing when the first page fails", async () => {
    fill_mailbox(600);
    state.failures.set(0, 503);

    await run();

    expect(state.requests).toHaveLength(1);
    expect(state.saved).toHaveLength(0);
  });

  it("keeps stored senders and their status across an interrupted upgrade", async () => {
    fill_mailbox(1500);
    state.cache = {
      subscriptions: [
        stored(sender_address(0), {
          status: "unsubscribed",
          unsubscribed_at: "2026-08-01T00:00:00.000Z",
        }),
        stored("gone@news.example.com", { email_count: 4 }),
      ],
      last_scan_ts: state.mailbox[0].item.created_at,
      last_scan_message_ts: state.mailbox[0].item.message_ts,
      version: SUBSCRIPTION_CACHE_VERSION - 1,
    };
    state.failures.set(6, 503);

    await run();

    expect(state.saved.at(-1)?.scan_progress?.carried).toEqual([
      "gone@news.example.com",
    ]);

    state.failures.clear();

    await run();

    const finished = state.saved.at(-1);

    expect(finished?.scan_progress).toBeUndefined();
    expect(finished?.subscriptions).toHaveLength(SENDER_COUNT + 1);
    expect(find(finished, sender_address(0))).toMatchObject({
      status: "unsubscribed",
      unsubscribed_at: "2026-08-01T00:00:00.000Z",
      email_count: 50,
    });
    expect(find(finished, "gone@news.example.com")?.email_count).toBe(4);
    expect(total_count(finished)).toBe(1504);
  });

  it("keeps a status change made while the scan is running", async () => {
    fill_mailbox(1500);
    state.on_request = (index) => {
      if (index !== 6 || !state.cache) return;

      state.cache = {
        ...state.cache,
        subscriptions: state.cache.subscriptions.map((sub) =>
          sub.sender_email === sender_address(3)
            ? {
                ...sub,
                status: "unsubscribed" as const,
                unsubscribed_at: "2026-09-02T00:00:00.000Z",
              }
            : sub,
        ),
      };
    };

    await run();

    expect(find(state.saved.at(-1), sender_address(3))).toMatchObject({
      status: "unsubscribed",
      unsubscribed_at: "2026-09-02T00:00:00.000Z",
      email_count: 50,
    });
  });
});

describe("background subscription scan with bad resume state", () => {
  it("restarts from the first page when the stored progress is malformed", async () => {
    fill_mailbox(450);

    const malformed = [
      { cursor: 42, last_scan_ts: "", last_scan_message_ts: "", carried: [] },
      { cursor: "", last_scan_ts: "", last_scan_message_ts: "", carried: [] },
      { cursor: "200", last_scan_ts: "", last_scan_message_ts: "" },
      { cursor: "200", last_scan_ts: 1, last_scan_message_ts: "", carried: [] },
      {
        cursor: "200",
        last_scan_ts: "",
        last_scan_message_ts: "",
        carried: [7],
      },
      {
        cursor: "9".repeat(600),
        last_scan_ts: "",
        last_scan_message_ts: "",
        carried: [],
      },
      "nonsense",
      null,
    ];

    for (const scan_progress of malformed) {
      state.requests = [];
      state.saved = [];
      state.cache = {
        subscriptions: [
          stored(sender_address(0)),
          stored("gone@news.example.com", { email_count: 4 }),
        ],
        last_scan_ts: state.mailbox[0].item.created_at,
        last_scan_message_ts: state.mailbox[0].item.message_ts,
        version: SUBSCRIPTION_CACHE_VERSION,
        scan_progress,
      } as unknown as SubscriptionCacheData;

      await run();

      const finished = state.saved.at(-1);

      expect(state.requests.map((params) => params.cursor)).toEqual([
        undefined,
        "200",
        "400",
      ]);
      expect(finished?.scan_progress).toBeUndefined();
      expect(find(finished, sender_address(0))?.email_count).toBe(15);
      expect(find(finished, "gone@news.example.com")?.email_count).toBe(4);
      expect(total_count(finished)).toBe(454);
    }
  });

  it("restarts once when the server rejects the stored cursor", async () => {
    fill_mailbox(450);
    state.cache = {
      subscriptions: [stored(sender_address(0))],
      last_scan_ts: "",
      last_scan_message_ts: "",
      version: SUBSCRIPTION_CACHE_VERSION,
      scan_progress: {
        cursor: "not-a-cursor",
        last_scan_ts: "2020-01-01T00:00:00.000Z",
        last_scan_message_ts: "2020-01-01T00:00:00.000Z",
        carried: [],
      },
    };

    await run();

    expect(state.requests.map((params) => params.cursor)).toEqual([
      "not-a-cursor",
      undefined,
      "200",
      "400",
    ]);

    const finished = state.saved.at(-1);

    expect(finished?.scan_progress).toBeUndefined();
    expect(find(finished, sender_address(0))?.email_count).toBe(15);
    expect(total_count(finished)).toBe(450);
    expect(finished?.last_scan_ts).toBe(state.mailbox[0].item.created_at);
  });

  it("stops when the restart is rejected as well", async () => {
    fill_mailbox(450);
    state.cache = {
      subscriptions: [stored(sender_address(0))],
      last_scan_ts: "",
      version: SUBSCRIPTION_CACHE_VERSION,
      scan_progress: {
        cursor: "not-a-cursor",
        last_scan_ts: "",
        last_scan_message_ts: "",
        carried: [],
      },
    };
    state.failures.set(1, 400);

    await run();

    expect(state.requests).toHaveLength(2);
    expect(state.saved).toHaveLength(0);
  });

  it("keeps the cursor when resuming fails for another reason", async () => {
    fill_mailbox(450);
    state.cache = {
      subscriptions: [stored(sender_address(0), { email_count: 10 })],
      last_scan_ts: "",
      version: SUBSCRIPTION_CACHE_VERSION,
      scan_progress: {
        cursor: "200",
        last_scan_ts: state.mailbox[0].item.created_at,
        last_scan_message_ts: state.mailbox[0].item.created_at,
        carried: [],
      },
    };
    state.failures.set(0, 503);

    await run();

    expect(state.requests).toHaveLength(1);
    expect(state.saved).toHaveLength(0);
    expect(state.cache?.scan_progress?.cursor).toBe("200");
  });
});

describe("background subscription scan cancellation", () => {
  it("writes nothing once the account is no longer active", async () => {
    fill_mailbox(1500);

    await run({ is_cancelled: () => state.requests.length >= 7 });

    expect(state.requests).toHaveLength(7);
    expect(state.saved).toHaveLength(1);
    expect(state.saved[0].scan_progress?.cursor).toBe("1000");
  });

  it("writes nothing when the account changes before the first page", async () => {
    fill_mailbox(100);

    await run({ is_cancelled: () => true });

    expect(state.requests).toHaveLength(0);
    expect(state.saved).toHaveLength(0);
  });
});

describe("background subscription scan hook", () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;
  let in_flight = false;
  let random_spy: ReturnType<typeof vi.spyOn> | null = null;

  function scan_probe(): null {
    use_background_subscription_scan();
    in_flight = use_subscription_scan_in_flight();

    return null;
  }

  async function render_probe(): Promise<void> {
    await act(async () => {
      root!.render(createElement(scan_probe));
    });
  }

  async function advance(ms: number): Promise<void> {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });
  }

  beforeEach(() => {
    random_spy = vi.spyOn(Math, "random").mockReturnValue(0.5);
    fill_mailbox(60);
    state.cache = {
      subscriptions: [stored(sender_address(0))],
      last_scan_ts: "2026-01-01T00:00:00.000Z",
      version: SUBSCRIPTION_CACHE_VERSION - 1,
    };
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container?.remove();
    root = null;
    container = null;
    random_spy?.mockRestore();
    random_spy = null;
  });

  it("waits out the delay before the upgrade scan", async () => {
    await render_probe();
    await advance(20000);

    expect(state.requests).toHaveLength(0);
    expect(state.saved).toHaveLength(0);
    expect(in_flight).toBe(false);

    await advance(SCAN_UPGRADE_JITTER_MS / 2 - 30000);

    expect(state.requests).toHaveLength(0);

    await advance(40000);

    expect(state.requests).toHaveLength(1);
    expect(state.saved.at(-1)?.version).toBe(SUBSCRIPTION_CACHE_VERSION);
    expect(total_count(state.saved.at(-1))).toBe(60);
  });

  it("scans a current cache without waiting", async () => {
    state.cache = null;

    await render_probe();
    await advance(20000);

    expect(state.requests).toHaveLength(1);
    expect(state.saved).toHaveLength(1);
  });

  it("drops the delayed scan on unmount", async () => {
    await render_probe();
    await advance(20000);

    act(() => {
      root?.unmount();
    });
    root = null;

    await advance(SCAN_UPGRADE_JITTER_MS * 2);

    expect(state.requests).toHaveLength(0);
    expect(state.saved).toHaveLength(0);
  });

  it("drops the delayed scan when the account changes", async () => {
    await render_probe();
    await advance(20000);

    state.auth_vault = account_b;
    state.memory_vault = account_b;
    await render_probe();
    await advance(SCAN_UPGRADE_JITTER_MS * 2);

    expect(state.requests).toHaveLength(0);
    expect(state.saved).toHaveLength(0);
  });

  it("stops a running scan when the account changes", async () => {
    state.cache = null;
    state.mailbox = [];
    fill_mailbox(1500);
    state.on_request = (index) => {
      if (index === 2) state.memory_vault = account_b;
    };

    await render_probe();
    await advance(60000);

    expect(state.requests).toHaveLength(3);
    expect(state.saved).toHaveLength(0);
  });
});
