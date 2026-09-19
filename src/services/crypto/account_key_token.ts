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

import { array_to_base64 } from "./base64";
import { ACCOUNT_KEY_LENGTH, decode_account_key } from "./account_data_key";
import {
  decrypt_message_verified_with_any_key,
  encrypt_message,
} from "./key_manager_pgp_messages";

export const ACCOUNT_KEY_TOKEN_TYPE = "aster-account-key";
export const ACCOUNT_KEY_TOKEN_VERSION = 2;
const LEGACY_ACCOUNT_KEY_TOKEN_VERSION = 1;
const FINGERPRINT_PATTERN = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;

interface AccountKeyTokenPayload {
  type: string;
  version: number;
  key: string;
  owner?: string;
  serial?: number;
}

export function build_account_key_token_payload(
  account_key: Uint8Array,
  owner: string,
  serial: number,
): string {
  if (account_key.length !== ACCOUNT_KEY_LENGTH) {
    throw new Error("account key must be 32 bytes");
  }

  const normalized_owner = owner.trim().toLowerCase();

  if (!FINGERPRINT_PATTERN.test(normalized_owner)) {
    throw new Error("owner must be a key fingerprint");
  }

  if (!Number.isSafeInteger(serial) || serial < 1) {
    throw new Error("serial must be a positive integer");
  }

  const payload: AccountKeyTokenPayload = {
    type: ACCOUNT_KEY_TOKEN_TYPE,
    version: ACCOUNT_KEY_TOKEN_VERSION,
    key: array_to_base64(account_key),
    owner: normalized_owner,
    serial,
  };

  return JSON.stringify(payload);
}

export function parse_account_key_token_payload(
  plaintext: string,
  owner_fingerprints: string[],
): Uint8Array | null {
  let parsed: unknown;

  try {
    parsed = JSON.parse(plaintext);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }

  const payload = parsed as Partial<AccountKeyTokenPayload>;

  if (
    payload.type !== ACCOUNT_KEY_TOKEN_TYPE ||
    typeof payload.key !== "string"
  ) {
    return null;
  }

  if (payload.version === ACCOUNT_KEY_TOKEN_VERSION) {
    const owners = owner_fingerprints.map((f) => f.trim().toLowerCase());

    if (
      typeof payload.owner !== "string" ||
      !FINGERPRINT_PATTERN.test(payload.owner) ||
      !owners.includes(payload.owner) ||
      typeof payload.serial !== "number" ||
      !Number.isSafeInteger(payload.serial) ||
      payload.serial < 1
    ) {
      return null;
    }
  } else if (payload.version !== LEGACY_ACCOUNT_KEY_TOKEN_VERSION) {
    return null;
  }

  return decode_account_key(payload.key);
}

async function fingerprint_of(
  armored_private_key: string,
): Promise<string | null> {
  try {
    const key = await openpgp.readPrivateKey({
      armoredKey: armored_private_key,
    });

    return key.getFingerprint().toLowerCase();
  } catch {
    return null;
  }
}

async function own_fingerprints(
  armored_private_keys: (string | null | undefined)[],
): Promise<string[]> {
  const unique = Array.from(
    new Set(armored_private_keys.filter((k): k is string => !!k)),
  );
  const fingerprints = await Promise.all(unique.map(fingerprint_of));

  return fingerprints.filter((f): f is string => !!f);
}

async function to_public_armored(
  armored_private_key: string,
): Promise<string | null> {
  try {
    const key = await openpgp.readPrivateKey({
      armoredKey: armored_private_key,
    });

    return key.toPublic().armor();
  } catch {
    return null;
  }
}

export async function own_verification_keys(
  armored_private_keys: (string | null | undefined)[],
): Promise<string[]> {
  const unique = Array.from(
    new Set(armored_private_keys.filter((k): k is string => !!k)),
  );
  const converted = await Promise.all(unique.map(to_public_armored));

  return converted.filter((k): k is string => !!k);
}

export async function seal_account_key_token(
  account_key: Uint8Array,
  identity_private_key: string,
  passphrase: string,
  serial: number = 1,
): Promise<string> {
  const public_key = await to_public_armored(identity_private_key);
  const owner = await fingerprint_of(identity_private_key);

  if (!public_key || !owner) {
    throw new Error("identity key is not a valid private key");
  }

  return encrypt_message(
    build_account_key_token_payload(account_key, owner, serial),
    public_key,
    { armored_secret_key: identity_private_key, passphrase },
  );
}

export async function open_account_key_token(
  token: string,
  own_private_keys: (string | null | undefined)[],
  passphrase: string,
): Promise<Uint8Array | null> {
  const verification_keys = await own_verification_keys(own_private_keys);

  if (verification_keys.length === 0) return null;

  try {
    const result = await decrypt_message_verified_with_any_key(
      token,
      own_private_keys,
      passphrase,
      verification_keys,
    );

    if (result.verification !== "verified") return null;

    return parse_account_key_token_payload(
      result.plaintext,
      await own_fingerprints(own_private_keys),
    );
  } catch {
    return null;
  }
}
