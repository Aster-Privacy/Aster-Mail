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
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const h = vi.hoisted(() => ({
  store: new Map<string, unknown>(),
  state: { uid: "acct-a" as string | null },
}));

vi.mock("./encrypted_storage", async () => ({
  ...(
    await import("@/tests/fixtures/storage_name_support")
  ).storage_name_support(h.store),
  encrypted_get: vi.fn(async (key: string) =>
    h.store.has(key) ? JSON.parse(JSON.stringify(h.store.get(key))) : null,
  ),
  encrypted_set: vi.fn(async (key: string, value: unknown) => {
    h.store.set(key, JSON.parse(JSON.stringify(value)));
  }),
  encrypted_delete: vi.fn(async (key: string) => {
    h.store.delete(key);
  }),
  encrypted_list_keys: vi.fn(async () => Array.from(h.store.keys())),
}));

vi.mock("./memory_key_store", () => ({
  get_derived_encryption_key: vi.fn(() => new Uint8Array(32).fill(1)),
  has_vault_in_memory: vi.fn(() => true),
}));

vi.mock("@/services/account_manager", () => ({
  accounts_storage_unreadable: vi.fn(() => false),
  get_current_account_id: vi.fn(async () => h.state.uid),
}));

import {
  get_cached_ratchet_plaintext,
  is_cached_plaintext_foreign,
  set_cached_ratchet_plaintext,
} from "./ratchet_plaintext_cache";
import {
  clear_ratchet_verification_status,
  clear_unauthenticated_plaintext,
  is_unauthenticated_plaintext,
  is_trusted_ratchet_plaintext,
  clear_unconfirmed_sender_plaintext,
  is_unconfirmed_sender_plaintext,
  mark_unauthenticated_plaintext,
  mark_unconfirmed_sender_plaintext,
} from "./ratchet_verification_status";
import { scoped_storage_name } from "@/services/crypto/storage_key_names";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function cache_id(message_id: string): Promise<string> {
  return scoped_storage_name("ratchet_plaintext_", h.state.uid, message_id);
}

describe("ratchet plaintext cache durability", () => {
  beforeEach(() => {
    h.store.clear();
    h.state.uid = "acct-a";
    vi.spyOn(Date, "now").mockReturnValue(1_000_000_000_000);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("still returns a message decrypted well past the old 6h window", async () => {
    await set_cached_ratchet_plaintext("msg1", "hello overnight");

    const stored = Date.now();

    vi.spyOn(Date, "now").mockReturnValue(stored + 10 * HOUR);

    expect(await get_cached_ratchet_plaintext("msg1")).toBe("hello overnight");
  });

  it("slides the stored_at forward when an aged entry is read", async () => {
    await set_cached_ratchet_plaintext("msg1", "keep me");

    const stored = Date.now();

    vi.spyOn(Date, "now").mockReturnValue(stored + 2 * DAY);
    await get_cached_ratchet_plaintext("msg1");

    const refreshed = h.store.get(await cache_id("msg1")) as {
      stored_at: number;
    };

    expect(refreshed.stored_at).toBe(stored + 2 * DAY);
  });

  it("expires and removes an entry untouched beyond the retention window", async () => {
    await set_cached_ratchet_plaintext("msg1", "stale");

    const stored = Date.now();

    vi.spyOn(Date, "now").mockReturnValue(stored + 91 * DAY);

    expect(await get_cached_ratchet_plaintext("msg1")).toBeNull();
    expect(h.store.has(await cache_id("msg1"))).toBe(false);
  });

  it("restores the unauthenticated mark after a reload", async () => {
    const alice = { sender: "alice@astermail.org", conversation_id: "conv-a" };

    await set_cached_ratchet_plaintext("lane", "from the lane", true, alice);
    await set_cached_ratchet_plaintext(
      "plain",
      "from the ratchet",
      false,
      alice,
    );
    clear_ratchet_verification_status();

    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 2 * DAY);

    expect(await get_cached_ratchet_plaintext("lane", alice)).toBe(
      "from the lane",
    );
    expect(is_unauthenticated_plaintext("from the lane")).toBe(true);
    expect(
      (h.store.get(await cache_id("lane")) as { unauthenticated?: boolean })
        .unauthenticated,
    ).toBe(true);
    expect(await get_cached_ratchet_plaintext("plain", alice)).toBe(
      "from the ratchet",
    );
    expect(is_unauthenticated_plaintext("from the ratchet")).toBe(false);
  });
});

describe("ratchet plaintext cache sender binding", () => {
  const ALICE = { sender: "alice@astermail.org", conversation_id: "conv-a" };
  const MALLORY = {
    sender: "mallory@astermail.org",
    conversation_id: "conv-m",
  };

  beforeEach(() => {
    h.store.clear();
    h.state.uid = "acct-a";
    clear_ratchet_verification_status();
  });

  it("stores the sender and conversation with the entry", async () => {
    await set_cached_ratchet_plaintext("k1", "hi", false, {
      sender: " Alice@AsterMail.org ",
      conversation_id: "conv-a",
    });

    expect(h.store.get(await cache_id("k1"))).toMatchObject({
      plaintext: "hi",
      sender: "alice@astermail.org",
      conversation_id: "conv-a",
    });
  });

  it("returns a bound entry only to the sender it was bound to", async () => {
    await set_cached_ratchet_plaintext("k1", "real body", false, ALICE);

    expect(await get_cached_ratchet_plaintext("k1", ALICE)).toBe("real body");
    expect(await get_cached_ratchet_plaintext("k1", MALLORY)).toBeNull();
    expect(await get_cached_ratchet_plaintext("k1")).toBeNull();
    expect(await is_cached_plaintext_foreign("k1", MALLORY)).toBe(true);
    expect(await is_cached_plaintext_foreign("k1", ALICE)).toBe(false);
  });

  it("never lets another sender overwrite a bound entry", async () => {
    await set_cached_ratchet_plaintext("k1", "real body", false, ALICE);
    await set_cached_ratchet_plaintext("k1", "forged", true, MALLORY);
    await set_cached_ratchet_plaintext("k1", "forged", false, MALLORY);
    await set_cached_ratchet_plaintext("k1", "unbound");

    expect(h.store.get(await cache_id("k1"))).toMatchObject({
      plaintext: "real body",
      sender: "alice@astermail.org",
    });
  });

  it("lets an authenticated decrypt replace another sender's unverified entry", async () => {
    await set_cached_ratchet_plaintext("k1", "forged first", true, MALLORY);
    await set_cached_ratchet_plaintext("k1", "real body", false, ALICE);

    expect(await get_cached_ratchet_plaintext("k1", ALICE)).toBe("real body");
    expect(await get_cached_ratchet_plaintext("k1", MALLORY)).toBeNull();
  });

  it("treats an older entry without a sender as unverified and never binds it", async () => {
    await set_cached_ratchet_plaintext("k1", "legacy body");

    expect(await get_cached_ratchet_plaintext("k1", MALLORY)).toBe(
      "legacy body",
    );
    expect(is_unauthenticated_plaintext("legacy body")).toBe(true);
    expect(h.store.get(await cache_id("k1"))).not.toHaveProperty("sender");
    expect(await get_cached_ratchet_plaintext("k1", ALICE)).toBe("legacy body");
    expect(is_unauthenticated_plaintext("legacy body")).toBe(true);
  });

  it("lets an authenticated decrypt bind an older entry", async () => {
    await set_cached_ratchet_plaintext("k1", "legacy body");
    await get_cached_ratchet_plaintext("k1", MALLORY);
    await set_cached_ratchet_plaintext("k1", "real body", false, ALICE);
    clear_ratchet_verification_status();

    expect(await get_cached_ratchet_plaintext("k1", ALICE)).toBe("real body");
    expect(is_unauthenticated_plaintext("real body")).toBe(false);
    expect(await get_cached_ratchet_plaintext("k1", MALLORY)).toBeNull();
  });

  it("keeps the unauthenticated mark on an older entry", async () => {
    await set_cached_ratchet_plaintext("k1", "lane body", true);

    expect(await get_cached_ratchet_plaintext("k1", ALICE)).toBe("lane body");
    expect(is_unauthenticated_plaintext("lane body")).toBe(true);
    expect(
      (h.store.get(await cache_id("k1")) as { unauthenticated?: boolean })
        .unauthenticated,
    ).toBe(true);
  });

  it("refuses an entry from the same sender in another conversation", async () => {
    await set_cached_ratchet_plaintext("k1", "real body", false, ALICE);

    expect(
      await get_cached_ratchet_plaintext("k1", {
        sender: ALICE.sender,
        conversation_id: "conv-other",
      }),
    ).toBeNull();
    expect(
      await is_cached_plaintext_foreign("k1", {
        sender: ALICE.sender,
        conversation_id: "conv-other",
      }),
    ).toBe(true);
  });

  it("keeps identical text unverified while another message still marks it", () => {
    mark_unauthenticated_plaintext("same text", "forged-b");
    mark_unauthenticated_plaintext("same text", "real-a");
    clear_unauthenticated_plaintext("same text", "real-a");

    expect(is_unauthenticated_plaintext("same text")).toBe(true);

    clear_unauthenticated_plaintext("same text", "forged-b");

    expect(is_unauthenticated_plaintext("same text")).toBe(false);
  });

  it("keeps a plaintext untrusted after newer marks push it out", () => {
    clear_ratchet_verification_status();
    mark_unconfirmed_sender_plaintext("first unconfirmed", "m-first");
    mark_unauthenticated_plaintext("first lane", "m-lane");

    for (let i = 0; i < 1200; i++) {
      mark_unconfirmed_sender_plaintext(`filler ${i}`, `m-${i}`);
      mark_unauthenticated_plaintext(`lane filler ${i}`, `l-${i}`);
    }

    expect(is_unconfirmed_sender_plaintext("first unconfirmed")).toBe(false);
    expect(is_trusted_ratchet_plaintext("first unconfirmed")).toBe(false);
    expect(is_trusted_ratchet_plaintext("first lane")).toBe(false);
    expect(is_trusted_ratchet_plaintext("never marked")).toBe(true);

    clear_unconfirmed_sender_plaintext("first unconfirmed", "m-first");

    expect(is_trusted_ratchet_plaintext("first unconfirmed")).toBe(true);
    expect(is_trusted_ratchet_plaintext("first lane")).toBe(false);

    clear_ratchet_verification_status();

    expect(is_trusted_ratchet_plaintext("first lane")).toBe(true);
  });

  it("does not mark a refused entry as unauthenticated content", async () => {
    await set_cached_ratchet_plaintext("k1", "real lane body", true, ALICE);
    clear_ratchet_verification_status();

    expect(await get_cached_ratchet_plaintext("k1", MALLORY)).toBeNull();
    expect(is_unauthenticated_plaintext("real lane body")).toBe(false);
  });

  it("keeps a checked bound entry confirmed", async () => {
    await set_cached_ratchet_plaintext("k1", "checked body", false, ALICE);
    clear_ratchet_verification_status();

    expect(await get_cached_ratchet_plaintext("k1", ALICE)).toBe("checked body");
    expect(is_unconfirmed_sender_plaintext("checked body")).toBe(false);
  });

  it("keeps a bound entry without a flag confirmed", async () => {
    h.store.set(await cache_id("k1"), {
      plaintext: "older bound body",
      stored_at: Date.now(),
      sender: ALICE.sender,
      conversation_id: ALICE.conversation_id,
    });
    clear_ratchet_verification_status();

    expect(await get_cached_ratchet_plaintext("k1", ALICE)).toBe(
      "older bound body",
    );
    expect(is_unconfirmed_sender_plaintext("older bound body")).toBe(false);
    expect(is_unauthenticated_plaintext("older bound body")).toBe(false);
  });
});
