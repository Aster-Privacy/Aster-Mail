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
import { describe, it, expect, vi } from "vitest";

import { generate_keypair, DoubleRatchet } from "./double_ratchet";

vi.mock("./encrypted_storage", () => ({
  encrypted_get: vi.fn(),
  encrypted_set: vi.fn(),
  encrypted_delete: vi.fn(),
}));

vi.mock("./memory_key_store", () => ({
  get_derived_encryption_key: vi.fn(() => new Uint8Array(32).fill(1)),
  has_vault_in_memory: vi.fn(() => true),
}));

describe("generate_keypair", () => {
  it("should generate valid key exchange keypair", async () => {
    const keypair = await generate_keypair();

    expect(keypair.public_key).toBeInstanceOf(Uint8Array);
    expect(keypair.secret_key).toBeInstanceOf(Uint8Array);
    expect(keypair.public_key.length).toBe(65);
    expect(keypair.secret_key.length).toBeGreaterThan(0);
  });

  it("should generate unique keypairs each time", async () => {
    const keypair1 = await generate_keypair();
    const keypair2 = await generate_keypair();

    expect(keypair1.public_key).not.toEqual(keypair2.public_key);
    expect(keypair1.secret_key).not.toEqual(keypair2.secret_key);
  });

  it("should generate public key in uncompressed format", async () => {
    const keypair = await generate_keypair();

    expect(keypair.public_key[0]).toBe(0x04);
  });

  it("should generate 32-byte private key", async () => {
    const keypair = await generate_keypair();

    expect(keypair.secret_key.length).toBe(32);
  });

  it("should generate cryptographically random keys", async () => {
    const keys: Uint8Array[] = [];

    for (let i = 0; i < 10; i++) {
      const keypair = await generate_keypair();

      keys.push(keypair.public_key);
    }

    for (let i = 0; i < keys.length; i++) {
      for (let j = i + 1; j < keys.length; j++) {
        expect(keys[i]).not.toEqual(keys[j]);
      }
    }
  });

  it("should produce valid public key structure", async () => {
    const keypair = await generate_keypair();

    expect(keypair.public_key[0]).toBe(0x04);
    expect(keypair.public_key.length).toBe(65);
  });

  it("should handle rapid sequential generation", async () => {
    const keypairs = await Promise.all(
      Array(20)
        .fill(null)
        .map(() => generate_keypair()),
    );

    const public_keys = new Set(
      keypairs.map((kp) => Array.from(kp.public_key).join(",")),
    );

    expect(public_keys.size).toBe(20);
  });
});

describe("DoubleRatchet end-to-end send/receive (resend readability)", () => {
  async function setup() {
    const shared_secret = crypto.getRandomValues(new Uint8Array(32));
    const receiver_keypair = await generate_keypair();
    const conversation_id = "conv_test";

    return { shared_secret, receiver_keypair, conversation_id };
  }

  it("a fresh receiver decrypts the first message (clean bootstrap = a resend)", async () => {
    const { shared_secret, receiver_keypair, conversation_id } = await setup();

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

    const msg = await sender.encrypt("you should be able to read this");

    expect(await receiver.decrypt(msg)).toBe(
      "you should be able to read this",
    );
  });

  it("a fresh receiver decrypts message_number 1 without having seen message 0 (bruno's case)", async () => {
    const { shared_secret, receiver_keypair, conversation_id } = await setup();

    const sender = await DoubleRatchet.init_sender(
      shared_secret,
      receiver_keypair.public_key,
      conversation_id,
    );

    await sender.encrypt("first");
    const second = await sender.encrypt("second");
    expect(second.header.message_number).toBe(1);

    const fresh_receiver = await DoubleRatchet.init_receiver(
      shared_secret,
      receiver_keypair,
      conversation_id,
    );

    expect(await fresh_receiver.decrypt(second)).toBe("second");
  });

  it("a receiver with the WRONG signed prekey cannot decrypt (the obsolete-key failure)", async () => {
    const { shared_secret, receiver_keypair, conversation_id } = await setup();

    const sender = await DoubleRatchet.init_sender(
      shared_secret,
      receiver_keypair.public_key,
      conversation_id,
    );
    const wrong_keypair = await generate_keypair();
    const wrong_receiver = await DoubleRatchet.init_receiver(
      shared_secret,
      wrong_keypair,
      conversation_id,
    );

    const msg = await sender.encrypt("hello");

    await expect(wrong_receiver.decrypt(msg)).rejects.toThrow();
  });
});

describe("DoubleRatchet sync-safety (dirty tracking)", () => {
  async function setup() {
    const shared_secret = crypto.getRandomValues(new Uint8Array(32));
    const receiver_keypair = await generate_keypair();

    return { shared_secret, receiver_keypair, conversation_id: "conv_dirty" };
  }

  it("a freshly bootstrapped sender becomes dirty after encrypting", async () => {
    const { shared_secret, receiver_keypair, conversation_id } = await setup();
    const sender = await DoubleRatchet.init_sender(
      shared_secret,
      receiver_keypair.public_key,
      conversation_id,
    );

    expect(sender.is_dirty_since_sync()).toBe(false);
    await sender.encrypt("advance the chain");
    expect(sender.is_dirty_since_sync()).toBe(true);
  });

  it("a receiver becomes dirty after decrypting", async () => {
    const { shared_secret, receiver_keypair, conversation_id } = await setup();
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

    await receiver.decrypt(await sender.encrypt("hello"));
    expect(receiver.is_dirty_since_sync()).toBe(true);
  });

  it("mark_synced clears the flag and survives a serialize round-trip", async () => {
    const { shared_secret, receiver_keypair, conversation_id } = await setup();
    const sender = await DoubleRatchet.init_sender(
      shared_secret,
      receiver_keypair.public_key,
      conversation_id,
    );

    await sender.encrypt("one");
    sender.mark_synced();
    expect(sender.is_dirty_since_sync()).toBe(false);

    const restored = DoubleRatchet.deserialize(await sender.serialize());

    expect(restored.is_dirty_since_sync()).toBe(false);
    await restored.encrypt("two");
    expect(restored.is_dirty_since_sync()).toBe(true);
  });

  it("a legacy state without the flag deserializes as dirty so it is never clobbered", async () => {
    const { shared_secret, receiver_keypair, conversation_id } = await setup();
    const sender = await DoubleRatchet.init_sender(
      shared_secret,
      receiver_keypair.public_key,
      conversation_id,
    );

    sender.mark_synced();
    const serialized = await sender.serialize();

    delete (serialized.state as { dirty_since_sync?: boolean }).dirty_since_sync;

    expect(DoubleRatchet.deserialize(serialized).is_dirty_since_sync()).toBe(
      true,
    );
  });
});
