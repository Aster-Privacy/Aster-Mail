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
import type { AccountKeyTokenResponse } from "@/services/api/account_key";

import { get_current_account } from "../account_manager";

import { ACCOUNT_KEY_LENGTH } from "./account_data_key";
import {
  compare_account_key_token_rank,
  open_account_key_token,
  open_ranked_account_key_token,
  seal_account_key_token,
  type AccountKeyTokenRank,
} from "./account_key_token";
import {
  get_account_key_generation,
  get_account_write_epoch,
  load_account_key_derived_keks_into_memory,
} from "./legacy_keks";
import { sync_recovery_escrow } from "./recovery_escrow";
import { zero_uint8_array } from "./secure_memory";

import { load_openpgp } from "@/services/crypto/openpgp_loader";
import {
  MAX_ACCOUNT_KEY_HISTORY,
  get_account_key_token,
  get_account_key_token_history,
  put_account_key_token_if_absent,
} from "@/services/api/account_key";

function same_bytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;

  let diff = 0;

  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];

  return diff === 0;
}

async function primary_fingerprint(armored: string): Promise<string | null> {
  const openpgp = await load_openpgp();

  try {
    const key = await openpgp.readKey({ armoredKey: armored });

    return key.getFingerprint().toLowerCase();
  } catch {
    return null;
  }
}

export async function account_key_owner_keys(
  vault: EncryptedVault,
): Promise<string[]> {
  const active = [vault.identity_key, ...(vault.previous_keys ?? [])].filter(
    (k): k is string => !!k,
  );
  const legacy = (vault.legacy_identity_keys ?? []).filter(
    (k) => !!k && !active.includes(k),
  );

  if (legacy.length === 0) return active;

  const active_fingerprints = new Set(
    (await Promise.all(active.map(primary_fingerprint))).filter(
      (f): f is string => !!f,
    ),
  );
  const same_key_history: string[] = [];

  for (const armored of legacy) {
    const fingerprint = await primary_fingerprint(armored);

    if (fingerprint && active_fingerprints.has(fingerprint)) {
      same_key_history.push(armored);
    }
  }

  return [...active, ...same_key_history];
}

async function create_account_key_if_absent(
  identity_key: string,
  passphrase: string,
  generation: number,
): Promise<AccountKeyTokenResponse | null> {
  try {
    const history = await get_account_key_token_history();

    if (history.length > 0) return null;
  } catch {
    return null;
  }

  const openpgp = await load_openpgp();
  const account_key = crypto.getRandomValues(
    new Uint8Array(ACCOUNT_KEY_LENGTH),
  );
  let reopened: Uint8Array | null = null;

  try {
    const token = await seal_account_key_token(
      account_key,
      identity_key,
      passphrase,
    );

    reopened = await open_account_key_token(token, [identity_key], passphrase);
    if (!reopened || !same_bytes(reopened, account_key)) return null;

    const private_key = await openpgp.readPrivateKey({
      armoredKey: identity_key,
    });
    const key_fingerprint = private_key.getFingerprint().toLowerCase();

    if (generation !== get_account_key_generation()) return null;

    return await put_account_key_token_if_absent(token, key_fingerprint);
  } catch {
    return null;
  } finally {
    zero_uint8_array(account_key);
    if (reopened) zero_uint8_array(reopened);
  }
}

async function current_user_id(): Promise<string | null> {
  try {
    return (await get_current_account())?.user?.id ?? null;
  } catch {
    return null;
  }
}

const TOKEN_FLOOR_KEY_PREFIX = "astermail_account_key_floor:";

function read_token_floor(user_id: string | null): AccountKeyTokenRank | null {
  if (!user_id) return null;

  try {
    const parsed: unknown = JSON.parse(
      localStorage.getItem(TOKEN_FLOOR_KEY_PREFIX + user_id) ?? "null",
    );

    if (!parsed || typeof parsed !== "object") return null;

    const { version, serial } = parsed as Partial<AccountKeyTokenRank>;

    if (!Number.isSafeInteger(version) || !Number.isSafeInteger(serial)) {
      return null;
    }

    return { version: version as number, serial: serial as number };
  } catch {
    return null;
  }
}

function write_token_floor(user_id: string | null, rank: AccountKeyTokenRank) {
  if (!user_id) return;

  try {
    localStorage.setItem(
      TOKEN_FLOOR_KEY_PREFIX + user_id,
      JSON.stringify({ version: rank.version, serial: rank.serial }),
    );
  } catch {
    return;
  }
}

function higher_rank(
  a: AccountKeyTokenRank | null,
  b: AccountKeyTokenRank | null,
): AccountKeyTokenRank | null {
  if (!a) return b;
  if (!b) return a;

  return compare_account_key_token_rank(a, b) >= 0 ? a : b;
}

function meets_floor(
  rank: AccountKeyTokenRank,
  floor: AccountKeyTokenRank | null,
): boolean {
  return !floor || compare_account_key_token_rank(rank, floor) >= 0;
}

async function load_token(
  token: string,
  own_keys: string[],
  passphrase: string,
  generation: number,
  write_epoch: number | null = null,
  floor: AccountKeyTokenRank | null = null,
): Promise<AccountKeyTokenRank | null> {
  const opened = await open_ranked_account_key_token(
    token,
    own_keys,
    passphrase,
  );

  if (!opened) return null;

  const rank = { version: opened.version, serial: opened.serial };

  try {
    const loaded = await load_account_key_derived_keks_into_memory(
      opened.key,
      generation,
      meets_floor(rank, floor) ? write_epoch : null,
    );

    return loaded ? rank : null;
  } finally {
    zero_uint8_array(opened.key);
  }
}

async function sync_escrow(
  vault: EncryptedVault,
  passphrase: string,
  token: AccountKeyTokenResponse,
  own_keys: string[],
): Promise<void> {
  const user_id = await current_user_id();

  if (!user_id) return;

  try {
    await sync_recovery_escrow(user_id, vault, passphrase, token, own_keys);
  } catch {
    return;
  }
}

export async function load_account_keys_for_session(
  vault: EncryptedVault,
  passphrase: string,
): Promise<number> {
  const generation = get_account_key_generation();
  const write_epoch = get_account_write_epoch();
  const own_keys = await account_key_owner_keys(vault);
  let current = await get_account_key_token();

  if (generation !== get_account_key_generation()) return 0;

  if (!current) {
    if (!vault.identity_key) return 0;

    current = await create_account_key_if_absent(
      vault.identity_key,
      passphrase,
      generation,
    );

    if (!current || generation !== get_account_key_generation()) return 0;
  }

  const user_id = await current_user_id();
  const floor = read_token_floor(user_id);
  let loaded = 0;
  const current_rank = await load_token(
    current.token,
    own_keys,
    passphrase,
    generation,
    write_epoch,
    floor,
  );

  if (current_rank) loaded += 1;

  void sync_escrow(vault, passphrase, current, own_keys);

  const history = await get_account_key_token_history();
  let best_history: { token: string; rank: AccountKeyTokenRank } | null = null;

  for (const entry of history.slice(0, MAX_ACCOUNT_KEY_HISTORY)) {
    if (generation !== get_account_key_generation()) break;

    const rank = await load_token(entry.token, own_keys, passphrase, generation);

    if (!rank) continue;

    loaded += 1;

    if (
      !best_history ||
      compare_account_key_token_rank(rank, best_history.rank) > 0
    ) {
      best_history = { token: entry.token, rank };
    }
  }

  if (
    best_history &&
    meets_floor(best_history.rank, floor) &&
    (!current_rank ||
      !meets_floor(current_rank, floor) ||
      compare_account_key_token_rank(best_history.rank, current_rank) > 0) &&
    generation === get_account_key_generation()
  ) {
    await load_token(
      best_history.token,
      own_keys,
      passphrase,
      generation,
      write_epoch,
      floor,
    );
  }

  const observed = higher_rank(current_rank, best_history?.rank ?? null);
  const next_floor = higher_rank(floor, observed);

  if (next_floor && generation === get_account_key_generation()) {
    write_token_floor(user_id, next_floor);
  }

  return loaded;
}
