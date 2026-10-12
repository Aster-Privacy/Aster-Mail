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
import type { MailItem } from "@/services/api/mail";
import type {
  CachedSubscription,
  SubscriptionCacheData,
} from "@/services/subscription_cache";

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

interface Envelope {
  list_unsubscribe?: string;
  body_html?: string;
  body_text?: string;
}

const state = vi.hoisted(() => ({
  mailbox: [] as { item: MailItem; sender: string; envelope: Envelope }[],
  saved: [] as SubscriptionCacheData[],
  cache: null as SubscriptionCacheData | null,
}));

vi.mock("@/services/api/mail", () => ({
  list_mail_items: vi.fn(async () => ({
    data: {
      items: state.mailbox.map((entry) => entry.item),
      has_more: false,
    },
  })),
}));

vi.mock("@/components/email/shared/decrypt_envelope", () => ({
  decrypt_mail_envelope: vi.fn(
    async (_envelope: string, _nonce: string, id: string) => {
      const entry = state.mailbox.find((candidate) => candidate.item.id === id);

      return entry
        ? {
            from: { name: entry.sender, email: entry.sender },
            ...entry.envelope,
          }
        : null;
    },
  ),
}));

vi.mock("@/hooks/use_folders", () => ({
  has_protected_folder_label: () => false,
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

const vault = {} as Parameters<typeof run_background_scan>[0];

const NEWSLETTER: Envelope = {
  list_unsubscribe: "<https://news.example.com/unsubscribe?u=1>",
};
const BODY_UNSUBSCRIBE: Envelope = {
  body_html:
    '<p>Weekly deals</p><a href="https://shop.example.com/u/9f3a">Unsubscribe</a>',
};
const PREFERENCES_ONLY: Envelope = {
  body_html:
    '<p>Your statement is ready.</p><a href="https://bank.example.com/account/manage-email-preferences">Manage your email preferences</a>',
};
const REMOVE_FROM_LIST_ONLY: Envelope = {
  body_html:
    '<p>Your parcel was delivered.</p><a href="https://parcel.example.com/remove-from-list">remove</a>',
};
const PERSONAL: Envelope = {
  body_text: "Hi! Dinner on Friday? https://maps.example.com/place/123",
};

let sequence = 0;

function add(sender: string, envelope: Envelope): void {
  sequence += 1;
  const ts = new Date(Date.UTC(2026, 8, 1) - sequence * 60000).toISOString();

  state.mailbox.push({
    sender,
    envelope,
    item: {
      id: `m${sequence}`,
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

function cached(
  sender_email: string,
  status: CachedSubscription["status"] = "active",
): CachedSubscription {
  return {
    sender_email,
    sender_name: sender_email,
    domain: sender_email.split("@")[1],
    email_count: 4,
    last_received: "2026-08-01T00:00:00.000Z",
    has_one_click: false,
    category: "unknown",
    status,
  };
}

function senders(): string[] {
  return (state.saved.at(-1)?.subscriptions ?? [])
    .map((sub) => sub.sender_email)
    .sort();
}

async function run(): Promise<void> {
  const pending = run_background_scan(vault);

  await vi.runAllTimersAsync();
  await pending;
}

beforeEach(() => {
  vi.useFakeTimers();
  state.mailbox = [];
  state.saved = [];
  state.cache = null;
  sequence = 0;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("which senders the subscription scan lists", () => {
  it("lists mailing lists and leaves out account mail and people", async () => {
    add("news@news.example.com", NEWSLETTER);
    add("deals@shop.example.com", BODY_UNSUBSCRIBE);
    add("alerts@bank.example.com", PREFERENCES_ONLY);
    add("noreply@parcel.example.com", REMOVE_FROM_LIST_ONLY);
    add("friend@mail.example.com", PERSONAL);
    add("friend@mail.example.com", PERSONAL);

    await run();

    expect(senders()).toEqual([
      "deals@shop.example.com",
      "news@news.example.com",
    ]);
  });

  it("counts a sender once any of their messages is list mail", async () => {
    add("store@shop.example.com", PREFERENCES_ONLY);
    add("store@shop.example.com", BODY_UNSUBSCRIBE);

    await run();

    expect(senders()).toEqual(["store@shop.example.com"]);
    expect(state.saved.at(-1)?.subscriptions[0].email_count).toBe(2);
  });

  it("drops entries an older scan added but keeps senders you unsubscribed from", async () => {
    state.cache = {
      version: 3,
      last_scan_ts: "2026-08-01T00:00:00.000Z",
      subscriptions: [
        cached("alerts@bank.example.com"),
        cached("friend@mail.example.com"),
        cached("news@news.example.com"),
        cached("old@promo.example.com", "unsubscribed"),
      ],
    };
    add("alerts@bank.example.com", PREFERENCES_ONLY);
    add("friend@mail.example.com", PERSONAL);
    add("news@news.example.com", NEWSLETTER);

    await run();

    expect(senders()).toEqual([
      "news@news.example.com",
      "old@promo.example.com",
    ]);
  });
});
