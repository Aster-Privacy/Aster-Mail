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

type CacheModule = typeof import("@/services/subscription_cache");

const server = vi.hoisted(() => ({
  encrypted: null as string | null,
  nonce: null as string | null,
  conflicts: 0,
  before_put: null as null | (() => Promise<unknown>),
  plaintext: null as string | null,
  stored_plaintext: null as string | null,
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
      server.stored_plaintext = server.plaintext;

      return { data: { success: true } };
    }),
  },
}));

const real_encrypt = crypto.subtle.encrypt.bind(crypto.subtle);

function record_written_plaintext(): void {
  vi.spyOn(crypto.subtle, "encrypt").mockImplementation(
    async (...args: Parameters<SubtleCrypto["encrypt"]>) => {
      server.plaintext = new TextDecoder().decode(args[2] as Uint8Array);

      return real_encrypt(...args);
    },
  );
}

function stored_as_written(): SubscriptionCacheData {
  return JSON.parse(server.stored_plaintext ?? "null");
}

async function fresh_device(): Promise<CacheModule> {
  vi.resetModules();

  return import("@/services/subscription_cache");
}

type Vault = Parameters<CacheModule["save_subscription_cache"]>[1];

const vault_a = { identity_key: "shared-identity-key" } as unknown as Vault;
const vault_b = { identity_key: "shared-identity-key" } as unknown as Vault;
const vault_c = { identity_key: "shared-identity-key" } as unknown as Vault;

const DELETED_AT = "2026-11-10T00:00:00.000Z";

function sender(email: string, last_received = "2026-11-01T00:00:00.000Z") {
  return {
    sender_email: email,
    sender_name: email,
    domain: "example.com",
    email_count: 1,
    last_received,
    has_one_click: false,
    category: "newsletter",
    status: "active",
  } as CachedSubscription;
}

function emails(cache: SubscriptionCacheData | null): string[] {
  return (cache?.subscriptions ?? []).map((s) => s.sender_email).sort();
}

function deleted_emails(cache: SubscriptionCacheData | null): string[] {
  return (cache?.deleted ?? []).map((d) => d.sender_email).sort();
}

function with_entry(
  cache: SubscriptionCacheData,
  email: string,
  change: Partial<CachedSubscription>,
): SubscriptionCacheData {
  return {
    ...cache,
    subscriptions: cache.subscriptions.map((s) =>
      s.sender_email === email ? { ...s, ...change } : s,
    ),
  };
}

let device_a: CacheModule;
let device_b: CacheModule;

describe("deleting a subscription while a save is retried", () => {
  beforeEach(async () => {
    server.encrypted = null;
    server.nonce = null;
    server.conflicts = 0;
    server.before_put = null;
    server.plaintext = null;
    server.stored_plaintext = null;
    record_written_plaintext();

    device_a = await fresh_device();
    device_b = await fresh_device();

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

  it("keeps a deleted sender out when another device changed it during the save", async () => {
    const seen_by_a = await device_a.load_subscription_cache(vault_a);
    const seen_by_b = await device_b.load_subscription_cache(vault_b);

    server.before_put = () =>
      device_b.save_subscription_cache(
        with_entry(seen_by_b!, "a@example.com", { email_count: 7 }),
        vault_b,
      );

    expect(
      await device_a.save_subscription_cache(
        device_a.with_deleted_senders(
          seen_by_a!,
          ["a@example.com"],
          DELETED_AT,
        ),
        vault_a,
      ),
    ).toBe(true);
    expect(server.conflicts).toBe(1);

    const stored = await (await fresh_device()).load_subscription_cache(
      vault_c,
    );

    expect(emails(stored)).toEqual(["b@example.com"]);
    expect(deleted_emails(stored)).toEqual(["a@example.com"]);
    expect(emails(stored_as_written())).toEqual(["b@example.com"]);
    expect(deleted_emails(stored_as_written())).toEqual(["a@example.com"]);
  });

  it("keeps a deletion made on another device during a retried status save", async () => {
    const seen_by_a = await device_a.load_subscription_cache(vault_a);
    const seen_by_b = await device_b.load_subscription_cache(vault_b);

    server.before_put = () =>
      device_b.save_subscription_cache(
        device_b.with_deleted_senders(
          seen_by_b!,
          ["a@example.com"],
          DELETED_AT,
        ),
        vault_b,
      );

    expect(
      await device_a.save_subscription_cache(
        with_entry(seen_by_a!, "a@example.com", { email_count: 9 }),
        vault_a,
      ),
    ).toBe(true);
    expect(server.conflicts).toBe(1);

    const stored = await (await fresh_device()).load_subscription_cache(
      vault_c,
    );

    expect(emails(stored)).toEqual(["b@example.com"]);
    expect(deleted_emails(stored)).toEqual(["a@example.com"]);
    expect(emails(stored_as_written())).toEqual(["b@example.com"]);
    expect(deleted_emails(stored_as_written())).toEqual(["a@example.com"]);
  });

  it("keeps both deletions when two devices delete different senders at once", async () => {
    const seen_by_a = await device_a.load_subscription_cache(vault_a);
    const seen_by_b = await device_b.load_subscription_cache(vault_b);

    server.before_put = () =>
      device_b.save_subscription_cache(
        device_b.with_deleted_senders(
          seen_by_b!,
          ["b@example.com"],
          DELETED_AT,
        ),
        vault_b,
      );

    expect(
      await device_a.save_subscription_cache(
        device_a.with_deleted_senders(
          seen_by_a!,
          ["a@example.com"],
          DELETED_AT,
        ),
        vault_a,
      ),
    ).toBe(true);
    expect(server.conflicts).toBe(1);

    const stored = await (await fresh_device()).load_subscription_cache(
      vault_c,
    );

    expect(emails(stored)).toEqual([]);
    expect(deleted_emails(stored)).toEqual(["a@example.com", "b@example.com"]);
    expect(emails(stored_as_written())).toEqual([]);
    expect(deleted_emails(stored_as_written())).toEqual([
      "a@example.com",
      "b@example.com",
    ]);
  });

  it("keeps a deleted sender out when a status change on it is retried", async () => {
    const seen_by_a = await device_a.load_subscription_cache(vault_a);
    const seen_by_b = await device_b.load_subscription_cache(vault_b);

    server.before_put = () =>
      device_b.save_subscription_cache(
        device_b.with_deleted_senders(
          seen_by_b!,
          ["a@example.com"],
          DELETED_AT,
        ),
        vault_b,
      );

    expect(
      await device_a.save_subscription_cache(
        with_entry(seen_by_a!, "a@example.com", {
          status: "unsubscribed",
          unsubscribed_at: "2026-11-02T00:00:00.000Z",
        }),
        vault_a,
      ),
    ).toBe(true);
    expect(server.conflicts).toBe(1);

    const stored = await (await fresh_device()).load_subscription_cache(
      vault_c,
    );

    expect(emails(stored)).toEqual(["b@example.com"]);
    expect(emails(stored_as_written())).toEqual(["b@example.com"]);
    expect(deleted_emails(stored_as_written())).toEqual(["a@example.com"]);
  });

  it("shows a deleted sender again when the other device saw newer mail from it", async () => {
    const seen_by_a = await device_a.load_subscription_cache(vault_a);
    const seen_by_b = await device_b.load_subscription_cache(vault_b);

    server.before_put = () =>
      device_b.save_subscription_cache(
        with_entry(seen_by_b!, "a@example.com", {
          email_count: 2,
          last_received: "2026-11-12T00:00:00.000Z",
        }),
        vault_b,
      );

    expect(
      await device_a.save_subscription_cache(
        device_a.with_deleted_senders(
          seen_by_a!,
          ["a@example.com"],
          DELETED_AT,
        ),
        vault_a,
      ),
    ).toBe(true);
    expect(server.conflicts).toBe(1);

    const stored = await (await fresh_device()).load_subscription_cache(
      vault_c,
    );

    expect(emails(stored)).toEqual(["a@example.com", "b@example.com"]);
    expect(emails(stored_as_written())).toEqual([
      "a@example.com",
      "b@example.com",
    ]);
  });
});

describe("merging subscription caches with deletions", () => {
  it("keeps a sender deleted on one side that the other side changed", async () => {
    const cache = await fresh_device();
    const base: SubscriptionCacheData = {
      subscriptions: [sender("a@example.com"), sender("b@example.com")],
      last_scan_ts: "2026-11-01T00:00:00.000Z",
    };
    const local = cache.with_deleted_senders(
      base,
      ["a@example.com"],
      DELETED_AT,
    );
    const remote = with_entry(base, "a@example.com", { email_count: 5 });

    const merged = cache.merge_subscription_caches(base, local, remote);

    expect(emails(merged)).toEqual(["b@example.com"]);
    expect(deleted_emails(merged)).toEqual(["a@example.com"]);
  });

  it("joins the deletions recorded on both sides", async () => {
    const cache = await fresh_device();
    const base: SubscriptionCacheData = {
      subscriptions: [sender("a@example.com"), sender("b@example.com")],
      last_scan_ts: "2026-11-01T00:00:00.000Z",
    };
    const local = cache.with_deleted_senders(
      base,
      ["a@example.com"],
      DELETED_AT,
    );
    const remote = cache.with_deleted_senders(
      base,
      ["b@example.com"],
      DELETED_AT,
    );

    const merged = cache.merge_subscription_caches(base, local, remote);

    expect(emails(merged)).toEqual([]);
    expect(deleted_emails(merged)).toEqual(["a@example.com", "b@example.com"]);
  });
});

describe("moving legacy unsubscribe records after a deletion", () => {
  beforeEach(async () => {
    server.encrypted = null;
    server.nonce = null;
    server.conflicts = 0;
    server.before_put = null;
    server.plaintext = null;
    server.stored_plaintext = null;
    record_written_plaintext();

    device_a = await fresh_device();
    device_b = await fresh_device();

    await device_b.save_subscription_cache(
      device_b.with_deleted_senders(
        {
          subscriptions: [sender("a@example.com"), sender("b@example.com")],
          last_scan_ts: "2026-11-01T00:00:00.000Z",
          version: 4,
        },
        ["a@example.com"],
        DELETED_AT,
      ),
      vault_b,
    );
  });

  it("does not bring back a deleted sender but still clears its legacy record", async () => {
    const pending_ids = await device_a.move_legacy_unsubscribed_senders(
      vault_a,
      [
        { id: "legacy-a", sender_email: "a@example.com", sender_name: "A" },
        { id: "legacy-c", sender_email: "c@example.com", sender_name: "C" },
      ],
    );

    expect(pending_ids?.slice().sort()).toEqual(["legacy-a", "legacy-c"]);

    const stored = await (await fresh_device()).load_subscription_cache(
      vault_c,
    );

    expect(emails(stored)).toEqual(["b@example.com", "c@example.com"]);
    expect(deleted_emails(stored)).toEqual(["a@example.com"]);
    expect(emails(stored_as_written())).toEqual([
      "b@example.com",
      "c@example.com",
    ]);
    expect(
      stored_as_written().legacy_move?.pending_ids.slice().sort(),
    ).toEqual(["legacy-a", "legacy-c"]);
  });

  it("matches a deleted sender whatever the letter case of the legacy record", async () => {
    await device_a.move_legacy_unsubscribed_senders(vault_a, [
      { id: "legacy-a", sender_email: "A@Example.com", sender_name: "A" },
    ]);

    expect(emails(stored_as_written())).toEqual(["b@example.com"]);
  });
});
