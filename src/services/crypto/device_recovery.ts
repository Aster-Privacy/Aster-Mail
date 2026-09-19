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
import type { EncryptedVault, RatchetKeySet } from "./key_manager_core";
import type { DeviceSnapshotRecord } from "./device_recovery_store";

import { get_account_key_capabilities } from "../api/account_key";
import {
  consume_inactive_key_set,
  delete_device_recovery_secrets,
  fetch_device_recovery_secrets,
  fetch_inactive_key_set,
  list_inactive_key_sets,
  put_device_recovery_secret,
} from "../api/recovery";

import { array_to_base64, base64_to_array } from "./base64";
import {
  delete_device_snapshots,
  list_device_snapshots,
  load_device_recovery_key,
  save_device_snapshot,
} from "./device_recovery_store";
import { merge_identity_keys_with } from "./identity_key_materials";
import { decrypt_vault } from "./key_manager";
import { retain_previous_ratchet_keys } from "./key_manager_core";
import { lock_unlocked_pgp_key } from "./key_manager_pgp_keygen";
import { unlock_private_key } from "./key_manager_pgp_unlocked_cache";
import {
  get_passphrase_from_memory,
  get_vault_from_memory,
} from "./memory_key_store";
import {
  commit_recovered_keys,
  harvest_storage_keys,
} from "./restore_inactive_keys";
import { zero_uint8_array } from "./secure_memory";
import { with_vault_write_lock } from "./vault_write_lock";

const SNAPSHOT_VERSION = 1;
const SECRET_LENGTH = 32;
const IV_LENGTH = 12;
const HKDF_INFO = "aster-device-recovery-v1";
const MAX_SECRETS_PER_REQUEST = 16;
const RECENT_SNAPSHOTS_KEPT = 2;

export interface DeviceSnapshotPayload {
  v: number;
  identity_key: string;
  previous_keys: string[];
  legacy_identity_keys: string[];
  unlocked_keys: [string, string][];
  storage_keys: string[];
  ratchet_keys: RatchetKeySet[];
}

function snapshot_aad(
  user_id: string,
  snapshot_id: string,
  source_hash: string,
): Uint8Array {
  return new TextEncoder().encode(
    `${HKDF_INFO}|${user_id}|${snapshot_id}|${source_hash}`,
  );
}

async function derive_inner_key(
  secret: Uint8Array,
  snapshot_id: string,
): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey("raw", secret, "HKDF", false, [
    "deriveKey",
  ]);

  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new TextEncoder().encode(snapshot_id),
      info: new TextEncoder().encode(HKDF_INFO),
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function vault_ciphertext_hash(
  encrypted_vault: string,
): Promise<string> {
  const bytes = base64_to_array(encrypted_vault);
  const digest = await crypto.subtle.digest("SHA-256", bytes);

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function seal_device_snapshot(
  payload: DeviceSnapshotPayload,
  secret: Uint8Array,
  device_key: CryptoKey,
  meta: { user_id: string; snapshot_id: string; source_hash: string },
): Promise<{ iv: Uint8Array; sealed: ArrayBuffer }> {
  const aad = snapshot_aad(meta.user_id, meta.snapshot_id, meta.source_hash);
  const inner_key = await derive_inner_key(secret, meta.snapshot_id);
  const plaintext = new TextEncoder().encode(JSON.stringify(payload));
  const inner_iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

  try {
    const inner = new Uint8Array(
      await crypto.subtle.encrypt(
        { name: "AES-GCM", iv: inner_iv, additionalData: aad },
        inner_key,
        plaintext,
      ),
    );
    const combined = new Uint8Array(IV_LENGTH + inner.length);

    combined.set(inner_iv, 0);
    combined.set(inner, IV_LENGTH);

    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
    const sealed = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, additionalData: aad },
      device_key,
      combined,
    );

    return { iv, sealed };
  } finally {
    zero_uint8_array(plaintext);
  }
}

function is_string_array(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

function is_payload(value: unknown): value is DeviceSnapshotPayload {
  if (typeof value !== "object" || value === null) return false;
  const payload = value as Record<string, unknown>;

  return (
    payload.v === SNAPSHOT_VERSION &&
    typeof payload.identity_key === "string" &&
    is_string_array(payload.previous_keys) &&
    is_string_array(payload.legacy_identity_keys) &&
    Array.isArray(payload.unlocked_keys) &&
    payload.unlocked_keys.every(
      (pair) =>
        Array.isArray(pair) &&
        pair.length === 2 &&
        typeof pair[0] === "string" &&
        typeof pair[1] === "string",
    ) &&
    is_string_array(payload.storage_keys) &&
    Array.isArray(payload.ratchet_keys) &&
    payload.ratchet_keys.every(
      (set) =>
        typeof set === "object" &&
        set !== null &&
        typeof (set as RatchetKeySet).ratchet_identity_public === "string",
    )
  );
}

export async function open_device_snapshot(
  record: DeviceSnapshotRecord,
  secret: Uint8Array,
  device_key: CryptoKey,
): Promise<DeviceSnapshotPayload | null> {
  const aad = snapshot_aad(
    record.user_id,
    record.snapshot_id,
    record.source_hash,
  );
  let combined: Uint8Array | null = null;
  let plaintext: Uint8Array | null = null;

  try {
    combined = new Uint8Array(
      await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: record.iv, additionalData: aad },
        device_key,
        record.sealed,
      ),
    );

    if (combined.length <= IV_LENGTH) return null;

    const inner_key = await derive_inner_key(secret, record.snapshot_id);

    plaintext = new Uint8Array(
      await crypto.subtle.decrypt(
        {
          name: "AES-GCM",
          iv: combined.slice(0, IV_LENGTH),
          additionalData: aad,
        },
        inner_key,
        combined.slice(IV_LENGTH),
      ),
    );

    const parsed: unknown = JSON.parse(new TextDecoder().decode(plaintext));

    return is_payload(parsed) ? parsed : null;
  } catch {
    return null;
  } finally {
    if (combined) zero_uint8_array(combined);
    if (plaintext) zero_uint8_array(plaintext);
  }
}

async function build_payload(
  vault: EncryptedVault,
  passphrase: string,
): Promise<DeviceSnapshotPayload> {
  const unlocked_keys: [string, string][] = [];
  const seen = new Set<string>();

  for (const armored of [vault.identity_key, ...(vault.previous_keys ?? [])]) {
    if (!armored || seen.has(armored)) continue;
    seen.add(armored);

    try {
      const key = await unlock_private_key(armored, passphrase);

      unlocked_keys.push([armored, key.armor()]);
    } catch {
      continue;
    }
  }

  const storage_keys: string[] = [];

  for (const raw of await harvest_storage_keys(vault, passphrase)) {
    storage_keys.push(array_to_base64(raw));
    zero_uint8_array(raw);
  }

  return {
    v: SNAPSHOT_VERSION,
    identity_key: vault.identity_key,
    previous_keys: [...(vault.previous_keys ?? [])],
    legacy_identity_keys: [...(vault.legacy_identity_keys ?? [])],
    unlocked_keys,
    storage_keys,
    ratchet_keys: retain_previous_ratchet_keys(vault),
  };
}

function random_secret(): Uint8Array {
  const secret = new Uint8Array(SECRET_LENGTH);

  do {
    crypto.getRandomValues(secret);
  } while (secret.every((byte) => byte === 0));

  return secret;
}

function stored_vault(
  user_id: string,
): { encrypted_vault: string; vault_nonce: string } | null {
  try {
    const encrypted_vault = localStorage.getItem(
      `astermail_encrypted_vault_${user_id}`,
    );
    const vault_nonce = localStorage.getItem(
      `astermail_vault_nonce_${user_id}`,
    );

    if (!encrypted_vault || !vault_nonce) return null;

    return { encrypted_vault, vault_nonce };
  } catch {
    return null;
  }
}

export async function refresh_device_snapshot(
  user_id: string,
): Promise<boolean> {
  const passphrase = get_passphrase_from_memory();
  const stored = stored_vault(user_id);

  if (!passphrase || !stored) return false;

  let source_hash: string;

  try {
    source_hash = await vault_ciphertext_hash(stored.encrypted_vault);
  } catch {
    return false;
  }

  const existing = await list_device_snapshots(user_id);

  if (existing.some((record) => record.source_hash === source_hash)) {
    return false;
  }

  let vault: EncryptedVault;

  try {
    vault = await decrypt_vault(
      stored.encrypted_vault,
      stored.vault_nonce,
      passphrase,
    );
  } catch {
    return false;
  }

  const device_key = await load_device_recovery_key(true);

  if (!device_key) return false;

  const payload = await build_payload(vault, passphrase);
  const snapshot_id = crypto.randomUUID();
  const secret = random_secret();

  try {
    const put = await put_device_recovery_secret(
      snapshot_id,
      array_to_base64(secret),
    );

    if (put.error) return false;

    const { iv, sealed } = await seal_device_snapshot(
      payload,
      secret,
      device_key,
      { user_id, snapshot_id, source_hash },
    );
    const saved = await save_device_snapshot({
      snapshot_id,
      user_id,
      source_hash,
      created_at: Date.now(),
      iv,
      sealed,
    });

    if (!saved) {
      await delete_device_recovery_secrets([snapshot_id]);

      return false;
    }

    return true;
  } finally {
    zero_uint8_array(secret);
  }
}

async function open_snapshots(
  records: DeviceSnapshotRecord[],
): Promise<{ record: DeviceSnapshotRecord; payload: DeviceSnapshotPayload }[]> {
  if (records.length === 0) return [];

  const device_key = await load_device_recovery_key(false);

  if (!device_key) return [];

  const candidates = records.slice(0, MAX_SECRETS_PER_REQUEST);
  const response = await fetch_device_recovery_secrets(
    candidates.map((record) => record.snapshot_id),
  );

  if (response.error || !response.data) return [];

  const secrets = new Map(
    response.data.secrets.map((entry) => [entry.snapshot_id, entry.secret]),
  );
  const opened: {
    record: DeviceSnapshotRecord;
    payload: DeviceSnapshotPayload;
  }[] = [];

  for (const record of candidates) {
    const encoded = secrets.get(record.snapshot_id);

    if (!encoded) continue;

    let secret: Uint8Array;

    try {
      secret = base64_to_array(encoded);
    } catch {
      continue;
    }

    if (secret.length !== SECRET_LENGTH) {
      zero_uint8_array(secret);
      continue;
    }

    const payload = await open_device_snapshot(record, secret, device_key);

    zero_uint8_array(secret);
    if (payload) opened.push({ record, payload });
  }

  return opened;
}

async function recover_from_snapshots(
  user_id: string,
  archived_hashes: Set<string>,
): Promise<Set<string>> {
  const absorbed_hashes = new Set<string>();
  const matching = (await list_device_snapshots(user_id)).filter((record) =>
    archived_hashes.has(record.source_hash),
  );
  const opened = await open_snapshots(matching);

  if (opened.length === 0) return absorbed_hashes;

  return with_vault_write_lock(async () => {
    const vault = get_vault_from_memory();
    const passphrase = get_passphrase_from_memory();

    if (!vault || !passphrase) return absorbed_hashes;

    const unlocked = new Map<string, string>();

    for (const { payload } of opened) {
      for (const [armored, unlocked_armored] of payload.unlocked_keys) {
        unlocked.set(armored, unlocked_armored);
      }
    }

    const identity_keys = await merge_identity_keys_with(
      vault,
      opened.map(({ payload }) => ({
        identity_key: payload.identity_key,
        previous_keys: payload.previous_keys,
        legacy_identity_keys: payload.legacy_identity_keys,
      })),
      async (armored) => {
        const unlocked_armored = unlocked.get(armored);

        if (!unlocked_armored) {
          throw new Error("device_recovery: key not in snapshot");
        }

        return lock_unlocked_pgp_key(unlocked_armored, passphrase);
      },
    );

    unlocked.clear();

    const storage_keys: Uint8Array[] = [];

    for (const { payload } of opened) {
      for (const encoded of payload.storage_keys) {
        try {
          storage_keys.push(base64_to_array(encoded));
        } catch {
          continue;
        }
      }
    }

    const committed = await commit_recovered_keys({
      user_id,
      vault,
      passphrase,
      identity_keys,
      ratchet_groups: opened.map(({ payload }) => payload.ratchet_keys),
      storage_keys,
    });

    if (!committed) return absorbed_hashes;

    opened.forEach(({ record }, index) => {
      if (identity_keys.absorbed[index]) {
        absorbed_hashes.add(record.source_hash);
      }
    });

    return absorbed_hashes;
  });
}

async function inactive_key_set_hashes(): Promise<Map<string, string> | null> {
  const listed = await list_inactive_key_sets();

  if (listed.error || !listed.data) return null;

  const hashes = new Map<string, string>();

  for (const key_set of listed.data.inactive_key_sets ?? []) {
    const fetched = await fetch_inactive_key_set(key_set.id);

    if (fetched.error || !fetched.data) return null;

    try {
      hashes.set(
        key_set.id,
        await vault_ciphertext_hash(fetched.data.encrypted_vault),
      );
    } catch {
      return null;
    }
  }

  return hashes;
}

async function prune_snapshots(
  user_id: string,
  protected_hashes: Set<string>,
): Promise<void> {
  const records = await list_device_snapshots(user_id);
  const stale: string[] = [];
  let recent_kept = 0;

  for (const record of records) {
    if (protected_hashes.has(record.source_hash)) continue;
    if (recent_kept < RECENT_SNAPSHOTS_KEPT) {
      recent_kept += 1;
      continue;
    }
    stale.push(record.snapshot_id);
  }

  await forget_snapshots(stale);
}

async function forget_snapshots(snapshot_ids: string[]): Promise<void> {
  for (let i = 0; i < snapshot_ids.length; i += MAX_SECRETS_PER_REQUEST) {
    const chunk = snapshot_ids.slice(i, i + MAX_SECRETS_PER_REQUEST);
    const response = await delete_device_recovery_secrets(chunk);

    if (!response.error) await delete_device_snapshots(chunk);
  }
}

export async function device_recovery_enabled(): Promise<boolean> {
  const capabilities = await get_account_key_capabilities();

  return capabilities.device_recovery;
}

export async function run_device_recovery(user_id: string): Promise<number> {
  if (!(await device_recovery_enabled())) return 0;

  const inactive = await inactive_key_set_hashes();
  let consumed = 0;

  if (inactive && inactive.size > 0) {
    const absorbed = await recover_from_snapshots(
      user_id,
      new Set(inactive.values()),
    );
    const used = new Set<string>();

    for (const [id, hash] of inactive) {
      if (!absorbed.has(hash)) continue;

      const response = await consume_inactive_key_set(id);

      if (response.error) continue;
      inactive.delete(id);
      used.add(hash);
      consumed += 1;
    }

    if (used.size > 0) {
      const records = await list_device_snapshots(user_id);

      await forget_snapshots(
        records
          .filter((record) => used.has(record.source_hash))
          .map((record) => record.snapshot_id),
      );
    }
  }

  await refresh_device_snapshot(user_id);

  if (inactive) {
    await prune_snapshots(user_id, new Set(inactive.values()));
  }

  return consumed;
}
