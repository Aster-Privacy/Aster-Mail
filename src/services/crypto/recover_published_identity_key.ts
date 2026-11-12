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
import type { EncryptedVault } from "@/services/crypto/key_manager_core";

import { api_client } from "@/services/api/client";
import { base64_to_array } from "@/services/crypto/base64";
import {
  prepend_missing_identity_keks,
  vault_lacks_identity_key,
} from "@/services/crypto/install_missing_identity_key";
import { KEY_DERIVATION_ITERATIONS } from "@/services/crypto/key_manager_core";
import { ignore_error } from "@/lib/ignore_error";

export type IdentityKeyRecoveryResult =
  | "recovered"
  | "second_factor_required"
  | "proof_rejected"
  | "unavailable"
  | "failed";

export const IDENTITY_RECOVERY_REJECTED_WAIT_MS = 30 * 24 * 60 * 60 * 1000;
export const IDENTITY_RECOVERY_UNAVAILABLE_WAIT_MS = 24 * 60 * 60 * 1000;

const WAIT_KEY_PREFIX = "aster_identity_key_recovery_";
const WRAP_SALT_BYTES = 16;

interface SaltResponse {
  salt?: string;
  totp_required?: boolean;
  kdf_version?: unknown;
}

interface ExportResponse {
  fingerprint?: string;
  encrypted_private_key_blob?: string;
  private_key_nonce?: string;
  client_side_decryption?: boolean;
}

let recovery_in_progress = false;

function wait_key(account_id: string): string {
  return WAIT_KEY_PREFIX + account_id;
}

function waiting(account_id: string, at: number): boolean {
  try {
    const stored = Number(localStorage.getItem(wait_key(account_id)));

    return Number.isFinite(stored) && stored > at;
  } catch {
    return false;
  }
}

function wait_for(account_id: string, until: number): void {
  try {
    localStorage.setItem(wait_key(account_id), String(until));
  } catch {
    return;
  }
}

function stop_waiting(account_id: string): void {
  try {
    localStorage.removeItem(wait_key(account_id));
  } catch {
    return;
  }
}

async function published_fingerprint(armored: string): Promise<string | null> {
  try {
    const { load_openpgp } = await import("@/services/crypto/openpgp_loader");
    const openpgp = await load_openpgp();
    const public_key = await openpgp.readKey({ armoredKey: armored });

    return public_key.getFingerprint().toUpperCase();
  } catch {
    return null;
  }
}

async function open_wrapped_key(
  blob: string,
  nonce: string,
  passphrase: string,
): Promise<string | null> {
  try {
    const wrapped = base64_to_array(blob);

    if (wrapped.length <= WRAP_SALT_BYTES) return null;

    const material = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(passphrase),
      "PBKDF2",
      false,
      ["deriveKey"],
    );
    const key = await crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: wrapped.slice(0, WRAP_SALT_BYTES),
        iterations: KEY_DERIVATION_ITERATIONS,
        hash: "SHA-256",
      },
      material,
      { name: "AES-GCM", length: 256 },
      false,
      ["decrypt"],
    );
    const opened = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: base64_to_array(nonce) },
      key,
      wrapped.slice(WRAP_SALT_BYTES),
    );

    return new TextDecoder("utf-8", { fatal: true }).decode(opened);
  } catch {
    return null;
  }
}

async function fetch_published_private_key(
  fingerprint: string,
  passphrase: string,
): Promise<string | IdentityKeyRecoveryResult> {
  const salt_response = await api_client.get<SaltResponse>(
    "/crypto/v1/encryption/salt",
    { skip_cache: true },
  );

  if (salt_response.error || !salt_response.data?.salt) return "failed";
  if (salt_response.data.totp_required) return "second_factor_required";

  const { derive_current_account_proof, read_kdf_version } =
    await import("@/services/crypto/login_proof");
  const password_hash = await derive_current_account_proof(
    passphrase,
    base64_to_array(salt_response.data.salt),
    read_kdf_version(salt_response.data.kdf_version),
  );
  const response = await api_client.post<ExportResponse>(
    "/crypto/v1/keys/pgp/export",
    { include_private: true, password_hash, format: "armored" },
  );

  if (response.code === "UNAUTHORIZED" || response.code === "FORBIDDEN") {
    return "proof_rejected";
  }
  if (response.code === "NOT_FOUND") return "unavailable";
  if (response.error || !response.data) return "failed";

  const data = response.data;

  if (
    !data.client_side_decryption ||
    !data.encrypted_private_key_blob ||
    !data.private_key_nonce ||
    (data.fingerprint ?? "").trim().toUpperCase() !== fingerprint
  ) {
    return "unavailable";
  }

  const opened = await open_wrapped_key(
    data.encrypted_private_key_blob,
    data.private_key_nonce,
    passphrase,
  );

  if (!opened) return "unavailable";

  const { armored_private_key_matches, find_unlockable_private_key } =
    await import("@/services/crypto/key_manager_pgp");

  if (!(await armored_private_key_matches(opened, fingerprint))) {
    return "unavailable";
  }

  const unlockable = await find_unlockable_private_key(
    [opened],
    fingerprint,
    passphrase,
  );

  return unlockable ?? "unavailable";
}

async function adopt_under_lock(
  account_id: string,
  fingerprint: string,
): Promise<IdentityKeyRecoveryResult> {
  const { sync_vault_with_server } =
    await import("@/services/crypto/ensure_ratchet_keys");
  const {
    get_vault_from_memory,
    get_passphrase_from_memory,
    is_vault_owned_by,
    MASTER_KEY_VAULT_FORMAT,
  } = await import("@/services/crypto/memory_key_store");

  if (!is_vault_owned_by(account_id)) return "failed";

  const freshness = await sync_vault_with_server();

  if (freshness.status === "unverified") return "failed";

  const vault: EncryptedVault | null =
    freshness.status === "adopted" ? freshness.vault : get_vault_from_memory();
  const passphrase = get_passphrase_from_memory();

  if (!vault || !passphrase || !vault_lacks_identity_key(vault)) {
    return "failed";
  }

  const fetched = await fetch_published_private_key(fingerprint, passphrase);

  if (!fetched.trimStart().startsWith("-----BEGIN PGP PRIVATE KEY")) {
    return fetched as IdentityKeyRecoveryResult;
  }
  if (!is_vault_owned_by(account_id)) return "failed";

  const new_vault: EncryptedVault = {
    ...vault,
    identity_key: fetched,
    legacy_keks: await prepend_missing_identity_keks(vault.legacy_keks),
  };
  const { encrypt_vault } = await import("@/services/crypto/key_manager");
  const { update_vault } = await import("@/services/api/key_rotation");
  const { encrypted_vault, vault_nonce } = await encrypt_vault(
    new_vault,
    passphrase,
  );
  const saved = await update_vault(
    encrypted_vault,
    vault_nonce,
    vault.data_kek ? MASTER_KEY_VAULT_FORMAT : new_vault.vault_format,
    account_id,
    true,
    new_vault,
    vault,
  );

  if (!saved.success) return "failed";

  const { upload_prekey_bundle } =
    await import("@/services/crypto/ratchet_manager");
  const { ensure_default_labels } =
    await import("@/services/labels/ensure_defaults");

  await upload_prekey_bundle(new_vault).catch((caught) =>
    ignore_error(
      "services/crypto/recover_published_identity_key:prekeys",
      caught,
    ),
  );
  await ensure_default_labels(new_vault).catch((caught) =>
    ignore_error(
      "services/crypto/recover_published_identity_key:labels",
      caught,
    ),
  );

  return "recovered";
}

export async function recover_published_identity_key(
  account_id: string,
  published_key_armored: string,
  now: () => number = Date.now,
): Promise<IdentityKeyRecoveryResult> {
  if (recovery_in_progress || !account_id) return "failed";
  if (waiting(account_id, now())) return "unavailable";

  recovery_in_progress = true;

  try {
    const fingerprint = await published_fingerprint(published_key_armored);

    if (!fingerprint) return "unavailable";

    const { with_vault_write_lock } =
      await import("@/services/crypto/vault_write_lock");
    const result = await with_vault_write_lock(() =>
      adopt_under_lock(account_id, fingerprint),
    );

    if (result === "recovered") stop_waiting(account_id);
    if (result === "proof_rejected") {
      wait_for(account_id, now() + IDENTITY_RECOVERY_REJECTED_WAIT_MS);
    }
    if (result === "unavailable" || result === "second_factor_required") {
      wait_for(account_id, now() + IDENTITY_RECOVERY_UNAVAILABLE_WAIT_MS);
    }

    return result;
  } catch (caught) {
    ignore_error("services/crypto/recover_published_identity_key", caught);

    return "failed";
  } finally {
    recovery_in_progress = false;
  }
}
