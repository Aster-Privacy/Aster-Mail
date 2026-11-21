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
import type { SubscriptionCacheData } from "@/services/subscription_cache";

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

interface MailboxEntry {
  item: MailItem;
  sender: string;
  recipient: string;
  unsubscribe?: string;
}

const state = vi.hoisted(() => ({
  mailbox: [] as MailboxEntry[],
  saved: [] as SubscriptionCacheData[],
  cache: null as SubscriptionCacheData | null,
}));

vi.mock("@/services/api/mail", () => ({
  list_mail_items: vi.fn(async (_params: ListMailItemsParams) => ({
    data: {
      items: state.mailbox.map((entry) => entry.item),
      has_more: false,
      next_cursor: undefined,
    },
  })),
}));

vi.mock("@/components/email/shared/decrypt_envelope", () => ({
  decrypt_mail_envelope: vi.fn(
    async (_envelope: string, _nonce: string, id: string) => {
      const entry = state.mailbox.find((candidate) => candidate.item.id === id);

      if (!entry) return null;

      return {
        from: { name: entry.sender, email: entry.sender },
        to: [{ email: entry.recipient }],
        list_unsubscribe: entry.unsubscribe,
      };
    },
  ),
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
const SENDER = "news@letters.example.com";

let sequence = 0;

function add(
  routing_token: string,
  recipient: string,
  unsubscribe?: string,
): void {
  sequence += 1;
  const ts = new Date(Date.UTC(2026, 8, 1) - sequence * 60000).toISOString();

  state.mailbox.push({
    sender: SENDER,
    recipient,
    unsubscribe,
    item: {
      id: `m${sequence}`,
      item_type: "received",
      encrypted_envelope: "e",
      envelope_nonce: "n",
      folder_token: "",
      is_external: true,
      routing_token,
      created_at: ts,
      message_ts: ts,
    } as MailItem,
  });
}

async function run(): Promise<void> {
  const pending = run_background_scan(vault);

  await vi.runAllTimersAsync();
  await pending;
}

function saved_route() {
  const sub = state.saved
    .at(-1)
    ?.subscriptions.find((entry) => entry.sender_email === SENDER);

  return {
    unsubscribe_link: sub?.unsubscribe_link,
    routing_token: sub?.routing_token,
    recipients: sub?.recipients,
  };
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

describe("background subscription scan unsubscribe route", () => {
  it("takes the routing token and recipients from the message with the link", async () => {
    add("token-newest", "newest@aster.example");
    add(
      "token-listed",
      "listed@aster.example",
      "<https://letters.example.com/unsubscribe>",
    );

    await run();

    expect(saved_route()).toEqual({
      unsubscribe_link: "https://letters.example.com/unsubscribe",
      routing_token: "token-listed",
      recipients: ["listed@aster.example"],
    });
  });

  it("keeps every route field from the newest message that has a link", async () => {
    add("token-new", "new@aster.example", "<https://letters.example.com/new>");
    add("token-old", "old@aster.example", "<https://other.example.net/old>");

    await run();

    expect(saved_route()).toEqual({
      unsubscribe_link: "https://letters.example.com/new",
      routing_token: "token-new",
      recipients: ["new@aster.example"],
    });
  });
});
