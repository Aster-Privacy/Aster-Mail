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

import {
  DoubleRatchet,
  generate_keypair,
  type EncryptedMessage,
} from "./double_ratchet";

vi.mock("./encrypted_storage", () => ({
  encrypted_get: vi.fn(),
  encrypted_set: vi.fn(),
  encrypted_delete: vi.fn(),
}));

vi.mock("./memory_key_store", () => ({
  get_derived_encryption_key: vi.fn(() => new Uint8Array(32).fill(1)),
  has_vault_in_memory: vi.fn(() => true),
}));

async function make_pair(): Promise<{
  alice: DoubleRatchet;
  bob: DoubleRatchet;
}> {
  const shared_secret = new Uint8Array(32).fill(7);
  const bob_keypair = await generate_keypair();
  const bob = await DoubleRatchet.init_receiver(
    shared_secret,
    bob_keypair,
    "conv-1",
  );
  const alice = await DoubleRatchet.init_sender(
    shared_secret,
    bob_keypair.public_key,
    "conv-1",
  );

  return { alice, bob };
}

function snapshot_state(r: DoubleRatchet): string {
  return JSON.stringify(
    (r as unknown as { state: unknown }).state,
    (_k, v) => v,
  );
}

describe("DoubleRatchet round-trip", () => {
  it("alice -> bob: simple roundtrip works", async () => {
    const { alice, bob } = await make_pair();
    const enc = await alice.encrypt("hello bob");

    expect(await bob.decrypt(enc)).toBe("hello bob");
  });

  it("multi-message roundtrip works", async () => {
    const { alice, bob } = await make_pair();
    const m1 = await alice.encrypt("one");
    const m2 = await alice.encrypt("two");

    expect(await bob.decrypt(m1)).toBe("one");
    expect(await bob.decrypt(m2)).toBe("two");
  });

  it("bidirectional roundtrip works", async () => {
    const { alice, bob } = await make_pair();
    const a1 = await alice.encrypt("from alice");

    expect(await bob.decrypt(a1)).toBe("from alice");

    const b1 = await bob.encrypt("from bob");

    expect(await alice.decrypt(b1)).toBe("from bob");

    const a2 = await alice.encrypt("alice again");

    expect(await bob.decrypt(a2)).toBe("alice again");
  });

  it("out-of-order delivery works (skipped keys)", async () => {
    const { alice, bob } = await make_pair();
    const m1 = await alice.encrypt("first");
    const m2 = await alice.encrypt("second");
    const m3 = await alice.encrypt("third");

    expect(await bob.decrypt(m3)).toBe("third");
    expect(await bob.decrypt(m1)).toBe("first");
    expect(await bob.decrypt(m2)).toBe("second");
  });

  it("currently emits v=1 headers (compat mode)", async () => {
    const { alice } = await make_pair();
    const enc = await alice.encrypt("test");

    expect(enc.header.v).toBeUndefined();
  });
});

describe("DoubleRatchet state-corruption resistance", () => {
  it("tampered ciphertext: decrypt throws and state is unchanged", async () => {
    const { alice, bob } = await make_pair();
    const enc = await alice.encrypt("legit");

    const tampered: EncryptedMessage = {
      ...enc,
      ciphertext: btoa(
        String.fromCharCode(...new Uint8Array(32).fill(0x42)),
      ),
    };

    const before = snapshot_state(bob);

    await expect(bob.decrypt(tampered)).rejects.toThrow();

    expect(snapshot_state(bob)).toBe(before);
  });

  it("forged dh_public in header: decrypt throws and state is unchanged", async () => {
    const { alice, bob } = await make_pair();
    const enc = await alice.encrypt("legit");

    const evil_keypair = await generate_keypair();
    const evil_b64 = btoa(String.fromCharCode(...evil_keypair.public_key));

    const forged: EncryptedMessage = {
      ...enc,
      header: { ...enc.header, dh_public: evil_b64 },
    };

    const before = snapshot_state(bob);

    await expect(bob.decrypt(forged)).rejects.toThrow();

    expect(snapshot_state(bob)).toBe(before);
  });

  it("after a failed forgery, legit message still decrypts cleanly", async () => {
    const { alice, bob } = await make_pair();
    const enc = await alice.encrypt("legit");

    const evil_keypair = await generate_keypair();
    const evil_b64 = btoa(String.fromCharCode(...evil_keypair.public_key));
    const forged: EncryptedMessage = {
      ...enc,
      header: { ...enc.header, dh_public: evil_b64 },
    };

    await expect(bob.decrypt(forged)).rejects.toThrow();

    expect(await bob.decrypt(enc)).toBe("legit");
  });

  it("forged message_number: decrypt throws and state is unchanged", async () => {
    const { alice, bob } = await make_pair();
    const enc = await alice.encrypt("legit");

    const forged: EncryptedMessage = {
      ...enc,
      header: { ...enc.header, message_number: 500 },
    };

    const before = snapshot_state(bob);

    await expect(bob.decrypt(forged)).rejects.toThrow();

    expect(snapshot_state(bob)).toBe(before);
  });

  it("excessive message_number throws but does not corrupt state", async () => {
    const { alice, bob } = await make_pair();
    const enc = await alice.encrypt("legit");

    const forged: EncryptedMessage = {
      ...enc,
      header: { ...enc.header, message_number: 100000 },
    };

    const before = snapshot_state(bob);

    await expect(bob.decrypt(forged)).rejects.toThrow();

    expect(snapshot_state(bob)).toBe(before);
  });
});
