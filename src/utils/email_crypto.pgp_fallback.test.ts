import { describe, it, expect, vi, beforeEach } from "vitest";
import * as openpgp from "openpgp";

const vault_state: { vault: unknown; passphrase: string | null } = {
  vault: null,
  passphrase: null,
};

vi.mock("@/services/crypto/memory_key_store", () => ({
  get_vault_from_memory: () => vault_state.vault,
  get_passphrase_from_memory: () => vault_state.passphrase,
  get_passphrase_bytes: () => null,
}));

import {
  try_decrypt_pgp_body,
  PGP_UNDECRYPTABLE_SENTINEL,
} from "./email_crypto";

async function make_key(email: string, passphrase: string) {
  return openpgp.generateKey({
    type: "ecc",
    curve: "ed25519Legacy",
    userIDs: [{ name: email, email }],
    passphrase,
    format: "armored",
  });
}

async function encrypt_to(public_key_armored: string, text: string) {
  const message = await openpgp.createMessage({ text });
  const encryptionKeys = await openpgp.readKey({
    armoredKey: public_key_armored,
  });
  const encrypted = await openpgp.encrypt({
    message,
    encryptionKeys,
    format: "armored",
  });
  return encrypted as string;
}

describe("try_decrypt_pgp_body multi-key fallback", () => {
  const passphrase = "test-passphrase";

  beforeEach(() => {
    vault_state.vault = null;
    vault_state.passphrase = passphrase;
  });

  it("decrypts a message encrypted to the current identity_key", async () => {
    const key = await make_key("current@example.com", passphrase);
    const ciphertext = await encrypt_to(key.publicKey, "hello current");
    vault_state.vault = { identity_key: key.privateKey, previous_keys: [] };

    const result = await try_decrypt_pgp_body(ciphertext);
    expect(result).toBe("hello current");
  });

  it("decrypts a message encrypted to a key held only in previous_keys", async () => {
    const identity = await make_key("identity@example.com", passphrase);
    const published = await make_key("published@example.com", passphrase);
    const ciphertext = await encrypt_to(published.publicKey, "hello published");

    vault_state.vault = {
      identity_key: identity.privateKey,
      previous_keys: [published.privateKey],
    };

    const result = await try_decrypt_pgp_body(ciphertext);
    expect(result).toBe("hello published");
  });

  it("returns the sentinel when no held key matches", async () => {
    const identity = await make_key("identity@example.com", passphrase);
    const stranger = await make_key("stranger@example.com", passphrase);
    const ciphertext = await encrypt_to(stranger.publicKey, "secret");

    vault_state.vault = {
      identity_key: identity.privateKey,
      previous_keys: [],
    };

    const result = await try_decrypt_pgp_body(ciphertext);
    expect(result).toBe(PGP_UNDECRYPTABLE_SENTINEL);
  });
});
