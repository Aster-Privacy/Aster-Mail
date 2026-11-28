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
import type { EncryptedVault } from "../key_manager_core";

import { p256 } from "@noble/curves/nist.js";
import { sha256 } from "@noble/hashes/sha256";

import { array_to_base64, base64_to_array } from "../base64";
import {
  base64url_decode,
  derive_address_key,
} from "../address_sender_identity";
import { is_handshake_v5_advertised } from "../crypto_enforcement_policy";
import { get_vault_from_memory } from "../memory_key_store";
import { sign_ratchet_prekey_bundle } from "../key_manager_pgp";
import { load_openpgp } from "../openpgp_loader";
import { select_published_signing_key } from "../published_signing_key";
import {
  X3DH_VERSION_ACCOUNT_BOUND,
  one_time_prekey_digest,
  type OneTimePrekeyKind,
} from "../x3dh";

import { type RatchetPrekeyAccountKeys } from "./prekey_signed_text";

const BUNDLE_SIGNING_SALT = new TextEncoder().encode(
  "aster/handshake/bundle-signing/v5",
);
const BUNDLE_SIGNING_PURPOSE = "bundle-signing";
const PUBLISHED_STORAGE_KEY = "astermail_handshake_v5_published";

export interface BundleSigningKey {
  private_jwk: string;
  public_key: string;
}

export function derive_bundle_signing_key(
  ratchet_identity_jwk: string | null | undefined,
): BundleSigningKey | null {
  const derived = derive_address_key(
    ratchet_identity_jwk ?? undefined,
    BUNDLE_SIGNING_PURPOSE,
    BUNDLE_SIGNING_SALT,
  );

  return derived
    ? { private_jwk: derived.identity_jwk, public_key: derived.identity_public }
    : null;
}

export function sign_one_time_prekey(
  signing_key: BundleSigningKey,
  kind: OneTimePrekeyKind,
  key_id: number,
  public_key: string,
): string {
  let scalar: Uint8Array | null = null;

  try {
    scalar = base64url_decode(
      (JSON.parse(signing_key.private_jwk) as JsonWebKey).d ?? "",
    );

    return array_to_base64(
      p256.sign(
        one_time_prekey_digest(kind, key_id, base64_to_array(public_key)),
        scalar,
        { lowS: true, prehash: false },
      ),
    );
  } finally {
    scalar?.fill(0);
  }
}

export function current_bundle_signing_key(): BundleSigningKey | null {
  if (!is_handshake_v5_advertised()) return null;

  return derive_bundle_signing_key(
    get_vault_from_memory()?.ratchet_identity_key,
  );
}

export function sign_one_time_prekeys<
  T extends { key_id: number; public_key: string },
>(kind: OneTimePrekeyKind, prekeys: T[]): (T & { signature?: string })[] {
  const signing_key = current_bundle_signing_key();

  if (!signing_key) return prekeys;

  return prekeys.map((prekey) => ({
    ...prekey,
    signature: sign_one_time_prekey(
      signing_key,
      kind,
      prekey.key_id,
      prekey.public_key,
    ),
  }));
}

export function account_bound_signature_input(
  signing_key: BundleSigningKey,
): RatchetPrekeyAccountKeys {
  return {
    signing_public_key: signing_key.public_key,
    x3dh_max_version: X3DH_VERSION_ACCOUNT_BOUND,
  };
}

async function owner_signing_key(vault: EncryptedVault): Promise<string> {
  return (await select_published_signing_key(vault)) ?? vault.identity_key;
}

export async function sign_prekey_bundle_upload(
  vault: EncryptedVault,
  passphrase: string,
  identity_public: string,
  signed_prekey_public: string,
): Promise<{ signature: string; account_fields: Record<string, string> }> {
  const owner_key = await owner_signing_key(vault);
  const sign = (account?: RatchetPrekeyAccountKeys) =>
    sign_ratchet_prekey_bundle(
      owner_key,
      passphrase,
      identity_public,
      signed_prekey_public,
      vault.ratchet_pq_identity_public ?? null,
      account,
    );
  const signature = await sign();
  const signing_key = is_handshake_v5_advertised()
    ? derive_bundle_signing_key(vault.ratchet_identity_key)
    : null;

  if (!signing_key) return { signature, account_fields: {} };

  return {
    signature,
    account_fields: {
      signing_public_key: signing_key.public_key,
      account_signature: await sign(account_bound_signature_input(signing_key)),
    },
  };
}

export function note_account_bound_upload(
  fields: Record<string, string>,
  uploaded: boolean,
  identity_public: string,
): void {
  if (uploaded && fields.account_signature) {
    mark_account_bound_published(identity_public);
  }
}

function identity_marker(identity_public: string): string {
  return array_to_base64(sha256(base64_to_array(identity_public)));
}

export function mark_account_bound_published(identity_public: string): void {
  try {
    localStorage.setItem(
      PUBLISHED_STORAGE_KEY,
      identity_marker(identity_public),
    );
  } catch {
    return;
  }
}

export async function is_account_bound_published(): Promise<boolean> {
  const identity_public = get_vault_from_memory()?.ratchet_identity_public;

  if (!is_handshake_v5_advertised() || !identity_public) return false;

  try {
    return (
      localStorage.getItem(PUBLISHED_STORAGE_KEY) ===
      identity_marker(identity_public)
    );
  } catch {
    return false;
  }
}

export function fingerprint_to_hex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function fingerprint_from_hex(hex: string): Uint8Array | null {
  if (!/^(?:[0-9a-f]{2}){20,32}$/.test(hex)) return null;

  return Uint8Array.from(hex.match(/../g) ?? [], (pair) => parseInt(pair, 16));
}

export async function owner_fingerprint_bytes(
  armored_key: string,
): Promise<Uint8Array> {
  const openpgp = await load_openpgp();
  const key = await openpgp.readKey({ armoredKey: armored_key });
  const bytes = fingerprint_from_hex(key.getFingerprint().toLowerCase());

  if (!bytes) throw new Error("Unreadable owner key fingerprint");

  return bytes;
}

export async function own_owner_fingerprint(
  vault: EncryptedVault,
): Promise<Uint8Array> {
  return owner_fingerprint_bytes(await owner_signing_key(vault));
}
