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
import type { ExternalKeyInfo } from "./api/keys";

import { load_openpgp } from "./crypto/openpgp_loader";
import {
  lookup_saved_key,
  owner_key_fingerprint,
} from "./crypto/ratchet_identity_pin";

const OPPORTUNISTIC_KEY_SOURCES: ReadonlySet<string> = new Set([
  "aster",
  "autocrypt",
  "dane",
  "manual",
  "wkd",
]);

export function is_recipient_controlled_key(
  info: ExternalKeyInfo | undefined,
  now: number = Date.now(),
): info is ExternalKeyInfo & { public_key: string } {
  if (!info?.found || !info.public_key) return false;
  if (info.expires_at !== null && !(Date.parse(info.expires_at) > now)) {
    return false;
  }

  return OPPORTUNISTIC_KEY_SOURCES.has((info.source ?? "").toLowerCase());
}

export function trusts_key_for_opportunistic(
  info: ExternalKeyInfo | undefined,
  encrypt_by_default: boolean,
  now: number = Date.now(),
): boolean {
  return encrypt_by_default && is_recipient_controlled_key(info, now);
}

export function will_encrypt_opportunistically(
  info: ExternalKeyInfo | undefined,
  encrypt_by_default: boolean,
  now: number = Date.now(),
): boolean {
  return trusts_key_for_opportunistic(info, encrypt_by_default, now);
}

const ADDRESS_IN_USER_ID = /<([^<>\s]+@[^<>\s]+)>\s*$/;

function user_id_address(user_id: string): string {
  const bracketed = ADDRESS_IN_USER_ID.exec(user_id);

  return (bracketed ? bracketed[1] : user_id).trim().toLowerCase();
}

export async function key_names_address(
  armored_public_key: string,
  address: string,
): Promise<boolean> {
  const wanted = address.trim().toLowerCase();

  if (!armored_public_key || !wanted) return false;

  try {
    const openpgp = await load_openpgp();
    const key = await openpgp.readKey({ armoredKey: armored_public_key });

    return key
      .getUserIDs()
      .some((user_id) => user_id_address(user_id) === wanted);
  } catch {
    return false;
  }
}

export type ExternalKeyTrust = "pinned" | "unpinned" | "changed" | "unreadable";

export async function external_key_trust(
  address: string,
  armored_public_key: string,
): Promise<ExternalKeyTrust> {
  const saved = await lookup_saved_key(address.trim().toLowerCase());

  if (saved === "unreadable") return "unreadable";
  if (saved === null || !saved.owner) return "unpinned";

  try {
    const fingerprint = await owner_key_fingerprint(armored_public_key);

    return !saved.conflict && saved.fingerprint === fingerprint
      ? "pinned"
      : "changed";
  } catch {
    return "unreadable";
  }
}

export type OpportunisticLockStatus =
  | "encrypted"
  | "available"
  | "key_invalid"
  | "transit";

export async function opportunistic_lock_status(
  info: ExternalKeyInfo,
  encrypt_by_default: boolean,
  now: number = Date.now(),
): Promise<OpportunisticLockStatus> {
  if (!info.found || !info.public_key) return "transit";
  if (info.expires_at !== null && !(Date.parse(info.expires_at) > now)) {
    return "key_invalid";
  }

  const trust = await external_key_trust(info.email, info.public_key);

  if (trust === "changed") return "key_invalid";
  if (!will_encrypt_opportunistically(info, encrypt_by_default, now)) {
    return "available";
  }
  if (!(await key_names_address(info.public_key, info.email))) {
    return "available";
  }

  return trust === "pinned" ? "encrypted" : "available";
}
