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
import type { EncryptedVault } from "./key_manager_core";

import { array_to_base64, base64_to_array } from "./base64";
import { decrypt_with_legacy_derived_keys } from "./legacy_keks";
import { get_vault_from_memory, has_vault_in_memory } from "./memory_key_store";
import {
  derive_ratchet_encryption_key,
  derive_ratchet_encryption_key_from_base,
} from "./ratchet_sync";
import { load_storage_write_key_bytes } from "./storage_write_key";
import {
  open_prekey_secret as open_storage_bound_secret,
  seal_prekey_secret as seal_storage_bound_secret,
} from "./prekey_secret_binding";

const PREKEY_SEAL_KEY_LEN = 32;
const PREKEY_SEAL_NONCE_LEN = 12;
const PREKEY_SEAL_LABEL = "aster-opk-seal-v1";

export type PrekeySealKind = "ec" | "pq";

export interface SealedPrekeySecret {
  encrypted_secret: string;
  secret_nonce: string;
}

interface OpenedPrekeySecret {
  secret: Uint8Array;
  legacy: boolean;
  bound: boolean;
  recovered: boolean;
}

interface OpenedLegacySecret {
  secret: Uint8Array;
  bound: boolean;
  recovered: boolean;
}

export type PrekeySealFormat = "v1" | "legacy";

export interface PrekeySealer {
  format: PrekeySealFormat;
  seal: (
    kind: PrekeySealKind,
    key_id: number,
    secret: Uint8Array,
  ) => Promise<SealedPrekeySecret>;
}

const encoder = new TextEncoder();

function current_vault(): EncryptedVault | null {
  try {
    return get_vault_from_memory();
  } catch {
    return null;
  }
}

function prekey_seal_aad(
  kind: PrekeySealKind,
  key_id: number,
): Uint8Array {
  return encoder.encode(`${PREKEY_SEAL_LABEL}:${kind}:${key_id}`);
}

function read_prekey_seal_key(
  vault: EncryptedVault | null | undefined,
): Uint8Array | null {
  const encoded = vault?.prekey_seal_key;

  if (typeof encoded !== "string") return null;

  try {
    const raw = base64_to_array(encoded);

    if (raw.length === PREKEY_SEAL_KEY_LEN) return raw;

    raw.fill(0);

    return null;
  } catch {
    return null;
  }
}

export function legacy_prekey_seals_retired(
  vault: EncryptedVault | null | undefined = current_vault(),
): boolean {
  return vault?.prekey_seal_migrated === true;
}

async function import_prekey_seal_key(
  raw: Uint8Array,
): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", raw, "HKDF", false, [
    "deriveKey",
  ]);

  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array(32),
      info: encoder.encode(PREKEY_SEAL_LABEL),
    },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function key_from_vault(
  vault: EncryptedVault | null | undefined,
): Promise<CryptoKey | null> {
  const raw = read_prekey_seal_key(vault);

  if (!raw) return null;

  try {
    return await import_prekey_seal_key(raw);
  } finally {
    raw.fill(0);
  }
}

export async function load_prekey_seal_key(): Promise<CryptoKey | null> {
  if (!has_vault_in_memory()) return null;

  try {
    return await key_from_vault(current_vault());
  } catch {
    return null;
  }
}

async function write_seal_fields(
  update: (vault: EncryptedVault) => EncryptedVault | null,
): Promise<EncryptedVault | null> {
  const [{ write_vault_merged }, { with_vault_write_lock }] = await Promise.all(
    [import("./vault_cas_write"), import("./vault_write_lock")],
  );

  return with_vault_write_lock(async () => {
    const base = current_vault();

    if (!base) return null;

    const next = update(base);

    if (!next) return base;

    const result = await write_vault_merged({
      next,
      base,
      preserve_pq_prekeys: true,
    });

    return result.status === "written" ? result.vault : null;
  });
}

export async function prekey_seal_writes_ready(): Promise<boolean> {
  try {
    const { get_account_key_capabilities } =
      await import("@/services/api/account_key");

    return (await get_account_key_capabilities()).bound_prekey_writes === true;
  } catch {
    return false;
  }
}

export async function create_prekey_seal_key(): Promise<CryptoKey | null> {
  const existing = await load_prekey_seal_key();

  if (existing) return existing;

  if (!has_vault_in_memory()) return null;

  try {
    const written = await write_seal_fields((vault) => {
      if (read_prekey_seal_key(vault)) return null;

      const raw = crypto.getRandomValues(new Uint8Array(PREKEY_SEAL_KEY_LEN));

      try {
        return { ...vault, prekey_seal_key: array_to_base64(raw) };
      } finally {
        raw.fill(0);
      }
    });

    return await key_from_vault(written);
  } catch {
    return null;
  }
}

export async function retire_legacy_prekey_seals(): Promise<boolean> {
  try {
    const written = await write_seal_fields((vault) =>
      legacy_prekey_seals_retired(vault)
        ? null
        : { ...vault, prekey_seal_migrated: true },
    );

    return legacy_prekey_seals_retired(written);
  } catch {
    return false;
  }
}

async function seal_with_storage_sync_key(
  sync_key: CryptoKey,
  kind: PrekeySealKind,
  key_id: number,
  secret: Uint8Array,
): Promise<SealedPrekeySecret> {
  const sealed = await seal_storage_bound_secret(kind, key_id, secret, sync_key);

  return {
    encrypted_secret: array_to_base64(sealed.encrypted_secret),
    secret_nonce: array_to_base64(sealed.secret_nonce),
  };
}

async function load_legacy_sealer(): Promise<PrekeySealer | null> {
  if (!has_vault_in_memory()) return null;

  const master = await load_storage_write_key_bytes();

  if (!master) return null;

  try {
    const sync_key = await derive_ratchet_encryption_key(master);

    return {
      format: "legacy",
      seal: (kind, key_id, secret) =>
        seal_with_storage_sync_key(sync_key, kind, key_id, secret),
    };
  } finally {
    master.fill(0);
  }
}

export function prekey_sealer_for_key(key: CryptoKey): PrekeySealer {
  return {
    format: "v1",
    seal: (kind, key_id, secret) =>
      seal_prekey_secret(key, kind, key_id, secret),
  };
}

export async function load_prekey_sealer(): Promise<PrekeySealer | null> {
  try {
    if (!(await prekey_seal_writes_ready())) return await load_legacy_sealer();

    const key = await load_prekey_seal_key();

    return key ? prekey_sealer_for_key(key) : null;
  } catch {
    return null;
  }
}

export async function seal_prekey_secret(
  key: CryptoKey,
  kind: PrekeySealKind,
  key_id: number,
  secret: Uint8Array,
): Promise<SealedPrekeySecret> {
  const nonce = crypto.getRandomValues(new Uint8Array(PREKEY_SEAL_NONCE_LEN));
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: nonce,
      additionalData: prekey_seal_aad(kind, key_id),
    },
    key,
    secret,
  );

  return {
    encrypted_secret: array_to_base64(new Uint8Array(ciphertext)),
    secret_nonce: array_to_base64(nonce),
  };
}

function decode_sealed(
  sealed: SealedPrekeySecret,
): { ciphertext: Uint8Array; nonce: Uint8Array } | null {
  try {
    const nonce = base64_to_array(sealed.secret_nonce);

    if (nonce.length !== PREKEY_SEAL_NONCE_LEN) return null;

    return { ciphertext: base64_to_array(sealed.encrypted_secret), nonce };
  } catch {
    return null;
  }
}

export async function open_prekey_secret(
  key: CryptoKey,
  kind: PrekeySealKind,
  key_id: number,
  sealed: SealedPrekeySecret,
): Promise<Uint8Array | null> {
  const decoded = decode_sealed(sealed);

  if (!decoded) return null;

  try {
    return new Uint8Array(
      await crypto.subtle.decrypt(
        {
          name: "AES-GCM",
          iv: decoded.nonce,
          additionalData: prekey_seal_aad(kind, key_id),
        },
        key,
        decoded.ciphertext,
      ),
    );
  } catch {
    return null;
  }
}

async function open_with_storage_sync_key(
  kind: PrekeySealKind,
  key_id: number,
  ciphertext: Uint8Array,
  nonce: Uint8Array,
): Promise<{ secret: Uint8Array; bound: boolean } | null> {
  const master = await load_storage_write_key_bytes();

  if (!master) return null;

  try {
    const sync_key = await derive_ratchet_encryption_key(master);

    return await open_storage_bound_secret(
      kind,
      key_id,
      ciphertext,
      nonce,
      sync_key,
    );
  } catch {
    return null;
  } finally {
    master.fill(0);
  }
}

export async function open_legacy_prekey_secret(
  kind: PrekeySealKind,
  key_id: number,
  sealed: SealedPrekeySecret,
): Promise<OpenedLegacySecret | null> {
  if (!has_vault_in_memory()) return null;

  const decoded = decode_sealed(sealed);

  if (!decoded) return null;

  const primary = await open_with_storage_sync_key(
    kind,
    key_id,
    decoded.ciphertext,
    decoded.nonce,
  );

  if (primary) return { ...primary, recovered: false };

  try {
    const recovered = await decrypt_with_legacy_derived_keys(
      derive_ratchet_encryption_key_from_base,
      decoded.ciphertext,
      decoded.nonce,
    );

    return recovered
      ? { secret: new Uint8Array(recovered), bound: false, recovered: true }
      : null;
  } catch {
    return null;
  }
}

export async function open_server_prekey_secret(
  kind: PrekeySealKind,
  key_id: number,
  sealed: SealedPrekeySecret,
): Promise<OpenedPrekeySecret | null> {
  const key = await load_prekey_seal_key();

  if (key) {
    const opened = await open_prekey_secret(key, kind, key_id, sealed);

    if (opened) {
      return { secret: opened, legacy: false, bound: true, recovered: false };
    }
  }

  const legacy = await open_legacy_prekey_secret(kind, key_id, sealed);

  return legacy ? { ...legacy, legacy: true } : null;
}

export async function prekey_seal_key_fingerprint(
  label: string,
): Promise<string | null> {
  const raw = read_prekey_seal_key(current_vault());

  if (!raw) return null;

  try {
    const hmac_key = await crypto.subtle.importKey(
      "raw",
      raw,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const signature = await crypto.subtle.sign(
      "HMAC",
      hmac_key,
      encoder.encode(label),
    );

    return array_to_base64(new Uint8Array(signature));
  } catch {
    return null;
  } finally {
    raw.fill(0);
  }
}
