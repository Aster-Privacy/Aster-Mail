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
import { describe, it, expect, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => ({
  store: new Map<string, unknown>(),
  state: { uid: "acct-a" as string | null },
}));

vi.mock("./encrypted_storage", () => ({
  encrypted_get: vi.fn(async (key: string) =>
    h.store.has(key) ? JSON.parse(JSON.stringify(h.store.get(key))) : null,
  ),
  encrypted_set: vi.fn(async (key: string, value: unknown) => {
    h.store.set(key, JSON.parse(JSON.stringify(value)));
  }),
  encrypted_delete: vi.fn(async (key: string) => {
    h.store.delete(key);
  }),
}));

vi.mock("./memory_key_store", () => ({
  get_derived_encryption_key: vi.fn(() => new Uint8Array(32).fill(3)),
  has_vault_in_memory: vi.fn(() => true),
}));

vi.mock("@/services/account_manager", () => ({
  get_current_account_id: vi.fn(async () => h.state.uid),
}));

import {
  DoubleRatchet,
  generate_keypair,
  save_ratchet_state,
  load_ratchet_state,
} from "./double_ratchet";

describe("ratchet migrate-on-read keeps existing conversations decryptable", () => {
  beforeEach(() => {
    h.store.clear();
    h.state.uid = "acct-a";
  });

  it("migrates a legacy global row and the migrated state still decrypts a real message", async () => {
    const shared_secret = crypto.getRandomValues(new Uint8Array(32));
    const receiver_keypair = await generate_keypair();
    const conversation_id = "conv_migrate";

    const sender = await DoubleRatchet.init_sender(
      shared_secret,
      receiver_keypair.public_key,
      conversation_id,
    );
    const receiver = await DoubleRatchet.init_receiver(
      shared_secret,
      receiver_keypair,
      conversation_id,
    );

    const ciphertext = await sender.encrypt("message before migration");

    const legacy_serialized = await receiver.serialize();

    h.store.set(
      `ratchet_state_${conversation_id}`,
      JSON.parse(JSON.stringify(legacy_serialized)),
    );
    h.store.set("ratchet_conversation_index", [conversation_id]);

    const migrated = await load_ratchet_state(conversation_id);

    expect(migrated).not.toBeNull();
    expect(await migrated!.decrypt(ciphertext)).toBe("message before migration");

    expect(h.store.has(`ratchet_state_acct-a_${conversation_id}`)).toBe(true);
    expect(h.store.has(`ratchet_state_${conversation_id}`)).toBe(false);
  });

  it("namespaced save round-trips: a message still decrypts after save and reload", async () => {
    const shared_secret = crypto.getRandomValues(new Uint8Array(32));
    const receiver_keypair = await generate_keypair();
    const conversation_id = "conv_save";

    const sender = await DoubleRatchet.init_sender(
      shared_secret,
      receiver_keypair.public_key,
      conversation_id,
    );
    const receiver = await DoubleRatchet.init_receiver(
      shared_secret,
      receiver_keypair,
      conversation_id,
    );

    await save_ratchet_state(receiver);

    const reloaded = await load_ratchet_state(conversation_id);

    expect(reloaded).not.toBeNull();

    const ciphertext = await sender.encrypt("after reload");

    expect(await reloaded!.decrypt(ciphertext)).toBe("after reload");
    expect(h.store.has(`ratchet_state_acct-a_${conversation_id}`)).toBe(true);
  });
});
