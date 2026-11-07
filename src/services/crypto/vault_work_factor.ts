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
import type { EncryptedVault } from "./key_manager";
import type { ApiResponse } from "@/services/api/client/helpers";

import {
  VAULT_KDF_ITERATIONS_LEGACY,
  VAULT_KDF_ITERATIONS_LEVEL2,
  is_level2_admitted,
  is_level2_refusal,
  mark_level2_refused,
  note_vault_written,
  parse_vault_kdf_iterations,
  type SealedVault,
  type VaultKdfIterations,
} from "./vault_level2";

export const VAULT_CHANGED = "VAULT_CHANGED";

const BACKOFF_KEY_PREFIX = "astermail_vault_work_factor_backoff_";

export const VAULT_WORK_FACTOR_BACKOFF_BASE_MS = 60 * 60 * 1000;
export const VAULT_WORK_FACTOR_BACKOFF_MAX_MS = 7 * 24 * 60 * 60 * 1000;

export type VaultWorkFactorResult =
  | "upgraded"
  | "already"
  | "changed"
  | "refused"
  | "unavailable"
  | "backoff"
  | "failed";

export interface CurrentVaultView {
  encrypted_vault?: string;
  vault_nonce?: string;
  vault_format?: number;
  vault_sha256?: string;
  vault_kdf_iterations?: number | null;
}

type KeyValueStore = Pick<Storage, "getItem" | "setItem"> &
  Partial<Pick<Storage, "removeItem">>;

export interface VaultWorkFactorBackoff {
  failures: number;
  next_at: number;
}

export interface VaultWorkFactorDeps {
  fetch_vault: () => Promise<ApiResponse<CurrentVaultView>>;
  put_vault: (body: Record<string, unknown>) => Promise<ApiResponse<unknown>>;
  get_passphrase: () => string | null;
  decrypt: (
    encrypted_vault: string,
    vault_nonce: string,
    passphrase: string,
    iterations: VaultKdfIterations,
  ) => Promise<EncryptedVault>;
  encrypt: (
    vault: EncryptedVault,
    passphrase: string,
    iterations: VaultKdfIterations,
  ) => Promise<SealedVault>;
  key_fingerprints: (vault: EncryptedVault) => Promise<string[]>;
  on_written: (
    vault: EncryptedVault,
    sealed: SealedVault,
    passphrase: string,
  ) => Promise<void>;
  storage: () => KeyValueStore | null;
  now?: () => number;
}

function backoff_key(user_id: string): string {
  return `${BACKOFF_KEY_PREFIX}${user_id}`;
}

export function vault_work_factor_backoff_ms(failures: number): number {
  const exponent = Math.max(0, Math.min(failures - 1, 16));

  return Math.min(
    VAULT_WORK_FACTOR_BACKOFF_BASE_MS * 2 ** exponent,
    VAULT_WORK_FACTOR_BACKOFF_MAX_MS,
  );
}

export function read_vault_work_factor_backoff(
  store: KeyValueStore | null,
  user_id: string,
): VaultWorkFactorBackoff | null {
  try {
    const raw = store?.getItem(backoff_key(user_id));

    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<VaultWorkFactorBackoff>;

    if (
      typeof parsed.failures !== "number" ||
      !Number.isInteger(parsed.failures) ||
      parsed.failures < 1 ||
      typeof parsed.next_at !== "number" ||
      !Number.isFinite(parsed.next_at)
    ) {
      return null;
    }

    return { failures: parsed.failures, next_at: parsed.next_at };
  } catch {
    return null;
  }
}

function record_failure(
  store: KeyValueStore | null,
  user_id: string,
  now: number,
): void {
  const failures =
    (read_vault_work_factor_backoff(store, user_id)?.failures ?? 0) + 1;
  const next: VaultWorkFactorBackoff = {
    failures,
    next_at: now + vault_work_factor_backoff_ms(failures),
  };

  try {
    store?.setItem(backoff_key(user_id), JSON.stringify(next));
  } catch {
    return;
  }
}

function clear_backoff(store: KeyValueStore | null, user_id: string): void {
  try {
    store?.removeItem?.(backoff_key(user_id));
  } catch {
    return;
  }
}

function same_vault(a: EncryptedVault, b: EncryptedVault): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export async function upgrade_vault_work_factor(
  user_id: string,
  deps: VaultWorkFactorDeps,
): Promise<VaultWorkFactorResult> {
  if (!user_id || !is_level2_admitted()) return "unavailable";

  const store = deps.storage();
  const now = deps.now ?? Date.now;
  const backoff = read_vault_work_factor_backoff(store, user_id);

  if (backoff && now() < backoff.next_at) return "backoff";

  const result = await attempt_vault_work_factor(user_id, deps);

  if (result === "failed") {
    record_failure(store, user_id, now());
  } else if (result === "upgraded" || result === "already") {
    clear_backoff(store, user_id);
  }

  return result;
}

async function attempt_vault_work_factor(
  user_id: string,
  deps: VaultWorkFactorDeps,
): Promise<VaultWorkFactorResult> {
  const passphrase = deps.get_passphrase();

  if (!passphrase) return "unavailable";

  try {
    const current = await deps.fetch_vault();
    const view = current.data;

    if (current.error || !view?.encrypted_vault || !view.vault_nonce) {
      return "unavailable";
    }

    if (
      parse_vault_kdf_iterations(view.vault_kdf_iterations) ===
      VAULT_KDF_ITERATIONS_LEVEL2
    ) {
      return "already";
    }

    if (!view.vault_sha256) return "unavailable";

    const vault = await deps.decrypt(
      view.encrypted_vault,
      view.vault_nonce,
      passphrase,
      VAULT_KDF_ITERATIONS_LEGACY,
    );
    const sealed = await deps.encrypt(
      vault,
      passphrase,
      VAULT_KDF_ITERATIONS_LEVEL2,
    );
    const roundtrip = await deps.decrypt(
      sealed.encrypted_vault,
      sealed.vault_nonce,
      passphrase,
      VAULT_KDF_ITERATIONS_LEVEL2,
    );

    if (!same_vault(roundtrip, vault)) return "failed";

    const fingerprints = await deps.key_fingerprints(vault);
    const response = await deps.put_vault({
      encrypted_vault: sealed.encrypted_vault,
      vault_nonce: sealed.vault_nonce,
      expected_user_id: user_id,
      vault_format: view.vault_format ?? vault.vault_format ?? 1,
      preserve_pq_prekeys: true,
      vault_kdf_iterations: VAULT_KDF_ITERATIONS_LEVEL2,
      expected_vault_sha256: view.vault_sha256,
      ...(fingerprints.length ? { vault_key_fingerprints: fingerprints } : {}),
    });

    if (!response.error) {
      note_vault_written(sealed, VAULT_KDF_ITERATIONS_LEVEL2);
      await deps.on_written(vault, sealed, passphrase);

      return "upgraded";
    }

    if (is_level2_refusal(response)) {
      mark_level2_refused();

      return "refused";
    }

    if (response.status === 409 && response.server_code === VAULT_CHANGED) {
      return "changed";
    }

    return "failed";
  } catch {
    return "failed";
  }
}

let in_flight: Promise<VaultWorkFactorResult> | null = null;

export function run_vault_work_factor_once(
  user_id: string,
  deps: VaultWorkFactorDeps,
): Promise<VaultWorkFactorResult> {
  if (in_flight) return in_flight;

  in_flight = upgrade_vault_work_factor(user_id, deps).finally(() => {
    in_flight = null;
  });

  return in_flight;
}
