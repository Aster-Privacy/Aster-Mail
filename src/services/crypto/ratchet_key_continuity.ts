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
import type { EncryptedVault, RatchetKeySet } from "./key_manager_core";

import { RATCHET_PREVIOUS_KEYS_LIMIT } from "./key_manager_core";

export function current_ratchet_key_set(
  vault: EncryptedVault | null | undefined,
): RatchetKeySet | null {
  if (
    !vault?.ratchet_identity_key ||
    !vault.ratchet_identity_public ||
    !vault.ratchet_signed_prekey ||
    !vault.ratchet_signed_prekey_public
  ) {
    return null;
  }

  return {
    ratchet_identity_key: vault.ratchet_identity_key,
    ratchet_identity_public: vault.ratchet_identity_public,
    ratchet_signed_prekey: vault.ratchet_signed_prekey,
    ratchet_signed_prekey_public: vault.ratchet_signed_prekey_public,
    ratchet_pq_identity_key: vault.ratchet_pq_identity_key,
    ratchet_pq_identity_public: vault.ratchet_pq_identity_public,
    ratchet_pq_identity_seed: vault.ratchet_pq_identity_seed,
  };
}

function key_set_id(set: {
  ratchet_identity_public?: string;
  ratchet_signed_prekey_public?: string;
  ratchet_pq_identity_public?: string;
}): string {
  return [
    set.ratchet_identity_public ?? "",
    set.ratchet_signed_prekey_public ?? "",
    set.ratchet_pq_identity_public ?? "",
  ].join("|");
}

function fill_missing_fields(
  kept: RatchetKeySet,
  incoming: RatchetKeySet,
): RatchetKeySet {
  return {
    ratchet_identity_key:
      kept.ratchet_identity_key || incoming.ratchet_identity_key,
    ratchet_identity_public: kept.ratchet_identity_public,
    ratchet_signed_prekey:
      kept.ratchet_signed_prekey || incoming.ratchet_signed_prekey,
    ratchet_signed_prekey_public:
      kept.ratchet_signed_prekey_public ||
      incoming.ratchet_signed_prekey_public,
    ratchet_pq_identity_key:
      kept.ratchet_pq_identity_key ?? incoming.ratchet_pq_identity_key,
    ratchet_pq_identity_public:
      kept.ratchet_pq_identity_public ?? incoming.ratchet_pq_identity_public,
    ratchet_pq_identity_seed:
      kept.ratchet_pq_identity_seed ?? incoming.ratchet_pq_identity_seed,
  };
}

export function merge_ratchet_key_history(
  current: RatchetKeySet | null,
  ...groups: Array<RatchetKeySet[] | undefined>
): RatchetKeySet[] {
  const current_id = current ? key_set_id(current) : null;
  const by_id = new Map<string, RatchetKeySet>();

  for (const set of groups.flatMap((group) => group ?? [])) {
    if (!set?.ratchet_identity_public) continue;

    const id = key_set_id(set);

    if (id === current_id) continue;

    const existing = by_id.get(id);

    by_id.set(id, existing ? fill_missing_fields(existing, set) : set);
  }

  const merged = [...by_id.values()];
  const identities_with_prekey = new Set(
    merged
      .filter(
        (set) => set.ratchet_signed_prekey && set.ratchet_signed_prekey_public,
      )
      .map((set) => set.ratchet_identity_public),
  );

  return merged
    .filter(
      (set) =>
        (set.ratchet_signed_prekey && set.ratchet_signed_prekey_public) ||
        !identities_with_prekey.has(set.ratchet_identity_public),
    )
    .slice(0, RATCHET_PREVIOUS_KEYS_LIMIT);
}

export function retain_replaced_ratchet_keys(
  replaced: EncryptedVault,
  next: EncryptedVault,
): RatchetKeySet[] | undefined {
  const replaced_set = current_ratchet_key_set(replaced);
  const merged = merge_ratchet_key_history(
    current_ratchet_key_set(next),
    replaced_set ? [replaced_set] : undefined,
    next.ratchet_previous_keys,
    replaced.ratchet_previous_keys,
  );

  return merged.length ? merged : next.ratchet_previous_keys;
}

function vaults_share_account(
  target: EncryptedVault,
  displaced: EncryptedVault,
): boolean {
  if (!target.identity_key || !displaced.identity_key) return false;

  if (target.identity_key === displaced.identity_key) return true;

  return (
    (target.previous_keys ?? []).includes(displaced.identity_key) ||
    (displaced.previous_keys ?? []).includes(target.identity_key)
  );
}

export function carry_displaced_ratchet_keys(
  target: EncryptedVault,
  displaced: EncryptedVault | null | undefined,
): EncryptedVault {
  if (!displaced || !vaults_share_account(target, displaced)) return target;

  const ratchet_previous_keys = retain_replaced_ratchet_keys(
    displaced,
    target,
  );

  if (!ratchet_previous_keys?.length) return target;

  return { ...target, ratchet_previous_keys };
}

export function vault_holds_ratchet_keys(
  holder: EncryptedVault | null | undefined,
  published: EncryptedVault,
): boolean {
  if (!holder || !published.ratchet_identity_public) return false;

  if (
    !holder.ratchet_identity_key ||
    !holder.ratchet_signed_prekey ||
    holder.ratchet_identity_public !== published.ratchet_identity_public ||
    holder.ratchet_signed_prekey_public !==
      published.ratchet_signed_prekey_public
  ) {
    return false;
  }

  const published_pq = published.ratchet_pq_identity_public ?? null;

  if ((holder.ratchet_pq_identity_public ?? null) !== published_pq) {
    return false;
  }

  if (!published_pq) return true;

  return Boolean(
    holder.ratchet_pq_identity_key || holder.ratchet_pq_identity_seed,
  );
}
