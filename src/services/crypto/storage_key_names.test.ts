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
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  create_transactional_indexed_db,
  type TransactionalIndexedDb,
} from "@/tests/fixtures/transactional_indexed_db";

const ACCOUNT = "11111111-2222-4333-8444-555555555555";
const OTHER_ACCOUNT = "99999999-8888-4777-8666-555555555555";
const PEER = "alice@example.org";
const CONVERSATION = "c0ffee00c0ffee00c0ffee00c0ffee00";
const MESSAGE = "message-4711";
const STORE = "encrypted_data";

const { vault } = vi.hoisted(() => ({
  vault: {
    key: new Uint8Array(32).fill(7) as Uint8Array | null,
    uid: "11111111-2222-4333-8444-555555555555" as string | null,
    others: [] as string[],
  },
}));

vi.mock("@/services/crypto/memory_key_store", () => ({
  get_derived_encryption_key: () => (vault.key ? vault.key.slice() : null),
  has_vault_in_memory: () => vault.key !== null,
  on_vault_cleared: () => () => undefined,
  on_keys_ready: () => () => undefined,
}));
vi.mock("@/services/crypto/legacy_keks", () => ({
  decrypt_aes_gcm_with_fallback: (
    key: CryptoKey,
    ciphertext: BufferSource,
    iv: BufferSource,
  ) => crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext),
  decrypt_with_legacy_derived_keys: async () => null,
}));
vi.mock("@/services/account_manager", () => ({
  get_current_account_id: async () => vault.uid,
  get_all_accounts: async () =>
    [vault.uid, ...vault.others].filter(Boolean).map((id) => ({ id })),
  accounts_storage_unreadable: () => false,
}));
vi.mock("@/services/crypto/double_ratchet", () => ({
  DoubleRatchet: {
    deserialize: (state: unknown) => ({ serialize: async () => state, state }),
  },
}));
vi.mock("@/services/crypto/ratchet_verification_status", () => ({
  mark_unauthenticated_plaintext: () => undefined,
}));

interface Tab {
  storage: typeof import("./encrypted_storage");
  names: typeof import("./storage_key_names");
  states: typeof import("./ratchet_state_store");
  plaintexts: typeof import("./ratchet_plaintext_cache");
}

const master = {} as CryptoKey;
let db: TransactionalIndexedDb;

async function open_tab(): Promise<Tab> {
  vi.resetModules();

  return {
    storage: await import("./encrypted_storage"),
    names: await import("./storage_key_names"),
    states: await import("./ratchet_state_store"),
    plaintexts: await import("./ratchet_plaintext_cache"),
  };
}

function ratchet_state(marker: string) {
  return {
    conversation_id: CONVERSATION,
    state: { dh_keypair: { public_key: marker }, root_key: marker },
  };
}

const PLAIN_ENTRIES: [string, unknown][] = [
  [`ratchet_sender_identity_history_${ACCOUNT}_${PEER}`, ["identity-a"]],
  [`ratchet_identity_pin_${ACCOUNT}_${PEER}`, { fingerprint: "pin-a" }],
  [`ratchet_identity_change_${ACCOUNT}_${PEER}`, { fingerprint: "change-a" }],
  [`ratchet_owner_key_pin_${ACCOUNT}_${PEER}`, { fingerprint: "owner-a" }],
  [`ratchet_identity_untrusted_${ACCOUNT}_${PEER}`, { flagged_at: 5 }],
  [`ratchet_state_${ACCOUNT}_${CONVERSATION}`, ratchet_state("live")],
  [`ratchet_state_${ACCOUNT}_${CONVERSATION}_archive`, [ratchet_state("old")]],
  [`ratchet_plaintext_${ACCOUNT}_${MESSAGE}`, { plaintext: "hello" }],
];

const SCOPED_LOOKUPS: [string, string, unknown][] = [
  ["ratchet_sender_identity_history_", PEER, ["identity-a"]],
  ["ratchet_identity_pin_", PEER, { fingerprint: "pin-a" }],
  ["ratchet_identity_change_", PEER, { fingerprint: "change-a" }],
  ["ratchet_owner_key_pin_", PEER, { fingerprint: "owner-a" }],
  ["ratchet_identity_untrusted_", PEER, { flagged_at: 5 }],
  ["ratchet_state_", CONVERSATION, ratchet_state("live")],
  ["ratchet_state_", `${CONVERSATION}_archive`, [ratchet_state("old")]],
  ["ratchet_plaintext_", MESSAGE, { plaintext: "hello" }],
];

async function seed_plain_entries(tab: Tab): Promise<void> {
  for (const [name, value] of PLAIN_ENTRIES) {
    await tab.storage.encrypted_set(name, value, master);
  }
}

async function expect_every_entry_readable(tab: Tab): Promise<void> {
  for (const [prefix, rest, value] of SCOPED_LOOKUPS) {
    expect(
      await tab.names.scoped_get(prefix, ACCOUNT, rest, master),
      `${prefix}${rest}`,
    ).toEqual(value);
  }
}

async function stored_names(): Promise<string[]> {
  await db.idle();

  return db.keys(STORE);
}

async function leaking_names(): Promise<string[]> {
  return (await stored_names()).filter(
    (name) =>
      name.includes(PEER) ||
      name.includes(CONVERSATION) ||
      name.includes(MESSAGE),
  );
}

function install_database(): void {
  db = create_transactional_indexed_db();
  Object.assign(globalThis.indexedDB, {
    open: db.factory.open,
    deleteDatabase: db.factory.deleteDatabase,
  });
}

const pause = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

beforeEach(() => {
  install_database();
  vault.key = new Uint8Array(32).fill(7);
  vault.uid = ACCOUNT;
  vault.others = [];
});

describe("encrypted_move", () => {
  it("re-encrypts the value under the new name and removes the old one", async () => {
    const tab = await open_tab();

    await tab.storage.encrypted_set("from_name", { n: 1 }, master);

    expect(
      await tab.storage.encrypted_move("from_name", "to_name", master),
    ).toBe("moved");
    expect(await stored_names()).toEqual(["to_name"]);
    expect(await tab.storage.encrypted_get("to_name", master)).toEqual({
      n: 1,
    });
  });

  it("leaves the old entry untouched when the transaction dies", async () => {
    const tab = await open_tab();

    await tab.storage.encrypted_set("from_name", { n: 1 }, master);
    db.abort_next_write();

    await expect(
      tab.storage.encrypted_move("from_name", "to_name", master),
    ).rejects.toThrow();
    expect(await stored_names()).toEqual(["from_name"]);
    expect(await tab.storage.encrypted_get("from_name", master)).toEqual({
      n: 1,
    });

    expect(
      await tab.storage.encrypted_move("from_name", "to_name", master),
    ).toBe("moved");
    expect(await stored_names()).toEqual(["to_name"]);
  });

  it("keeps a newer value that already sits under the new name", async () => {
    const tab = await open_tab();

    await tab.storage.encrypted_set("from_name", { n: "stale" }, master);
    await pause(5);
    await tab.storage.encrypted_set("to_name", { n: "fresh" }, master);

    expect(
      await tab.storage.encrypted_move("from_name", "to_name", master),
    ).toBe("kept_existing");
    expect(await stored_names()).toEqual(["to_name"]);
    expect(await tab.storage.encrypted_get("to_name", master)).toEqual({
      n: "fresh",
    });
  });

  it("does not move an entry it cannot decrypt", async () => {
    const tab = await open_tab();

    await tab.storage.encrypted_set("from_name", { n: 1 }, master);
    vault.key = new Uint8Array(32).fill(9);

    expect(
      await tab.storage.encrypted_move("from_name", "to_name", master),
    ).toBe("unreadable");
    expect(await stored_names()).toEqual(["from_name"]);
  });
});

describe("storage name migration", () => {
  it("writes no correspondent address, conversation id, or message id into a key name", async () => {
    const tab = await open_tab();

    await tab.names.scoped_set(
      "ratchet_identity_pin_",
      ACCOUNT,
      PEER,
      1,
      master,
    );
    await tab.states.save_ratchet_state({
      serialize: async () => ratchet_state("live"),
    } as never);
    await tab.states.archive_ratchet_state(ratchet_state("old") as never);
    await tab.plaintexts.set_cached_ratchet_plaintext(MESSAGE, "hello");

    expect((await stored_names()).length).toBeGreaterThanOrEqual(5);
    expect(await leaking_names()).toEqual([]);
  });

  it("renames every existing entry and keeps its value", async () => {
    const tab = await open_tab();

    await seed_plain_entries(tab);
    expect(await leaking_names()).toHaveLength(PLAIN_ENTRIES.length);

    const result = await tab.names.migrate_storage_names(ACCOUNT);

    expect(result).toEqual({ moved: PLAIN_ENTRIES.length, unreadable: 0 });
    expect(await leaking_names()).toEqual([]);
    await expect_every_entry_readable(tab);

    const loaded = await tab.states.load_ratchet_state(CONVERSATION);
    const archived =
      await tab.states.load_archived_ratchet_states(CONVERSATION);

    expect((loaded as unknown as { state: unknown }).state).toEqual(
      ratchet_state("live"),
    );
    expect(archived).toHaveLength(1);
    expect(await tab.plaintexts.get_cached_ratchet_plaintext(MESSAGE)).toBe(
      "hello",
    );
  });

  it("finds an entry under its old name before the sweep has run", async () => {
    const tab = await open_tab();

    await seed_plain_entries(tab);

    const loaded = await tab.states.load_ratchet_state(CONVERSATION);

    expect((loaded as unknown as { state: unknown }).state).toEqual(
      ratchet_state("live"),
    );
    expect(
      (await stored_names()).includes(
        `ratchet_state_${ACCOUNT}_${CONVERSATION}`,
      ),
    ).toBe(false);
    await expect_every_entry_readable(tab);
    expect(await leaking_names()).toEqual([]);
  });

  it("adopts entries written before accounts had their own namespace", async () => {
    const tab = await open_tab();

    await tab.storage.encrypted_set(
      `ratchet_state_${CONVERSATION}`,
      ratchet_state("live"),
      master,
    );
    await tab.storage.encrypted_set(
      `ratchet_identity_pin_${PEER}`,
      { fingerprint: "pin-a" },
      master,
    );

    await tab.names.migrate_storage_names(ACCOUNT);

    expect(await leaking_names()).toEqual([]);
    expect(
      await tab.names.scoped_get(
        "ratchet_state_",
        ACCOUNT,
        CONVERSATION,
        master,
      ),
    ).toEqual(ratchet_state("live"));
    expect(
      await tab.names.scoped_get(
        "ratchet_identity_pin_",
        ACCOUNT,
        PEER,
        master,
      ),
    ).toEqual({ fingerprint: "pin-a" });
  });

  it("converges after being interrupted at every possible write", async () => {
    for (let cut = 0; cut < PLAIN_ENTRIES.length; cut++) {
      install_database();

      const first = await open_tab();

      await seed_plain_entries(first);
      await first.names.scoped_storage_name("ratchet_state_", ACCOUNT, "x");

      await db.idle();

      const commits_before = db.write_commits();
      const running = first.names.migrate_storage_names(ACCOUNT);

      while (db.write_commits() < commits_before + cut) await pause(0);
      db.abort_next_write();

      await expect(running).rejects.toThrow();
      expect(
        (await stored_names()).filter((n) => !n.startsWith("storage_name_key")),
      ).toHaveLength(PLAIN_ENTRIES.length);

      const reopened = await open_tab();

      await reopened.names.migrate_storage_names(ACCOUNT);

      expect(await leaking_names(), `cut ${cut}`).toEqual([]);
      await expect_every_entry_readable(reopened);
    }
  });

  it("loses nothing when two tabs migrate at the same time", async () => {
    const seeder = await open_tab();

    await seed_plain_entries(seeder);

    const first = await open_tab();
    const second = await open_tab();

    await Promise.all([
      first.names.migrate_storage_names(ACCOUNT),
      second.names.migrate_storage_names(ACCOUNT),
      second.states.load_ratchet_state(CONVERSATION),
      first.plaintexts.get_cached_ratchet_plaintext(MESSAGE),
    ]);

    expect(await leaking_names()).toEqual([]);
    expect(
      (await stored_names()).filter((n) => !n.startsWith("storage_name_key"))
        .length,
    ).toBeGreaterThanOrEqual(PLAIN_ENTRIES.length);
    await expect_every_entry_readable(first);
    await expect_every_entry_readable(second);
  });

  it("finds an entry another tab renames between its two lookups", async () => {
    const first = await open_tab();

    await seed_plain_entries(first);

    const sweeper = await open_tab();
    const reader = await open_tab();
    const read = reader.storage.encrypted_get;
    let renamed_meanwhile = false;

    vi.spyOn(reader.storage, "encrypted_get").mockImplementation(
      async (name, key) => {
        const value = await read(name, key);

        if (
          !renamed_meanwhile &&
          value === null &&
          name.startsWith("ratchet_state_")
        ) {
          renamed_meanwhile = true;
          await sweeper.names.migrate_storage_names(ACCOUNT);
        }

        return value;
      },
    );

    expect(
      await reader.names.scoped_get(
        "ratchet_state_",
        ACCOUNT,
        CONVERSATION,
        master,
      ),
    ).toEqual(ratchet_state("live"));
    expect(renamed_meanwhile).toBe(true);
  });

  it("gives two tabs that start together the same name key", async () => {
    const first = await open_tab();
    const second = await open_tab();

    const [a, b] = await Promise.all([
      first.names.scoped_storage_name("ratchet_state_", ACCOUNT, CONVERSATION),
      second.names.scoped_storage_name("ratchet_state_", ACCOUNT, CONVERSATION),
    ]);

    expect(a).toBe(b);
    expect(a).toMatch(
      new RegExp(`^ratchet_state_${ACCOUNT}_h1_[A-Za-z0-9_-]{43}$`),
    );
  });

  it("does not let a stale old-name entry overwrite ratchet state another tab advanced", async () => {
    const seeder = await open_tab();

    await seed_plain_entries(seeder);
    await pause(5);

    const advanced = await open_tab();

    await advanced.states.save_ratchet_state({
      serialize: async () => ratchet_state("advanced"),
    } as never);

    const sweeper = await open_tab();

    await sweeper.names.migrate_storage_names(ACCOUNT);

    const loaded = await sweeper.states.load_ratchet_state(CONVERSATION);

    expect((loaded as unknown as { state: unknown }).state).toEqual(
      ratchet_state("advanced"),
    );
    expect(await leaking_names()).toEqual([]);
  });

  it("leaves another account's entries alone", async () => {
    const tab = await open_tab();
    const foreign = `ratchet_identity_pin_${OTHER_ACCOUNT}_${PEER}`;

    await tab.storage.encrypted_set(foreign, { fingerprint: "b" }, master);
    await seed_plain_entries(tab);
    vault.others = [OTHER_ACCOUNT];

    await tab.names.migrate_storage_names(ACCOUNT, []);

    expect(await stored_names()).toContain(foreign);
  });

  it("gives each account a different name for the same correspondent", async () => {
    const tab = await open_tab();

    const mine = await tab.names.scoped_storage_name(
      "ratchet_identity_pin_",
      ACCOUNT,
      PEER,
    );
    const theirs = await tab.names.scoped_storage_name(
      "ratchet_identity_pin_",
      OTHER_ACCOUNT,
      PEER,
    );

    expect(mine.split("_h1_")[1]).not.toBe(theirs.split("_h1_")[1]);
  });

  it("keeps names stable across a reload", async () => {
    const before = await (
      await open_tab()
    ).names.scoped_storage_name("ratchet_state_", ACCOUNT, CONVERSATION);
    const after = await (
      await open_tab()
    ).names.scoped_storage_name("ratchet_state_", ACCOUNT, CONVERSATION);

    expect(after).toBe(before);
  });

  it("refuses to mint a new name key when the stored one cannot be read", async () => {
    const tab = await open_tab();

    await tab.names.scoped_set(
      "ratchet_state_",
      ACCOUNT,
      CONVERSATION,
      ratchet_state("live"),
      master,
    );

    vault.key = new Uint8Array(32).fill(9);

    const locked_out = await open_tab();

    await expect(
      locked_out.names.scoped_storage_name(
        "ratchet_state_",
        ACCOUNT,
        CONVERSATION,
      ),
    ).rejects.toThrow("storage names unavailable");
    expect(
      (await stored_names()).filter((n) => n.startsWith("storage_name_key")),
    ).toHaveLength(1);
  });
});

describe("delete_account_storage", () => {
  it("removes one account's entries without the vault", async () => {
    const tab = await open_tab();

    await seed_plain_entries(tab);
    await tab.names.migrate_storage_names(ACCOUNT);
    await tab.storage.encrypted_set(
      `ratchet_identity_pin_${ACCOUNT}_${PEER}`,
      { fingerprint: "late" },
      master,
    );
    await tab.storage.encrypted_set(
      `ratchet_conversation_index_${ACCOUNT}`,
      [CONVERSATION],
      master,
    );
    await tab.names.scoped_set(
      "ratchet_identity_pin_",
      OTHER_ACCOUNT,
      PEER,
      { fingerprint: "b" },
      master,
    );

    const kept = (await stored_names()).filter((name) =>
      name.includes(OTHER_ACCOUNT),
    );

    vault.key = null;

    await tab.names.delete_account_storage(ACCOUNT);

    expect((await stored_names()).sort()).toEqual(kept.sort());
    expect(kept).toHaveLength(2);
  });

  it("clears ratchet state for a signed-out account after the vault is gone", async () => {
    const tab = await open_tab();

    await tab.states.save_ratchet_state({
      serialize: async () => ratchet_state("live"),
    } as never);
    await tab.plaintexts.set_cached_ratchet_plaintext(MESSAGE, "hello");

    vault.key = null;

    await tab.states.clear_all_ratchet_states(ACCOUNT);
    await tab.plaintexts.clear_account_plaintext_cache(ACCOUNT);

    expect(
      db
        .keys(STORE)
        .filter(
          (name) =>
            name.startsWith("ratchet_state_") ||
            name.startsWith("ratchet_plaintext_") ||
            name.startsWith("ratchet_conversation_index"),
        ),
    ).toEqual([]);
  });
});
