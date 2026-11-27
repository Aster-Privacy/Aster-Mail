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
import * as real_openpgp from "openpgp";

const read_key_calls = vi.hoisted(() => ({ count: 0 }));

vi.mock("@/services/crypto/openpgp_loader", () => ({
  load_openpgp: async () => ({
    ...real_openpgp,
    readKey: (options: Parameters<typeof real_openpgp.readKey>[0]) => {
      read_key_calls.count += 1;

      return real_openpgp.readKey(options);
    },
  }),
}));

const { clear_parsed_verification_keys, decrypt_message_verified } =
  await import("./key_manager_pgp_messages");

const PASSPHRASE = "correct horse battery staple";

async function make_key(name: string) {
  const { privateKey, publicKey } = await real_openpgp.generateKey({
    type: "ecc",
    curve: "curve25519Legacy",
    userIDs: [{ name, email: `${name}@example.com` }],
    passphrase: PASSPHRASE,
    format: "armored",
  });

  return { private_key: privateKey, public_key: publicKey };
}

async function seal(
  text: string,
  recipient_public: string,
  sender_private: string,
): Promise<string> {
  const signing_key = await real_openpgp.decryptKey({
    privateKey: await real_openpgp.readPrivateKey({
      armoredKey: sender_private,
    }),
    passphrase: PASSPHRASE,
  });

  return (await real_openpgp.encrypt({
    message: await real_openpgp.createMessage({ text }),
    encryptionKeys: await real_openpgp.readKey({ armoredKey: recipient_public }),
    signingKeys: signing_key,
    format: "armored",
  })) as string;
}

describe("verification key parsing", () => {
  beforeEach(() => {
    clear_parsed_verification_keys();
    read_key_calls.count = 0;
  });

  it("parses a sender key once across repeated verifies", async () => {
    const me = await make_key("me");
    const sender = await make_key("sender");
    const first = await seal("first", me.public_key, sender.private_key);
    const second = await seal("second", me.public_key, sender.private_key);

    const a = await decrypt_message_verified(
      first,
      me.private_key,
      PASSPHRASE,
      [sender.public_key],
    );
    const b = await decrypt_message_verified(
      second,
      me.private_key,
      PASSPHRASE,
      [sender.public_key],
    );

    expect(a.plaintext).toBe("first");
    expect(b.plaintext).toBe("second");
    expect(a.verification).toBe("verified");
    expect(b.verification).toBe("verified");
    expect(read_key_calls.count).toBe(1);
  });

  it("still rejects a signature from a different key", async () => {
    const me = await make_key("me");
    const sender = await make_key("sender");
    const other = await make_key("other");
    const sealed = await seal("hello", me.public_key, sender.private_key);

    await decrypt_message_verified(sealed, me.private_key, PASSPHRASE, [
      sender.public_key,
    ]);
    const result = await decrypt_message_verified(
      sealed,
      me.private_key,
      PASSPHRASE,
      [other.public_key],
    );

    expect(result.verification).not.toBe("verified");
  });

  it("skips an unreadable key without caching the failure", async () => {
    const me = await make_key("me");
    const sender = await make_key("sender");
    const sealed = await seal("hello", me.public_key, sender.private_key);

    const result = await decrypt_message_verified(
      sealed,
      me.private_key,
      PASSPHRASE,
      ["not a key", sender.public_key],
    );

    await decrypt_message_verified(sealed, me.private_key, PASSPHRASE, [
      "not a key",
    ]);

    expect(result.verification).toBe("verified");
    expect(read_key_calls.count).toBe(3);
  });
});
