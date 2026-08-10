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
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import * as openpgp from "openpgp";

const PASSPHRASE = "correct-horse-battery-staple";
const PLAINTEXT = "the forwarded newsletter body";

let vault_identity_key = "";
let rotated_identity_key = "";

vi.mock("@/services/crypto/memory_key_store", () => ({
  get_vault_from_memory: vi.fn(() => ({
    identity_key: vault_identity_key,
    previous_keys: [] as string[],
  })),
  get_passphrase_from_memory: vi.fn(() => PASSPHRASE),
  get_passphrase_bytes: vi.fn(() => null),
  wait_for_keys_ready: vi.fn(async () => undefined),
}));

import {
  PGP_UNDECRYPTABLE_SENTINEL,
  resolve_inbound_pgp_body,
} from "./email_crypto";

const subtle = globalThis.crypto.subtle;
const real_unwrap_key = subtle.unwrapKey;
const real_import_key = subtle.importKey;

let ciphertext = "";
let ciphertext_for_rotated_key = "";
let ciphertext_for_stranger = "";

function break_unwrap_key(error_name: string): void {
  subtle.unwrapKey = () => {
    const error = new Error("operation failed");

    error.name = error_name;

    return Promise.reject(error);
  };
}

async function generate_key(
  email: string,
): Promise<{ privateKey: string; publicKey: string }> {
  return openpgp.generateKey({
    type: "ecc",
    curve: "ed25519Legacy",
    userIDs: [{ email }],
    passphrase: PASSPHRASE,
    format: "armored",
  });
}

async function encrypt_to(public_key: string): Promise<string> {
  const encrypted = await openpgp.encrypt({
    message: await openpgp.createMessage({ text: PLAINTEXT }),
    encryptionKeys: await openpgp.readKey({ armoredKey: public_key }),
    format: "armored",
  });

  return encrypted.toString();
}

beforeAll(async () => {
  const mine = await generate_key("me@astermail.org");
  const rotated = await generate_key("me-rotated@astermail.org");
  const stranger = await generate_key("stranger@example.com");

  vault_identity_key = mine.privateKey;
  rotated_identity_key = rotated.privateKey;
  ciphertext = await encrypt_to(mine.publicKey);
  ciphertext_for_rotated_key = await encrypt_to(rotated.publicKey);
  ciphertext_for_stranger = await encrypt_to(stranger.publicKey);
}, 60000);

afterEach(() => {
  subtle.unwrapKey = real_unwrap_key;
  subtle.importKey = real_import_key;
});

describe("inbound pgp mail on a runtime without usable aes-kw", () => {
  it("renders the message when webcrypto is healthy", async () => {
    const resolved = await resolve_inbound_pgp_body(ciphertext);

    expect(resolved.decrypted).toBe(true);
    expect(resolved.body).toContain(PLAINTEXT);
  });

  it("renders the message when unwrapKey reports OperationError", async () => {
    break_unwrap_key("OperationError");

    const resolved = await resolve_inbound_pgp_body(ciphertext);

    expect(resolved.decrypted).toBe(true);
    expect(resolved.body).toContain(PLAINTEXT);
  });

  it("renders the message when unwrapKey reports NotSupportedError", async () => {
    break_unwrap_key("NotSupportedError");

    const resolved = await resolve_inbound_pgp_body(ciphertext);

    expect(resolved.decrypted).toBe(true);
    expect(resolved.body).toContain(PLAINTEXT);
  });

  it("renders a message addressed to a rotated key while aes-kw is broken", async () => {
    const original = vault_identity_key;

    vault_identity_key = rotated_identity_key;
    break_unwrap_key("OperationError");

    try {
      const resolved = await resolve_inbound_pgp_body(
        ciphertext_for_rotated_key,
      );

      expect(resolved.decrypted).toBe(true);
      expect(resolved.body).toContain(PLAINTEXT);
    } finally {
      vault_identity_key = original;
    }
  });

  it("still reports a message for another recipient as undecryptable", async () => {
    break_unwrap_key("OperationError");

    const resolved = await resolve_inbound_pgp_body(ciphertext_for_stranger);

    expect(resolved.decrypted).toBe(false);
    expect(resolved.body).toBe(PGP_UNDECRYPTABLE_SENTINEL);
  });

  it("decrypts concurrent messages while aes-kw is broken", async () => {
    break_unwrap_key("OperationError");

    const results = await Promise.all(
      Array.from({ length: 8 }, () => resolve_inbound_pgp_body(ciphertext)),
    );

    for (const resolved of results) {
      expect(resolved.decrypted).toBe(true);
      expect(resolved.body).toContain(PLAINTEXT);
    }

    expect(subtle.importKey).toBe(real_import_key);
  });
});
