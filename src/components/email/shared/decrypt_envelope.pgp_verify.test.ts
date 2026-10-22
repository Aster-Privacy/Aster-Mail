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
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import * as openpgp from "openpgp";

const h = vi.hoisted(() => ({
  vault: null as unknown,
  passphrase: "pgp verify passphrase" as string | null,
  sender_keys: new Map<string, string>(),
}));

vi.mock("@/services/crypto/memory_key_store", () => ({
  get_vault_from_memory: () => h.vault,
  get_passphrase_from_memory: () => h.passphrase,
  get_passphrase_bytes: () => new Uint8Array(32).fill(1),
  has_vault_in_memory: () => h.vault !== null,
  wait_for_keys_ready: vi.fn(async () => {}),
  store_vault_in_memory: vi.fn(async () => {}),
}));

vi.mock("@/services/api/client", () => ({
  api_client: {
    get: vi.fn(async () => ({ code: "NOT_FOUND" })),
    put: vi.fn(async () => ({ data: {} })),
    post: vi.fn(async () => ({ data: {} })),
    delete: vi.fn(async () => ({})),
  },
}));

vi.mock("@/services/api/keys", async (import_original) => ({
  ...(await import_original<Record<string, unknown>>()),
  get_recipient_public_key: vi.fn(async (_username: string, email: string) => ({
    data: { public_key: h.sender_keys.get(email) ?? "" },
  })),
}));

vi.mock("@/services/account_manager", async (import_original) => ({
  ...(await import_original<Record<string, unknown>>()),
  get_current_account: vi.fn(async () => ({ user: { id: "user-1" } })),
}));

import { decrypt_mail_envelope } from "@/components/email/shared/decrypt_envelope";
import { array_to_base64 } from "@/services/crypto/envelope";

const PASSPHRASE = "pgp verify passphrase";

interface TestKey {
  private_key: string;
  public_key: string;
}

let own_key: TestKey;
let other_key: TestKey;
let sender_counter = 0;

async function generate(): Promise<TestKey> {
  const { privateKey, publicKey } = await openpgp.generateKey({
    type: "ecc",
    curve: "curve25519Legacy",
    userIDs: [{ email: "owner@astermail.org" }],
    passphrase: PASSPHRASE,
    format: "armored",
  });

  return { private_key: privateKey, public_key: publicKey };
}

async function unlock(key: TestKey): Promise<openpgp.PrivateKey> {
  return openpgp.decryptKey({
    privateKey: await openpgp.readPrivateKey({ armoredKey: key.private_key }),
    passphrase: PASSPHRASE,
  });
}

function next_sender(published_key: string | null): string {
  sender_counter++;
  const email = `sender${sender_counter}@astermail.org`;

  if (published_key !== null) h.sender_keys.set(email, published_key);

  return email;
}

function envelope_for(email: string) {
  return JSON.stringify({
    version: 1,
    subject: "Signed copy",
    body_text: "Body text",
    body_html: "<p>Body text</p>",
    from: { name: "", email },
    to: [{ name: "", email: "friend@example.com" }],
    cc: [],
    bcc: [],
    sent_at: "2026-09-19T10:00:00.000Z",
  });
}

async function encrypt_to_own(
  text: string,
  signer: TestKey | null,
): Promise<string> {
  return (await openpgp.encrypt({
    message: await openpgp.createMessage({ text }),
    encryptionKeys: await openpgp.readKey({ armoredKey: own_key.public_key }),
    signingKeys: signer ? await unlock(signer) : undefined,
    format: "armored",
  })) as string;
}

async function open(armored: string) {
  return decrypt_mail_envelope<{
    subject?: string;
    sender_verification?: string;
  }>(array_to_base64(new TextEncoder().encode(armored)), "");
}

beforeAll(async () => {
  own_key = await generate();
  other_key = await generate();
}, 30000);

beforeEach(() => {
  h.vault = {
    identity_key: own_key.private_key,
    previous_keys: [],
    signed_prekey: "",
    signed_prekey_private: "",
    recovery_codes: [],
  };
  h.passphrase = PASSPHRASE;
  vi.restoreAllMocks();
});

describe("decrypt_mail_envelope pgp signature verification", () => {
  it("verifies a copy signed by the sender's published key", async () => {
    const email = next_sender(own_key.public_key);
    const opened = await open(
      await encrypt_to_own(envelope_for(email), own_key),
    );

    expect(opened?.subject).toBe("Signed copy");
    expect(opened?.sender_verification).toBe("verified");
  });

  it("flags a copy signed by a key other than the published one", async () => {
    const email = next_sender(own_key.public_key);
    const opened = await open(
      await encrypt_to_own(envelope_for(email), other_key),
    );

    expect(opened?.subject).toBe("Signed copy");
    expect(opened?.sender_verification).toBe("invalid");
  });

  it("verifies a compressed signed copy", async () => {
    const email = next_sender(own_key.public_key);
    const armored = (await openpgp.encrypt({
      message: await openpgp.createMessage({ text: envelope_for(email) }),
      encryptionKeys: await openpgp.readKey({
        armoredKey: own_key.public_key,
      }),
      signingKeys: await unlock(own_key),
      config: {
        preferredCompressionAlgorithm: openpgp.enums.compression.zlib,
      },
      format: "armored",
    })) as string;
    const opened = await open(armored);

    expect(opened?.subject).toBe("Signed copy");
    expect(opened?.sender_verification).toBe("verified");
  });

  it("verifies a binary signature over line-broken data", async () => {
    const email = next_sender(own_key.public_key);
    const body = JSON.stringify(JSON.parse(envelope_for(email)), null, 2)
      .split("\n")
      .join(String.fromCharCode(13, 10));
    const armored = (await openpgp.encrypt({
      message: await openpgp.createMessage({
        binary: new TextEncoder().encode(body),
      }),
      encryptionKeys: await openpgp.readKey({
        armoredKey: own_key.public_key,
      }),
      signingKeys: await unlock(own_key),
      format: "armored",
    })) as string;
    const opened = await open(armored);

    expect(opened?.subject).toBe("Signed copy");
    expect(opened?.sender_verification).toBe("verified");
  });

  it("reports an unsigned copy as unsigned", async () => {
    const email = next_sender(own_key.public_key);
    const opened = await open(await encrypt_to_own(envelope_for(email), null));

    expect(opened?.subject).toBe("Signed copy");
    expect(opened?.sender_verification).toBe("unsigned");
  });

  it("reports no_keys when the sender has no published key", async () => {
    const email = next_sender(null);
    const opened = await open(
      await encrypt_to_own(envelope_for(email), own_key),
    );

    expect(opened?.subject).toBe("Signed copy");
    expect(opened?.sender_verification).toBe("no_keys");
  });

  it("reports no_keys when the published key cannot be parsed", async () => {
    const email = next_sender("not a pgp key");
    const opened = await open(
      await encrypt_to_own(envelope_for(email), own_key),
    );

    expect(opened?.subject).toBe("Signed copy");
    expect(opened?.sender_verification).toBe("no_keys");
  });

  it("reports no_keys for an external sender", async () => {
    const opened = await open(
      await encrypt_to_own(envelope_for("someone@example.com"), own_key),
    );

    expect(opened?.sender_verification).toBe("no_keys");
  });

  it("flags a signature from a revoked key", async () => {
    const { publicKey: revoked } = await openpgp.revokeKey({
      key: await unlock(own_key),
      format: "armored",
    });
    const email = next_sender(revoked);
    const opened = await open(
      await encrypt_to_own(envelope_for(email), own_key),
    );

    expect(opened?.subject).toBe("Signed copy");
    expect(opened?.sender_verification).toBe("invalid");
  });

  it("treats signatures from an expired key by its validity at signing time", async () => {
    const created = new Date("2020-01-01T00:00:00.000Z");
    const { privateKey, publicKey } = await openpgp.generateKey({
      type: "ecc",
      curve: "curve25519Legacy",
      userIDs: [{ email: "owner@astermail.org" }],
      date: created,
      keyExpirationTime: 86400,
      format: "object",
    });
    const encrypt_signed_at = async (email: string, date: Date) => {
      const signed = await openpgp.sign({
        message: await openpgp.createMessage({ text: envelope_for(email) }),
        signingKeys: privateKey,
        date,
        format: "object",
      });

      return (await openpgp.encrypt({
        message: signed,
        encryptionKeys: await openpgp.readKey({
          armoredKey: own_key.public_key,
        }),
        format: "armored",
      })) as string;
    };
    const in_window = next_sender(publicKey.armor());
    const opened = await open(
      await encrypt_signed_at(in_window, new Date("2020-01-01T06:00:00.000Z")),
    );

    expect(opened?.sender_verification).toBe("verified");
  });

  it("flags a signature made over a different message", async () => {
    const email = next_sender(own_key.public_key);
    const signed = await openpgp.sign({
      message: await openpgp.createMessage({ text: envelope_for(email) }),
      signingKeys: await unlock(own_key),
      format: "object",
    });
    const swapped = await openpgp.createMessage({
      text: envelope_for(email).replace("Signed copy", "Swapped copy"),
    });
    const packets = new openpgp.PacketList<openpgp.AnyPacket>();

    for (const packet of signed.packets) {
      packets.push(
        packet instanceof openpgp.LiteralDataPacket
          ? swapped.packets[0]
          : packet,
      );
    }

    const armored = (await openpgp.encrypt({
      message: new openpgp.Message(packets),
      encryptionKeys: await openpgp.readKey({
        armoredKey: own_key.public_key,
      }),
      format: "armored",
    })) as string;
    const opened = await open(armored);

    expect(opened?.subject).toBe("Swapped copy");
    expect(opened?.sender_verification).toBe("invalid");
  });

  it("returns null for a tampered ciphertext", async () => {
    const email = next_sender(own_key.public_key);
    const armored = await encrypt_to_own(envelope_for(email), own_key);
    const lines = armored.split("\n");
    let index = lines.findIndex((line) => line.startsWith("-----END")) - 1;

    if (lines[index].startsWith("=")) index--;

    const line = lines[index];

    lines[index] =
      line.slice(0, 2) + (line[2] === "A" ? "B" : "A") + line.slice(3);

    await expect(
      openpgp.decrypt({
        message: await openpgp.readMessage({
          armoredMessage: lines.join("\n"),
        }),
        decryptionKeys: await unlock(own_key),
      }),
    ).rejects.toThrow("Modification detected");

    const opened = await open(lines.join("\n"));

    expect(opened).toBeNull();
  });

  it("decrypts a signed copy once while verifying it", async () => {
    const email = next_sender(own_key.public_key);
    const armored = await encrypt_to_own(envelope_for(email), own_key);
    const decrypt_spy = vi.spyOn(openpgp.Message.prototype, "decrypt");
    const opened = await open(armored);

    expect(opened?.sender_verification).toBe("verified");
    expect(decrypt_spy).toHaveBeenCalledTimes(1);
  });
});
