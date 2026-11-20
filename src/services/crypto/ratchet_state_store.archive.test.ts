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
import type { SerializedState } from "@/services/crypto/double_ratchet";

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const h = vi.hoisted(() => ({
  store: new Map<string, unknown>(),
}));

vi.mock("@/services/crypto/encrypted_storage", async () => ({
  ...(
    await import("@/tests/fixtures/storage_name_support")
  ).storage_name_support(h.store),
  encrypted_get: vi.fn(async (key: string) =>
    h.store.has(key) ? JSON.parse(JSON.stringify(h.store.get(key))) : undefined,
  ),
  encrypted_set: vi.fn(async (key: string, value: unknown) => {
    h.store.set(key, JSON.parse(JSON.stringify(value)));
  }),
  encrypted_delete: vi.fn(async (key: string) => {
    h.store.delete(key);
  }),
}));

vi.mock("@/services/crypto/memory_key_store", () => ({
  on_vault_cleared: () => () => {},
  on_vault_stored: () => () => {},
  on_keys_ready: () => () => {},
  get_derived_encryption_key: () => new Uint8Array(32).fill(7),
  has_vault_in_memory: () => true,
}));

vi.mock("@/services/crypto/storage_write_key", () => ({
  load_storage_write_key_bytes: async () => new Uint8Array(32).fill(9),
}));

vi.mock("@/services/account_manager", () => ({
  accounts_storage_unreadable: () => false,
  get_current_account_id: async () => "user-1",
}));

vi.mock("@/services/crypto/double_ratchet", () => ({
  DoubleRatchet: {
    deserialize: (data: SerializedState) => ({
      serialize: async () => data,
      data,
    }),
  },
}));

import {
  ARCHIVED_RATCHET_STATE_MAX_AGE_MS,
  archive_ratchet_state,
  load_archived_ratchet_states,
} from "@/services/crypto/ratchet_state_store";
import {
  RATCHET_STATE_PREFIX,
  scoped_get,
  scoped_set,
} from "@/services/crypto/storage_key_names";

const CONVERSATION = "conv-1";
const DAY_MS = 24 * 60 * 60 * 1000;
const START = Date.UTC(2026, 10, 1);

type StoredArchive = SerializedState & { archived_at?: number };

function make_state(tag: string): SerializedState {
  return {
    conversation_id: CONVERSATION,
    state: {
      dh_keypair: { public_key: `pub-${tag}`, private_key: `priv-${tag}` },
      root_key: `root-${tag}`,
    },
  } as unknown as SerializedState;
}

async function storage_key(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new Uint8Array(32).fill(9),
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function read_raw(): Promise<StoredArchive[] | null | undefined> {
  return scoped_get<StoredArchive[]>(
    RATCHET_STATE_PREFIX,
    "user-1",
    `${CONVERSATION}_archive`,
    await storage_key(),
    { include_unscoped: false },
  );
}

async function write_raw(entries: StoredArchive[]): Promise<void> {
  await scoped_set(
    RATCHET_STATE_PREFIX,
    "user-1",
    `${CONVERSATION}_archive`,
    entries,
    await storage_key(),
  );
}

async function loaded_tags(): Promise<string[]> {
  const loaded = (await load_archived_ratchet_states(
    CONVERSATION,
  )) as unknown as Array<{ data: SerializedState }>;

  return loaded.map((entry) => entry.data.state.root_key);
}

describe("archived ratchet state expiry", () => {
  beforeEach(() => {
    h.store.clear();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(START);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("matches the 30 day skipped key window", () => {
    expect(ARCHIVED_RATCHET_STATE_MAX_AGE_MS).toBe(30 * DAY_MS);
  });

  it("stamps each archived state with the time it was archived", async () => {
    await archive_ratchet_state(make_state("a"));

    const raw = await read_raw();

    expect(raw).toHaveLength(1);
    expect(raw![0].archived_at).toBe(START);
  });

  it("keeps an archived state inside the window for late messages", async () => {
    await archive_ratchet_state(make_state("a"));
    vi.setSystemTime(START + 29 * DAY_MS);

    expect(await loaded_tags()).toEqual(["root-a"]);
  });

  it("drops an archived state once the window has passed and deletes it from storage", async () => {
    await archive_ratchet_state(make_state("a"));
    vi.setSystemTime(START + 31 * DAY_MS);

    expect(await loaded_tags()).toEqual([]);
    expect(await read_raw()).toBeFalsy();
  });

  it("prunes expired states when a new state is archived", async () => {
    await archive_ratchet_state(make_state("a"));
    vi.setSystemTime(START + 20 * DAY_MS);
    await archive_ratchet_state(make_state("b"));
    vi.setSystemTime(START + 31 * DAY_MS);
    await archive_ratchet_state(make_state("c"));

    const raw = await read_raw();

    expect(raw!.map((entry) => entry.state.root_key)).toEqual([
      "root-b",
      "root-c",
    ]);
  });

  it("keeps the original archive time when the same state is archived again", async () => {
    await archive_ratchet_state(make_state("a"));
    vi.setSystemTime(START + 10 * DAY_MS);
    await archive_ratchet_state(make_state("a"));

    const raw = await read_raw();

    expect(raw).toHaveLength(1);
    expect(raw![0].archived_at).toBe(START);
  });

  it("treats legacy archives without a time as archived now instead of deleting them", async () => {
    await write_raw([make_state("old")]);

    expect(await loaded_tags()).toEqual(["root-old"]);
    expect((await read_raw())![0].archived_at).toBe(START);

    vi.setSystemTime(START + 29 * DAY_MS);
    expect(await loaded_tags()).toEqual(["root-old"]);

    vi.setSystemTime(START + 31 * DAY_MS);
    expect(await loaded_tags()).toEqual([]);
  });

  it("still keeps only the three most recent archived states", async () => {
    for (const tag of ["a", "b", "c", "d"]) {
      await archive_ratchet_state(make_state(tag));
    }

    expect(await loaded_tags()).toEqual(["root-b", "root-c", "root-d"]);
  });

  it("hands the ratchet only the serialized state, not the archive time", async () => {
    await archive_ratchet_state(make_state("a"));

    const loaded = (await load_archived_ratchet_states(
      CONVERSATION,
    )) as unknown as Array<{ data: Record<string, unknown> }>;

    expect(Object.keys(loaded[0].data).sort()).toEqual([
      "conversation_id",
      "state",
    ]);
  });
});
