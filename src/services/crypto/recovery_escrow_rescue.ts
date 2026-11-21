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
import type { EscrowEntry } from "../api/recovery";
import type { EncryptedVault } from "./key_manager_core";

import { fetch_recovery_escrow_keys } from "../api/recovery";

import { seal_account_key_token } from "./account_key_token";
import { array_to_base64 } from "./base64";
import {
  ESCROW_FORMAT,
  decode_escrow_seed,
  derive_escrow_keys,
  derive_legacy_escrow_keypair,
  open_account_key_from_escrow,
  open_legacy_account_key_from_escrow,
  zero_escrow_keys,
  type EscrowKeypair,
  type EscrowKeys,
} from "./recovery_key_escrow";
import { zero_uint8_array } from "./secure_memory";

import { load_openpgp } from "@/services/crypto/openpgp_loader";

export interface RescuedAccountKeyToken {
  token: string;
  fingerprint: string;
}

export type EscrowRescueSource = Pick<
  EncryptedVault,
  "escrow_seed" | "escrow_format"
>;

type EntryOpener = (entry: EscrowEntry) => Promise<Uint8Array | null>;

async function reseal(
  account_key: Uint8Array,
  new_identity_private_key: string,
  new_password: string,
  serial: number,
): Promise<RescuedAccountKeyToken | null> {
  const openpgp = await load_openpgp();

  try {
    const token = await seal_account_key_token(
      account_key,
      new_identity_private_key,
      new_password,
      serial,
    );
    const private_key = await openpgp.readPrivateKey({
      armoredKey: new_identity_private_key,
    });

    return { token, fingerprint: private_key.getFingerprint().toLowerCase() };
  } catch {
    return null;
  }
}

function select_opener(
  escrow_public_key: string,
  user_id: string,
  keys: EscrowKeys,
  legacy: EscrowKeypair | null,
): EntryOpener | null {
  if (array_to_base64(keys.public_key) === escrow_public_key) {
    return (entry) =>
      open_account_key_from_escrow(
        entry.sealed,
        keys,
        user_id,
        entry.token_version,
      );
  }

  if (legacy && array_to_base64(legacy.public_key) === escrow_public_key) {
    return (entry) =>
      open_legacy_account_key_from_escrow(
        entry.sealed,
        legacy.private_key,
        user_id,
        entry.token_version,
      );
  }

  return null;
}

export async function rescue_account_key_from_escrow(
  recovery_token: string,
  source: EscrowRescueSource,
  new_identity_private_key: string,
  new_password: string,
): Promise<RescuedAccountKeyToken | null> {
  if (!source.escrow_seed) return null;

  const seed = decode_escrow_seed(source.escrow_seed);

  if (!seed) return null;

  let keys: EscrowKeys | null = null;
  let legacy: EscrowKeypair | null = null;

  try {
    const response = await fetch_recovery_escrow_keys(recovery_token);

    if (response.error || !response.data) return null;

    const { user_id, escrow_public_key, entries } = response.data;

    if (!user_id || !escrow_public_key || entries.length === 0) return null;

    keys = derive_escrow_keys(seed, user_id);
    legacy =
      source.escrow_format === ESCROW_FORMAT
        ? null
        : derive_legacy_escrow_keypair(seed, user_id);

    const open_entry = select_opener(escrow_public_key, user_id, keys, legacy);

    if (!open_entry) return null;

    const ordered = [...entries].sort(
      (a, b) => b.token_version - a.token_version,
    );

    for (const entry of ordered) {
      const account_key = await open_entry(entry);

      if (!account_key) continue;

      try {
        const resealed = await reseal(
          account_key,
          new_identity_private_key,
          new_password,
          entry.token_version + 1,
        );

        if (resealed) return resealed;
      } finally {
        zero_uint8_array(account_key);
      }
    }

    return null;
  } catch {
    return null;
  } finally {
    zero_uint8_array(seed);
    zero_escrow_keys(keys);
    zero_escrow_keys(legacy);
  }
}
