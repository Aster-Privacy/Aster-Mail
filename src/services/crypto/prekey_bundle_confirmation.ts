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

import { get_current_account } from "../account_manager";

import { get_vault_from_memory } from "./memory_key_store";
import {
  clear_ratchet_lookup_misses,
  read_own_published_bundle,
  upload_prekey_bundle,
} from "./ratchet_prekey_bundle";

export const PREKEY_CONFIRM_DELAYS_MS: readonly number[] = [
  5000, 15000, 45000, 120000, 300000,
];
export const PREKEY_CONFIRM_MAX_ATTEMPTS = 15;

export type PublishedPqState = "confirmed" | "missing" | "unknown";

export async function published_pq_state(
  vault: EncryptedVault,
  email: string,
): Promise<PublishedPqState> {
  const read = await read_own_published_bundle(email);

  if (read.status === "unavailable") return "unknown";
  if (read.status === "missing") return "missing";

  const published = read.identity;
  const matches =
    !!vault.ratchet_pq_identity_public &&
    !!published.pq_kem_public_key &&
    published.pq_kem_public_key === vault.ratchet_pq_identity_public &&
    published.kem_identity_key === vault.ratchet_identity_public &&
    published.signed_prekey === vault.ratchet_signed_prekey_public;

  return matches ? "confirmed" : "missing";
}

export interface PrekeyConfirmOptions {
  delays_ms?: readonly number[];
  max_attempts?: number;
  sleep?: (ms: number) => Promise<void>;
}

function default_sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function keep_publishing_until_confirmed(
  registered_vault: EncryptedVault,
  options: PrekeyConfirmOptions = {},
): Promise<boolean> {
  const delays = options.delays_ms ?? PREKEY_CONFIRM_DELAYS_MS;
  const max_attempts = options.max_attempts ?? PREKEY_CONFIRM_MAX_ATTEMPTS;
  const sleep = options.sleep ?? default_sleep;

  const account = await get_current_account();
  const user_id = account?.user?.id;
  const email = account?.user?.email;

  if (!user_id || !email) return false;

  for (let attempt = 0; attempt < max_attempts; attempt++) {
    if (attempt > 0 && delays.length > 0) {
      await sleep(delays[Math.min(attempt - 1, delays.length - 1)]);
    }

    try {
      const current = await get_current_account();

      if (current?.user?.id !== user_id) return false;

      const vault = get_vault_from_memory() ?? registered_vault;

      if (
        !vault.ratchet_identity_public ||
        !vault.ratchet_signed_prekey_public ||
        !vault.ratchet_pq_identity_public
      ) {
        continue;
      }

      const state = await published_pq_state(vault, email);

      if (state === "confirmed") {
        clear_ratchet_lookup_misses();

        return true;
      }

      if (state === "missing") await upload_prekey_bundle(vault);
    } catch {
      continue;
    }
  }

  return false;
}
