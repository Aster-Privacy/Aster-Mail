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
import { base64_to_array } from "./base64";
import { zero_uint8_array } from "./secure_memory";

import { HASH_ALG } from "@/services/crypto/constants";

export const ACCOUNT_KEY_LENGTH = 32;

const ACCOUNT_DATA_SALT = "aster-account-data-salt-v1";
const ACCOUNT_DATA_INFO_PREFIX = "aster-account-data-v1:";

export const ACCOUNT_DATA_CONTEXTS = [
  "astermail-tags-v1",
  "astermail-labels-v1",
  "astermail-preferences-v1",
  "astermail-devmode-v1",
  "astermail-draft-v1",
  "astermail-draft-v2",
  "astermail-scheduled-v1",
  "astermail-onboarding-v1",
  "astermail-subscriptions-v1",
  "astermail-recovery-email-v1",
] as const;

export type AccountDataContext = (typeof ACCOUNT_DATA_CONTEXTS)[number];

export function decode_account_key(
  account_key_b64: string | undefined,
): Uint8Array | null {
  if (!account_key_b64) return null;

  let raw: Uint8Array;

  try {
    raw = base64_to_array(account_key_b64);
  } catch {
    return null;
  }

  if (raw.length !== ACCOUNT_KEY_LENGTH) {
    zero_uint8_array(raw);

    return null;
  }

  return raw;
}

export async function derive_account_data_key_raw(
  account_key: Uint8Array,
  context: AccountDataContext,
): Promise<Uint8Array> {
  if (account_key.length !== ACCOUNT_KEY_LENGTH) {
    throw new Error("account key has the wrong length");
  }

  const encoder = new TextEncoder();
  const base = await crypto.subtle.importKey(
    "raw",
    account_key,
    "HKDF",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: HASH_ALG,
      salt: encoder.encode(ACCOUNT_DATA_SALT),
      info: encoder.encode(ACCOUNT_DATA_INFO_PREFIX + context),
    },
    base,
    ACCOUNT_KEY_LENGTH * 8,
  );

  return new Uint8Array(bits);
}
