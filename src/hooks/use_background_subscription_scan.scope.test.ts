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

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const PROTECTED_TOKEN = "protected-folder";

interface MailboxItem {
  item: MailItem;
  sender: string;
  in_custom_folder?: boolean;
}

const state = vi.hoisted(() => ({
  mailbox: [] as MailboxItem[],
  requests: [] as ListMailItemsParams[],
  saved: [] as SubscriptionCacheData[],
  cache: null as SubscriptionCacheData | null,
}));

function is_visible(entry: MailboxItem, params: ListMailItemsParams): boolean {
  const { item } = entry;

  if (params.item_type === "received" && Object.keys(params).length <= 3) {
    return (
      item.item_type === "received" &&
      !item.is_archived &&
      !item.is_spam &&
      !item.is_trashed &&
      !entry.in_custom_folder
    );
  }

  if (params.item_type === "all") {
    if (item.is_spam && !params.include_spam) return false;
    if (item.is_trashed && !params.include_trash) return false;

    return true;
  }

  return false;
}

vi.mock("@/services/api/mail", () => ({
  list_mail_items: vi.fn(async (params: ListMailItemsParams) => {
    state.requests.push(params);
    const visible = state.mailbox.filter((entry) => is_visible(entry, params));
    const start = params.cursor ? Number(params.cursor) : 0;
    const limit = params.limit ?? 50;
    const page = visible.slice(start, start + limit).map((entry) => entry.item);
    const has_more = start + limit < visible.length;

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
  has_protected_folder_label: (labels?: { token: string }[]) =>
    !!labels?.some((label) => label.token === PROTECTED_TOKEN),
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

import { run_background_scan } from "@/hooks/use_background_subscription_scan";
import { SUBSCRIPTION_CACHE_VERSION } from "@/services/subscription_cache";

const vault = {} as Parameters<typeof run_background_scan>[0];

let sequence = 0;

function add(
  sender: string,
  overrides: Partial<MailItem> = {},
  in_custom_folder = false,
): void {
  sequence += 1;
  const ts = new Date(Date.UTC(2026, 8, 1) - sequence * 60000).toISOString();

  state.mailbox.push({
    sender,
    in_custom_folder,
    item: {
      id: `m${sequence}`,
      item_type: "received",
      encrypted_envelope: "e",
      envelope_nonce: "n",
      folder_token: "",
      is_external: true,
      created_at: ts,
      message_ts: ts,
      ...overrides,
    } as MailItem,
  });
}

function senders(data: SubscriptionCacheData | undefined): string[] {
  return (data?.subscriptions ?? []).map((sub) => sub.sender_email).sort();
}

async function run(): Promise<void> {
  const pending = run_background_scan(vault);

  await vi.runAllTimersAsync();
  await pending;
}

beforeEach(() => {
  vi.useFakeTimers();
  state.mailbox = [];
  state.requests = [];
  state.saved = [];
  state.cache = null;
  sequence = 0;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("background subscription scan scope", () => {
  it("includes newsletters from archive and custom folders", async () => {
    add("inbox@news.example.com");
    add("archived@news.example.com", { is_archived: true });
    add(
      "rules@news.example.com",
      {
        labels: [{ token: "custom-folder" }],
      } as Partial<MailItem>,
      true,
    );

    await run();

    expect(senders(state.saved.at(-1))).toEqual([
      "archived@news.example.com",
      "inbox@news.example.com",
      "rules@news.example.com",
    ]);
  });

  it("leaves out spam, trash, protected folders and sent mail", async () => {
    add("inbox@news.example.com");
    add("spam@junk.example.com", { is_spam: true });
    add("trash@old.example.com", { is_trashed: true });
    add(
      "locked@private.example.com",
      {
        labels: [{ token: PROTECTED_TOKEN }],
      } as Partial<MailItem>,
      true,
    );
    add("me@self.example.com", { item_type: "sent" });

    await run();

    expect(senders(state.saved.at(-1))).toEqual(["inbox@news.example.com"]);
  });

  it("rescans everything once for a cache written by the inbox-only scan", async () => {
    add("fresh@news.example.com");
    add("archived@news.example.com", { is_archived: true });
    add("left@news.example.com");

    const unsubscribed: CachedSubscription = {
      sender_email: "left@news.example.com",
      sender_name: "left@news.example.com",
      domain: "news.example.com",
      email_count: 1,
      last_received: state.mailbox[2].item.created_at,
      has_one_click: true,
      category: "newsletter",
      status: "unsubscribed",
      unsubscribed_at: "2026-08-01T00:00:00.000Z",
    };
    const gone: CachedSubscription = {
      ...unsubscribed,
      sender_email: "gone@news.example.com",
      status: "active",
      unsubscribed_at: undefined,
    };

    state.cache = {
      subscriptions: [unsubscribed, gone],
      last_scan_ts: state.mailbox[0].item.created_at,
      last_scan_message_ts: state.mailbox[0].item.message_ts,
      version: SUBSCRIPTION_CACHE_VERSION - 1,
    };

    await run();

    const rescanned = state.saved.at(-1);

    expect(rescanned?.version).toBe(SUBSCRIPTION_CACHE_VERSION);
    expect(senders(rescanned)).toEqual([
      "archived@news.example.com",
      "fresh@news.example.com",
      "left@news.example.com",
    ]);
    expect(
      rescanned?.subscriptions.find(
        (sub) => sub.sender_email === "left@news.example.com",
      ),
    ).toMatchObject({
      status: "unsubscribed",
      unsubscribed_at: "2026-08-01T00:00:00.000Z",
      email_count: 1,
    });

    const saves_after_rescan = state.saved.length;

    state.requests = [];
    await run();

    expect(state.requests).toHaveLength(1);
    expect(state.saved.length).toBeLessThanOrEqual(saves_after_rescan + 1);
    expect(state.saved.at(-1)?.subscriptions).toEqual(rescanned?.subscriptions);
  });

  it("pages through a large mailbox one request at a time", async () => {
    for (let index = 0; index < 450; index++) {
      add(`sender${index % 30}@news.example.com`, {
        is_archived: index % 3 === 0,
      });
    }

    await run();

    expect(state.requests).toHaveLength(3);
    expect(state.requests.every((params) => params.limit === 200)).toBe(true);
    expect(senders(state.saved.at(-1))).toHaveLength(30);
  });
});
