//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
import type { EncryptedVault } from "./key_manager_core";

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as openpgp from "openpgp";

const push_vault_to_server = vi.fn();

vi.mock("../account_manager", () => ({
  get_current_account: async () => ({
    user: { id: "11111111-2222-4333-8444-555555555555" },
  }),
}));

vi.mock("./recovery_backup_refresh", () => ({
  refresh_recovery_backup: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./ensure_ratchet_keys", async (import_original) => {
  const original =
    await import_original<typeof import("./ensure_ratchet_keys")>();

  return {
    verify_vault_roundtrip: original.verify_vault_roundtrip,
    push_vault_to_server: (...args: unknown[]) => push_vault_to_server(...args),
  };
});

import { base64_to_array } from "./base64";
import {
  decrypt_envelope_with_identity_key,
  encrypt_envelope_with_identity_key,
} from "./envelope";
import { generate_identity_keypair } from "./key_manager_pgp_keygen";
import {
  MASTER_KEY_VAULT_FORMAT,
  STORAGE_KDF_VERSION_STRETCHED,
  store_vault_in_memory,
} from "./memory_key_store";
import { import_identity_key_file } from "./restore_inactive_keys";

const USER_ID = "11111111-2222-4333-8444-555555555555";
const OLD_PASSWORD = "Old-Export-Password-17!";
const NEW_PASSWORD = "Reset-Vault-Password-42!";
const SENT_COPY = { subject: "sent before the reset" };
const LONG_TEST = 120000;

let old_key: string;
let old_fingerprint: string;
let new_vault: EncryptedVault;
let pushed: EncryptedVault | null;

function base_vault(identity_key: string): EncryptedVault {
  return {
    identity_key,
    signed_prekey: "spk-public",
    signed_prekey_private: "spk-private",
    recovery_codes: [],
    previous_keys: [],
    vault_format: MASTER_KEY_VAULT_FORMAT,
    kdf_version: STORAGE_KDF_VERSION_STRETCHED,
    mk_created_at: new Date().toISOString(),
  };
}

async function fingerprint_of(armored: string): Promise<string> {
  return (await openpgp.readKey({ armoredKey: armored }))
    .getFingerprint()
    .toUpperCase();
}

async function opens_with(
  armored: string,
  passphrase: string,
): Promise<boolean> {
  try {
    await openpgp.decryptKey({
      privateKey: await openpgp.readPrivateKey({ armoredKey: armored }),
      passphrase,
    });

    return true;
  } catch {
    return false;
  }
}

async function sealed_with(identity_key: string) {
  const sealed = await encrypt_envelope_with_identity_key(
    SENT_COPY,
    identity_key,
  );

  return {
    bytes: base64_to_array(sealed.encrypted),
    nonce: base64_to_array(sealed.nonce),
  };
}

async function opens_sent_copy(
  materials: string[],
  sealed: { bytes: Uint8Array; nonce: Uint8Array },
): Promise<boolean> {
  for (const material of materials) {
    const opened = await decrypt_envelope_with_identity_key(
      material,
      sealed.bytes,
      sealed.nonce,
      (plaintext) => JSON.parse(new TextDecoder().decode(plaintext)),
    );

    if (opened?.subject === SENT_COPY.subject) return true;
  }

  return false;
}

beforeAll(async () => {
  const old_identity = await generate_identity_keypair(
    "keyfile",
    "keyfile@example.test",
    OLD_PASSWORD,
  );
  const new_identity = await generate_identity_keypair(
    "keyfile",
    "keyfile@example.test",
    NEW_PASSWORD,
  );

  old_key = old_identity.secret_key;
  old_fingerprint = await fingerprint_of(old_key);
  new_vault = base_vault(new_identity.secret_key);
}, 180000);

beforeEach(async () => {
  vi.clearAllMocks();
  pushed = null;

  await store_vault_in_memory(new_vault, NEW_PASSWORD, USER_ID);

  push_vault_to_server.mockImplementation(
    async (
      _encrypted: string,
      _nonce: string,
      user_id: string,
      _format: number,
      next_vault: EncryptedVault,
    ) => {
      if (user_id !== USER_ID) return false;

      pushed = next_vault;

      return true;
    },
  );
});

describe("import_identity_key_file", () => {
  it("rejects a file that is not a private key", async () => {
    const result = await import_identity_key_file(
      "-----BEGIN PGP PUBLIC KEY BLOCK-----\nabc\n",
      "",
    );

    expect(result.status).toBe("invalid");
    expect(push_vault_to_server).not.toHaveBeenCalled();
  });

  it("rejects an oversized file before parsing it", async () => {
    const result = await import_identity_key_file(
      old_key + " ".repeat(300 * 1024),
      "",
    );

    expect(result.status).toBe("invalid");
    expect(push_vault_to_server).not.toHaveBeenCalled();
  });

  it(
    "keeps the exact exported text so old sent copies open without a password",
    async () => {
      const sealed = await sealed_with(old_key);
      const result = await import_identity_key_file(old_key, "");

      expect(result).toEqual({ status: "imported", unlocked: false });
      expect(pushed).not.toBeNull();
      expect(pushed!.identity_key).toBe(new_vault.identity_key);
      expect(pushed!.legacy_identity_keys).toContain(old_key);
      expect(
        await opens_sent_copy(pushed!.legacy_identity_keys ?? [], sealed),
      ).toBe(true);
    },
    LONG_TEST,
  );

  it(
    "relocks the key with the current password when the export password is given",
    async () => {
      const result = await import_identity_key_file(old_key, OLD_PASSWORD);

      expect(result).toEqual({ status: "imported", unlocked: true });

      const relocked = [];

      for (const armored of pushed!.previous_keys ?? []) {
        if ((await fingerprint_of(armored)) === old_fingerprint) {
          relocked.push(armored);
        }
      }

      expect(relocked).toHaveLength(1);
      expect(await opens_with(relocked[0], NEW_PASSWORD)).toBe(true);
      expect(await opens_with(relocked[0], OLD_PASSWORD)).toBe(false);
      expect(pushed!.legacy_keks?.length ?? 0).toBeGreaterThan(0);
    },
    LONG_TEST,
  );

  it(
    "reports a wrong export password without writing the vault",
    async () => {
      const result = await import_identity_key_file(
        old_key,
        "Not-The-Password-1!",
      );

      expect(result.status).toBe("wrong_password");
      expect(push_vault_to_server).not.toHaveBeenCalled();
    },
    LONG_TEST,
  );

  it(
    "reports a key that is already on the account",
    async () => {
      await import_identity_key_file(old_key, "");
      await store_vault_in_memory(pushed!, NEW_PASSWORD, USER_ID);
      push_vault_to_server.mockClear();

      const result = await import_identity_key_file(old_key, "");

      expect(result.status).toBe("already_present");
      expect(push_vault_to_server).not.toHaveBeenCalled();
    },
    LONG_TEST,
  );

  it(
    "still opens sent copies when the file was saved with Windows line endings",
    async () => {
      const sealed = await sealed_with(old_key);
      const crlf = old_key.replace(/\n/g, "\r\n");
      const result = await import_identity_key_file(crlf, "");

      expect(result.status).toBe("imported");
      expect(pushed!.legacy_identity_keys).toContain(crlf);
      expect(
        await opens_sent_copy(pushed!.legacy_identity_keys ?? [], sealed),
      ).toBe(true);
    },
    LONG_TEST,
  );

  it(
    "fails without writing when the vault is full of older keys",
    async () => {
      const filler = Array.from({ length: 32 }, (_, i) => `legacy-${i}`);

      await store_vault_in_memory(
        { ...new_vault, legacy_identity_keys: filler },
        NEW_PASSWORD,
        USER_ID,
      );

      const result = await import_identity_key_file(old_key, "");

      expect(result.status).toBe("failed");
      expect(push_vault_to_server).not.toHaveBeenCalled();
    },
    LONG_TEST,
  );
});
