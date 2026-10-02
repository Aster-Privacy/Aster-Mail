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
import type { EncryptedVault, RatchetKeySet } from "./key_manager_core";
import type { RecoveryShareData, VaultBackup } from "./recovery_key";

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as openpgp from "openpgp";

const list_inactive_key_sets = vi.fn();
const fetch_inactive_key_set = vi.fn();
const unlock_inactive_key_sets_with_code = vi.fn();
const consume_inactive_key_set = vi.fn();
const save_recovery_backup = vi.fn();
const push_vault_to_server = vi.fn();

vi.mock("../api/recovery", () => ({
  list_inactive_key_sets: () => list_inactive_key_sets(),
  fetch_inactive_key_set: (id: string) => fetch_inactive_key_set(id),
  unlock_inactive_key_sets_with_code: (code_hash: string) =>
    unlock_inactive_key_sets_with_code(code_hash),
  consume_inactive_key_set: (id: string) => consume_inactive_key_set(id),
  save_recovery_backup: (
    encrypted_data: string,
    nonce: string,
    salt: string,
    shares: RecoveryShareData[],
  ) => save_recovery_backup(encrypted_data, nonce, salt, shares),
}));

vi.mock("../account_manager", () => ({
  get_current_account: async () => ({
    user: { id: "11111111-2222-4333-8444-555555555555" },
  }),
}));

vi.mock("./account_key_loader", () => ({
  load_account_keys_for_session: vi.fn().mockResolvedValue(0),
}));

vi.mock("./ensure_ratchet_keys", async (import_original) => {
  const original =
    await import_original<typeof import("./ensure_ratchet_keys")>();

  return {
    verify_vault_roundtrip: original.verify_vault_roundtrip,
    push_vault_to_server: (...args: unknown[]) => push_vault_to_server(...args),
  };
});

import { build_backup_vault } from "./backup_unlocked_keys";
import { array_to_base64, base64_to_array } from "./base64";
import { decrypt_vault, encrypt_vault } from "./key_manager";
import { generate_identity_keypair } from "./key_manager_pgp_keygen";
import {
  MASTER_KEY_VAULT_FORMAT,
  STORAGE_KDF_VERSION_STRETCHED,
  derive_encryption_key_from_passphrase,
  get_vault_from_memory,
  store_vault_in_memory,
} from "./memory_key_store";
import { generate_ratchet_keys } from "./ratchet_keys";
import {
  decrypt_recovery_key_with_code,
  decrypt_vault_backup,
  encrypt_vault_backup,
  generate_recovery_key,
  generate_recovery_share_data,
  hash_recovery_code,
} from "./recovery_key";
import {
  restore_inactive_key_sets,
  restore_inactive_key_sets_with_code,
} from "./restore_inactive_keys";

const USER_ID = "11111111-2222-4333-8444-555555555555";
const OLD_PASSWORD = "Old-Vault-Password-17!";
const NEW_PASSWORD = "Reset-Vault-Password-42!";
const OLD_CODE = "ASTER-2K4M-7P9Q-3R5T-8V2W";
const NEW_CODE = "ASTER-9X3Y-5Z7A-2B4C-6D8E";
const WRONG_CODE = "ASTER-1111-2222-3333-4444";
const ARCHIVE_ID = "archive-1";
const SAMPLE_MAIL = "subject: budget\nbody: the plan survives the reset";
const SAMPLE_FOLDER = "folder: receipts";
const LONG_TEST = { timeout: 120000 };

interface Sealed {
  ciphertext: Uint8Array;
  nonce: Uint8Array;
}

interface Fixture {
  old_vault: EncryptedVault;
  old_fingerprint: string;
  old_encrypted_vault: string;
  old_vault_nonce: string;
  old_backup: VaultBackup;
  old_share: RecoveryShareData;
  mail_by_data_kek: Sealed;
  folder_by_password_key: Sealed;
  new_vault: EncryptedVault;
}

async function aes_key(raw: Uint8Array, usage: KeyUsage): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, [
    usage,
  ]);
}

async function seal(raw: Uint8Array, plaintext: string): Promise<Sealed> {
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    await aes_key(raw, "encrypt"),
    new TextEncoder().encode(plaintext),
  );

  return { ciphertext: new Uint8Array(ciphertext), nonce };
}

async function open_with_any(
  keys: Uint8Array[],
  sealed: Sealed,
): Promise<string | null> {
  for (const raw of keys) {
    try {
      const plaintext = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: sealed.nonce },
        await aes_key(raw, "decrypt"),
        sealed.ciphertext,
      );

      return new TextDecoder().decode(plaintext);
    } catch {
      continue;
    }
  }

  return null;
}

async function ratchet_set(): Promise<RatchetKeySet> {
  const generated = await generate_ratchet_keys();

  if (!generated) throw new Error("ratchet key generation failed");

  return {
    ratchet_identity_key: generated.identity_jwk,
    ratchet_identity_public: generated.identity_public,
    ratchet_signed_prekey: generated.signed_prekey_jwk,
    ratchet_signed_prekey_public: generated.signed_prekey_public,
    ratchet_pq_identity_key: generated.pq_identity_secret,
    ratchet_pq_identity_public: generated.pq_identity_public,
    ratchet_pq_identity_seed: generated.pq_identity_seed,
  };
}

async function make_vault(
  password: string,
  code: string,
): Promise<{ vault: EncryptedVault; fingerprint: string }> {
  const identity = await generate_identity_keypair(
    "roundtrip",
    "roundtrip@example.test",
    password,
  );
  const ratchet = await ratchet_set();
  const vault: EncryptedVault = {
    identity_key: identity.secret_key,
    signed_prekey: "spk-public",
    signed_prekey_private: "spk-private",
    recovery_codes: [code],
    previous_keys: [],
    vault_format: MASTER_KEY_VAULT_FORMAT,
    kdf_version: STORAGE_KDF_VERSION_STRETCHED,
    data_kek: array_to_base64(crypto.getRandomValues(new Uint8Array(32))),
    mk_created_at: new Date().toISOString(),
    ...ratchet,
  };

  return { vault, fingerprint: await fingerprint_of(identity.secret_key) };
}

async function fingerprint_of(armored: string): Promise<string> {
  return (
    await openpgp.readPrivateKey({ armoredKey: armored })
  ).getFingerprint();
}

async function opens_with(
  armored: string,
  passphrase: string,
): Promise<boolean> {
  const key = await openpgp.readPrivateKey({ armoredKey: armored });

  try {
    await openpgp.decryptKey({ privateKey: key, passphrase });

    return true;
  } catch {
    return false;
  }
}

function vault_keks(vault: EncryptedVault): Uint8Array[] {
  return (vault.legacy_keks ?? []).map((entry) => base64_to_array(entry.k));
}

function unlock_response(share: RecoveryShareData, backup: VaultBackup) {
  return {
    data: {
      key_sets: [
        {
          inactive_vault_id: ARCHIVE_ID,
          encrypted_vault_backup: backup.encrypted_data,
          vault_backup_nonce: backup.nonce,
          recovery_key_salt: backup.salt,
          encrypted_recovery_key: share.encrypted_recovery_key,
          recovery_key_nonce: share.recovery_key_nonce,
          code_salt: share.code_salt,
        },
      ],
    },
  };
}

let fixture: Fixture;
let pushed: { encrypted_vault: string; vault_nonce: string } | null;

async function pushed_vault(): Promise<EncryptedVault> {
  if (!pushed) throw new Error("no vault was pushed");

  return decrypt_vault(
    pushed.encrypted_vault,
    pushed.vault_nonce,
    NEW_PASSWORD,
  );
}

async function saved_backup_opened_with(code: string): Promise<EncryptedVault> {
  const [encrypted_data, nonce, salt, shares] = save_recovery_backup.mock
    .calls[0] as [string, string, string, RecoveryShareData[]];
  const code_hash = await hash_recovery_code(code);
  const share = shares.find((candidate) => candidate.code_hash === code_hash);

  if (!share) throw new Error("no share for the code");

  const recovery_key = await decrypt_recovery_key_with_code(
    {
      encrypted_key: share.encrypted_recovery_key,
      nonce: share.recovery_key_nonce,
      salt: share.code_salt,
    },
    code,
  );

  return decrypt_vault_backup({ encrypted_data, nonce, salt }, recovery_key);
}

beforeAll(async () => {
  const old = await make_vault(OLD_PASSWORD, OLD_CODE);
  const fresh = await make_vault(NEW_PASSWORD, NEW_CODE);
  const old_data_kek = base64_to_array(old.vault.data_kek as string);
  const password_key = await derive_encryption_key_from_passphrase(
    new TextEncoder().encode(OLD_PASSWORD),
    STORAGE_KDF_VERSION_STRETCHED,
  );
  const encrypted = await encrypt_vault(old.vault, OLD_PASSWORD);
  const recovery_key = generate_recovery_key();
  const old_backup = await encrypt_vault_backup(
    await build_backup_vault(old.vault, OLD_PASSWORD),
    recovery_key,
  );
  const old_share = await generate_recovery_share_data(OLD_CODE, recovery_key);

  fixture = {
    old_vault: old.vault,
    old_fingerprint: old.fingerprint,
    old_encrypted_vault: encrypted.encrypted_vault,
    old_vault_nonce: encrypted.vault_nonce,
    old_backup,
    old_share,
    mail_by_data_kek: await seal(old_data_kek, SAMPLE_MAIL),
    folder_by_password_key: await seal(password_key, SAMPLE_FOLDER),
    new_vault: fresh.vault,
  };
}, 180000);

beforeEach(async () => {
  vi.clearAllMocks();
  pushed = null;

  await store_vault_in_memory(fixture.new_vault, NEW_PASSWORD, USER_ID);

  push_vault_to_server.mockImplementation(
    async (encrypted_vault: string, vault_nonce: string, user_id: string) => {
      if (user_id !== USER_ID) return false;

      pushed = { encrypted_vault, vault_nonce };

      return true;
    },
  );
  consume_inactive_key_set.mockResolvedValue({ data: { success: true } });
  save_recovery_backup.mockResolvedValue({ data: { success: true } });
  list_inactive_key_sets.mockResolvedValue({
    data: {
      inactive_key_sets: [
        {
          id: ARCHIVE_ID,
          vault_version: MASTER_KEY_VAULT_FORMAT,
          retired_reason: "password_reset",
          retired_at: new Date().toISOString(),
        },
      ],
    },
  });
  fetch_inactive_key_set.mockResolvedValue({
    data: {
      encrypted_vault: fixture.old_encrypted_vault,
      vault_nonce: fixture.old_vault_nonce,
      vault_version: MASTER_KEY_VAULT_FORMAT,
    },
  });
  unlock_inactive_key_sets_with_code.mockImplementation(
    async (code_hash: string) =>
      code_hash === fixture.old_share.code_hash
        ? unlock_response(fixture.old_share, fixture.old_backup)
        : { data: { key_sets: [] } },
  );
});

describe("archived vault fixture", () => {
  it("opens with the old password only", async () => {
    const opened = await decrypt_vault(
      fixture.old_encrypted_vault,
      fixture.old_vault_nonce,
      OLD_PASSWORD,
    );

    expect(opened.data_kek).toBe(fixture.old_vault.data_kek);
    expect("unlocked_keys" in opened).toBe(false);
    await expect(
      decrypt_vault(
        fixture.old_encrypted_vault,
        fixture.old_vault_nonce,
        NEW_PASSWORD,
      ),
    ).rejects.toThrow();
  });

  it("cannot be read with the new vault keys", async () => {
    const new_keys = [
      base64_to_array(fixture.new_vault.data_kek as string),
      ...vault_keks(fixture.new_vault),
    ];

    expect(await open_with_any(new_keys, fixture.mail_by_data_kek)).toBeNull();
    expect(
      await open_with_any(new_keys, fixture.folder_by_password_key),
    ).toBeNull();
  });
});

describe("restore with the old recovery code", () => {
  it("recovers the data key and the identity key", LONG_TEST, async () => {
    const result = await restore_inactive_key_sets_with_code(OLD_CODE);

    expect(result).toEqual({ restored: 1, incomplete: 0 });

    const vault = await pushed_vault();

    expect(vault.identity_key).toBe(fixture.new_vault.identity_key);
    expect(vault.data_kek).toBe(fixture.new_vault.data_kek);
    expect(
      await open_with_any(vault_keks(vault), fixture.mail_by_data_kek),
    ).toBe(SAMPLE_MAIL);

    const previous = vault.previous_keys ?? [];

    expect(previous).toHaveLength(1);
    expect(await fingerprint_of(previous[0])).toBe(fixture.old_fingerprint);
    expect(await opens_with(previous[0], NEW_PASSWORD)).toBe(true);
    expect(await opens_with(previous[0], OLD_PASSWORD)).toBe(false);
    expect(
      vault.ratchet_previous_keys?.map((set) => set.ratchet_identity_public),
    ).toEqual([fixture.old_vault.ratchet_identity_public]);
    expect(vault.ratchet_identity_public).toBe(
      fixture.new_vault.ratchet_identity_public,
    );
    expect("unlocked_keys" in vault).toBe(false);
    expect(consume_inactive_key_set).toHaveBeenCalledWith(ARCHIVE_ID);
  });

  it(
    "leaves the password-derived folder key unrecovered",
    LONG_TEST,
    async () => {
      await restore_inactive_key_sets_with_code(OLD_CODE);

      const vault = await pushed_vault();

      expect(
        await open_with_any(vault_keks(vault), fixture.folder_by_password_key),
      ).toBeNull();
    },
  );

  it(
    "updates the in-memory vault and the recovery backup",
    LONG_TEST,
    async () => {
      await restore_inactive_key_sets_with_code(OLD_CODE);

      const in_memory = get_vault_from_memory();

      expect(in_memory?.previous_keys).toHaveLength(1);
      expect(in_memory?.legacy_keks).toHaveLength(1);
      expect(save_recovery_backup).toHaveBeenCalledTimes(1);

      const backup = await saved_backup_opened_with(NEW_CODE);

      expect(backup.identity_key).toBe(fixture.new_vault.identity_key);
      expect(backup.previous_keys).toHaveLength(1);
      expect(
        await open_with_any(vault_keks(backup), fixture.mail_by_data_kek),
      ).toBe(SAMPLE_MAIL);
      expect(
        Array.isArray((backup as { unlocked_keys?: unknown }).unlocked_keys),
      ).toBe(true);
    },
  );

  it("recovers nothing with a wrong code", async () => {
    const result = await restore_inactive_key_sets_with_code(WRONG_CODE);

    expect(result).toEqual({ restored: 0, incomplete: 0 });
    expect(pushed).toBeNull();
    expect(consume_inactive_key_set).not.toHaveBeenCalled();
    expect(save_recovery_backup).not.toHaveBeenCalled();
  });

  it("recovers nothing when the share reaches a wrong code", async () => {
    unlock_inactive_key_sets_with_code.mockImplementation(async () =>
      unlock_response(fixture.old_share, fixture.old_backup),
    );

    const result = await restore_inactive_key_sets_with_code(WRONG_CODE);

    expect(result).toEqual({ restored: 0, incomplete: 0 });
    expect(pushed).toBeNull();
    expect(consume_inactive_key_set).not.toHaveBeenCalled();
  });

  it(
    "keeps the archive when the server rejects the vault",
    LONG_TEST,
    async () => {
      push_vault_to_server.mockResolvedValue(false);

      const result = await restore_inactive_key_sets_with_code(OLD_CODE);

      expect(result).toEqual({ restored: 0, incomplete: 1 });
      expect(consume_inactive_key_set).not.toHaveBeenCalled();
      expect(save_recovery_backup).not.toHaveBeenCalled();
      expect(get_vault_from_memory()?.previous_keys).toEqual([]);
    },
  );
});

describe("restore with the old password", () => {
  it(
    "recovers the data key and the password-derived key",
    LONG_TEST,
    async () => {
      const result = await restore_inactive_key_sets(OLD_PASSWORD);

      expect(result).toEqual({
        restored: 1,
        incomplete: 0,
        wrong_password: false,
      });

      const vault = await pushed_vault();
      const keks = vault_keks(vault);

      expect(await open_with_any(keks, fixture.mail_by_data_kek)).toBe(
        SAMPLE_MAIL,
      );
      expect(await open_with_any(keks, fixture.folder_by_password_key)).toBe(
        SAMPLE_FOLDER,
      );

      const previous = vault.previous_keys ?? [];

      expect(previous).toHaveLength(1);
      expect(await fingerprint_of(previous[0])).toBe(fixture.old_fingerprint);
      expect(await opens_with(previous[0], NEW_PASSWORD)).toBe(true);
      expect(await opens_with(previous[0], OLD_PASSWORD)).toBe(false);
      expect(
        vault.ratchet_previous_keys?.map((set) => set.ratchet_identity_public),
      ).toEqual([fixture.old_vault.ratchet_identity_public]);
      expect(consume_inactive_key_set).toHaveBeenCalledWith(ARCHIVE_ID);
      expect(save_recovery_backup).toHaveBeenCalledTimes(1);
    },
  );

  it("reports a wrong password and changes nothing", async () => {
    const result = await restore_inactive_key_sets(NEW_PASSWORD);

    expect(result).toEqual({
      restored: 0,
      incomplete: 0,
      wrong_password: true,
    });
    expect(pushed).toBeNull();
    expect(consume_inactive_key_set).not.toHaveBeenCalled();
    expect(get_vault_from_memory()?.previous_keys).toEqual([]);
  });

  it("restoring twice does not duplicate keys", LONG_TEST, async () => {
    await restore_inactive_key_sets_with_code(OLD_CODE);

    const first = await pushed_vault();

    await store_vault_in_memory(first, NEW_PASSWORD, USER_ID);
    pushed = null;

    const result = await restore_inactive_key_sets(OLD_PASSWORD);

    expect(result.restored).toBe(1);

    const second = await pushed_vault();

    expect(second.previous_keys).toHaveLength(1);
    expect(second.ratchet_previous_keys).toHaveLength(1);
    expect(
      new Set((second.legacy_keks ?? []).map((entry) => entry.k)).size,
    ).toBe(second.legacy_keks?.length);
  });
});
