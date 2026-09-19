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
import * as openpgp from "openpgp";

import { fetch_recovery_escrow_keys } from "../api/recovery";

import { seal_account_key_token } from "./account_key_token";
import { array_to_base64 } from "./base64";
import {
  decode_escrow_seed,
  derive_escrow_keypair,
  open_account_key_from_escrow,
} from "./recovery_key_escrow";
import { zero_uint8_array } from "./secure_memory";

export interface RescuedAccountKeyToken {
  token: string;
  fingerprint: string;
}

async function reseal(
  account_key: Uint8Array,
  new_identity_private_key: string,
  new_password: string,
  serial: number,
): Promise<RescuedAccountKeyToken | null> {
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

export async function rescue_account_key_from_escrow(
  recovery_token: string,
  escrow_seed: string | undefined,
  new_identity_private_key: string,
  new_password: string,
): Promise<RescuedAccountKeyToken | null> {
  if (!escrow_seed) return null;

  const seed = decode_escrow_seed(escrow_seed);

  if (!seed) return null;

  let keypair: ReturnType<typeof derive_escrow_keypair> | null = null;

  try {
    const response = await fetch_recovery_escrow_keys(recovery_token);

    if (response.error || !response.data) return null;

    const { user_id, escrow_public_key, entries } = response.data;

    if (!user_id || !escrow_public_key || entries.length === 0) return null;

    keypair = derive_escrow_keypair(seed, user_id);

    if (array_to_base64(keypair.public_key) !== escrow_public_key) return null;

    const ordered = [...entries].sort(
      (a, b) => b.token_version - a.token_version,
    );

    for (const entry of ordered) {
      const account_key = await open_account_key_from_escrow(
        entry.sealed,
        keypair.private_key,
        user_id,
        entry.token_version,
      );

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
    if (keypair) zero_uint8_array(keypair.private_key);
  }
}
