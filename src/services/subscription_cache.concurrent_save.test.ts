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
import type {
  CachedSubscription,
  SubscriptionCacheData,
} from "@/services/subscription_cache";

import { beforeEach, describe, expect, it, vi } from "vitest";

type SaveBody = {
  encrypted_subscriptions: string;
  subscriptions_nonce: string;
  expected_nonce?: string;
};

const server = vi.hoisted(() => ({
  encrypted: null as string | null,
  nonce: null as string | null,
  conflicts: 0,
  before_put: null as null | (() => Promise<unknown>),
}));

vi.mock("@/services/api/client", () => ({
  api_client: {
    get: vi.fn(async () => ({
      data: {
        encrypted_subscriptions: server.encrypted,
        subscriptions_nonce: server.nonce,
      },
    })),
    put: vi.fn(async (_path: string, body: SaveBody) => {
      const before_put = server.before_put;

      server.before_put = null;
      if (before_put) await before_put();

      if (
        body.expected_nonce !== undefined &&
        body.expected_nonce !== (server.nonce ?? "")
      ) {
        server.conflicts += 1;

        return {
          error: "Subscriptions changed on another device",
          status: 409,
          server_code: "SUBSCRIPTIONS_VERSION_CONFLICT",
        };
      }

      server.encrypted = body.encrypted_subscriptions;
      server.nonce = body.subscriptions_nonce;

      return { data: { success: true } };
    }),
  },
}));

const device_a = await import("@/services/subscription_cache");

vi.resetModules();

const device_b = await import("@/services/subscription_cache");

type Vault = Parameters<typeof device_a.save_subscription_cache>[1];

const vault_a = { identity_key: "shared-identity-key" } as unknown as Vault;
const vault_b = { identity_key: "shared-identity-key" } as unknown as Vault;

function sender(email: string): CachedSubscription {
  return {
    sender_email: email,
    sender_name: email,
    domain: "example.com",
    email_count: 1,
    last_received: "2026-11-01T00:00:00.000Z",
    has_one_click: false,
    category: "newsletter",
    status: "active",
  };
}

function unsubscribe(
  cache: SubscriptionCacheData,
  email: string,
): SubscriptionCacheData {
  return {
    ...cache,
    subscriptions: cache.subscriptions.map((s) =>
      s.sender_email === email
        ? {
            ...s,
            status: "unsubscribed",
            unsubscribed_at: "2026-11-17T00:00:00.000Z",
          }
        : s,
    ),
  };
}

function statuses(cache: SubscriptionCacheData | null) {
  return Object.fromEntries(
    (cache?.subscriptions ?? []).map((s) => [s.sender_email, s.status]),
  );
}

describe("saving the subscription cache from two devices", () => {
  beforeEach(async () => {
    server.encrypted = null;
    server.nonce = null;
    server.conflicts = 0;
    server.before_put = null;

    await device_b.save_subscription_cache(
      {
        subscriptions: [sender("a@example.com"), sender("b@example.com")],
        last_scan_ts: "2026-11-01T00:00:00.000Z",
        version: 4,
      },
      vault_b,
    );
    server.conflicts = 0;
  });

  it("keeps both changes when two devices save the same version", async () => {
    const seen_by_a = await device_a.load_subscription_cache(vault_a);
    const seen_by_b = await device_b.load_subscription_cache(vault_b);

    expect(
      await device_a.save_subscription_cache(
        unsubscribe(seen_by_a!, "a@example.com"),
        vault_a,
      ),
    ).toBe(true);
    expect(
      await device_b.save_subscription_cache(
        unsubscribe(seen_by_b!, "b@example.com"),
        vault_b,
      ),
    ).toBe(true);

    expect(statuses(await device_a.load_subscription_cache(vault_a))).toEqual(
      {
        "a@example.com": "unsubscribed",
        "b@example.com": "unsubscribed",
      },
    );
  });

  it("keeps a sender another device adds while a status change is saved", async () => {
    const seen_by_b = await device_b.load_subscription_cache(vault_b);

    server.before_put = () =>
      device_b.save_subscription_cache(
        {
          ...seen_by_b!,
          subscriptions: [...seen_by_b!.subscriptions, sender("c@example.com")],
        },
        vault_b,
      );

    expect(
      await device_a.set_cached_sender_status(vault_a, "a@example.com", true),
    ).toBe(true);

    expect(statuses(await device_a.load_subscription_cache(vault_a))).toEqual(
      {
        "a@example.com": "unsubscribed",
        "b@example.com": "active",
        "c@example.com": "active",
      },
    );
  });
});
