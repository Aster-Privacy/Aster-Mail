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
export type signature_verdict =
  | "unsigned"
  | "no_keys"
  | "verified"
  | "invalid"
  | "unknown";

export interface checked_signature {
  verified: Promise<boolean>;
  keyID?: unknown;
}

export interface signature_verification_key {
  getKeys: (key_id?: never) => unknown[];
}

function made_by_known_key(
  signature: checked_signature,
  keys: signature_verification_key[],
): boolean {
  if (signature.keyID === undefined || signature.keyID === null) return false;

  return keys.some((key) => {
    try {
      return key.getKeys(signature.keyID as never).length > 0;
    } catch {
      return false;
    }
  });
}

export async function judge_signatures(
  signatures: checked_signature[] | undefined,
  keys: signature_verification_key[],
): Promise<{ status: signature_verdict; has_signature: boolean }> {
  const list = signatures || [];
  const has_signature = list.length > 0;

  if (!has_signature) return { status: "unsigned", has_signature: false };
  if (keys.length === 0) return { status: "no_keys", has_signature: true };

  let any_valid = false;
  let any_failed = false;
  let known_key_failed = false;

  for (const signature of list) {
    let valid = false;

    try {
      valid = (await signature.verified) === true;
    } catch {
      valid = false;
    }

    if (valid) {
      any_valid = true;
      continue;
    }

    any_failed = true;

    if (made_by_known_key(signature, keys)) known_key_failed = true;
  }

  if (known_key_failed) return { status: "invalid", has_signature: true };
  if (any_valid) return { status: "verified", has_signature: true };
  if (any_failed) return { status: "invalid", has_signature: true };

  return { status: "unknown", has_signature: true };
}
