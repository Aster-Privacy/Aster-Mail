//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//

import type { EncryptedVault } from "./key_manager";
import type { ApiResponse } from "@/services/api/client/helpers";

import { get_codes_status, save_recovery_backup } from "../api/recovery";
import { get_sync_format_readiness } from "../api/sync_format_readiness";

import { build_backup_vault } from "./backup_unlocked_keys";
import {
  get_vault_from_memory,
  get_vault_owner_id,
  on_vault_cleared,
} from "./memory_key_store";
import { carry_displaced_ratchet_keys } from "./ratchet_key_continuity";
import {
  backup_key_fingerprints_of,
  classify_recovery_backup_coverage,
  inbound_key_marks,
  read_recovery_backup_coverage,
  write_recovery_backup_coverage,
} from "./recovery_backup_coverage";
import {
  next_recovery_backup_binding,
  raise_recovery_backup_floor,
  type RecoveryBackupBinding,
} from "./recovery_backup_floor";
import {
  clear_recovery_key,
  encrypt_vault_backup,
  generate_all_recovery_shares,
  generate_recovery_key,
  type RecoveryShareOptions,
} from "./recovery_key";
import {
  read_latest_vault,
  vault_passphrase,
  write_vault_merged,
} from "./vault_cas_write";
import { on_vault_written, type VaultWrittenEvent } from "./vault_write_events";
import { with_vault_write_lock } from "./vault_write_lock";

import { ignore_error } from "@/lib/ignore_error";

export const RECOVERY_BACKUP_REFRESH_DELAY_MS = 1500;
export const BACKUP_DROPS_PUBLISHED_KEY = "backup_drops_published_key";

const KEY_FIELDS: (keyof EncryptedVault)[] = [
  "data_kek",
  "escrow_seed",
  "identity_key",
  "legacy_identity_keys",
  "legacy_keks",
  "prekey_seal_key",
  "previous_keys",
  "ratchet_identity_key",
  "ratchet_identity_public",
  "ratchet_pq_identity_key",
  "ratchet_pq_identity_public",
  "ratchet_pq_identity_seed",
  "ratchet_previous_keys",
  "ratchet_signed_prekey",
  "ratchet_signed_prekey_public",
  "signed_prekey",
  "signed_prekey_private",
];

type SaveOutcome = "saved" | "drops_published_key" | "failed";

let save_chain: Promise<unknown> = Promise.resolve();
let refresh_timer: ReturnType<typeof setTimeout> | null = null;
let refresh_running = false;
let refresh_again = false;
let refresh_idle: Promise<void> = Promise.resolve();
let last_backed_up: { user_id: string; digest: string } | null = null;
const coverage_checked = new Set<string>();

export function recovery_codes_of(vault: EncryptedVault): string[] {
  return (vault.recovery_codes ?? []).filter(
    (code) => typeof code === "string" && code.length > 0,
  );
}

export async function recovery_backup_binding_if_ready(
  user_id: string,
  known_generation = 0,
): Promise<RecoveryBackupBinding | null> {
  if (!user_id) return null;

  const binding = next_recovery_backup_binding(
    user_id,
    Math.max(
      known_generation,
      get_vault_from_memory()?.recovery_backup_generation ?? 0,
    ),
  );

  if (binding.generation > 1) return binding;

  const readiness = await get_sync_format_readiness();

  return readiness.recovery_backup_bound ? binding : null;
}

export async function current_recovery_backup_binding(
  vault?: EncryptedVault,
): Promise<RecoveryBackupBinding | null> {
  const { get_current_account } = await import("@/services/account_manager");

  return recovery_backup_binding_if_ready(
    (await get_current_account())?.user?.id ?? "",
    vault?.recovery_backup_generation ?? 0,
  );
}

export async function record_recovery_backup_generation(
  binding: RecoveryBackupBinding | null,
  vault: EncryptedVault | null,
  passphrase?: string,
): Promise<void> {
  if (!binding) return;

  raise_recovery_backup_floor(binding.user_id, binding.generation);

  const base = vault ?? get_vault_from_memory();

  if (!base) return;

  try {
    await write_vault_merged({
      next: { ...base, recovery_backup_generation: binding.generation },
      base,
      passphrase,
      user_id: binding.user_id,
    });
  } catch (caught) {
    ignore_error("services/crypto/recovery_backup_refresh:generation", caught);
  }
}

export async function stored_user_id_for_email(
  email: string,
): Promise<string | null> {
  const wanted = email.trim().toLowerCase();

  if (!wanted) return null;

  try {
    const { get_all_accounts } = await import("@/services/account_manager");
    const match = (await get_all_accounts()).find(
      (account) => account.user?.email?.trim().toLowerCase() === wanted,
    );

    return match?.user?.id ?? null;
  } catch (caught) {
    ignore_error("services/crypto/recovery_backup_refresh:accounts", caught);

    return null;
  }
}

async function current_set_share_options(): Promise<RecoveryShareOptions> {
  try {
    const status = (await get_codes_status({ skip_cache: true })).data;
    const salts = status?.verifier_salts ?? [];
    const first = salts[0];

    if (typeof first === "string" && salts.every((salt) => salt === first)) {
      return {
        verifier_salt: first,
        include_code_hash: status?.code_hash_optional !== true,
      };
    }
  } catch (caught) {
    ignore_error("services/crypto/recovery_backup_refresh:status", caught);
  }

  return { include_code_hash: true };
}

function key_material_of(vault: EncryptedVault): [string, unknown][] {
  return KEY_FIELDS.filter((field) => vault[field] !== undefined).map(
    (field) => [field, vault[field]],
  );
}

export function vault_key_material_changed(
  previous: EncryptedVault | null | undefined,
  next: EncryptedVault,
): boolean {
  if (!previous) return true;

  return (
    JSON.stringify(key_material_of(previous)) !==
    JSON.stringify(key_material_of(next))
  );
}

async function key_material_digest(vault: EncryptedVault): Promise<string> {
  const bytes = new TextEncoder().encode(
    JSON.stringify(key_material_of(vault)),
  );

  try {
    const digest = new Uint8Array(
      await crypto.subtle.digest("SHA-256", bytes as BufferSource),
    );

    return Array.from(digest, (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
  } finally {
    bytes.fill(0);
  }
}

async function is_already_backed_up(
  user_id: string,
  vault: EncryptedVault,
): Promise<boolean> {
  if (!last_backed_up || last_backed_up.user_id !== user_id) return false;

  return last_backed_up.digest === (await key_material_digest(vault));
}

export function is_backup_drops_published_key(
  response: ApiResponse<unknown>,
): boolean {
  if (response.status !== 409) return false;

  const body = response.body ?? {};
  const candidates = [
    response.server_code,
    body.code,
    body.error,
    response.error,
  ];

  return candidates.some(
    (value) =>
      typeof value === "string" && value.includes(BACKUP_DROPS_PUBLISHED_KEY),
  );
}

async function backup_owner_id(
  binding: RecoveryBackupBinding | null,
): Promise<string> {
  const owner = get_vault_owner_id() ?? binding?.user_id;

  if (owner) return owner;

  const { get_current_account } = await import("@/services/account_manager");

  return (await get_current_account())?.user?.id ?? "";
}

async function record_recovery_backup_coverage(
  binding: RecoveryBackupBinding | null,
  vault: EncryptedVault,
): Promise<void> {
  try {
    const user_id = await backup_owner_id(binding);

    if (!user_id) return;

    write_recovery_backup_coverage(user_id, await inbound_key_marks(vault));
    last_backed_up = { user_id, digest: await key_material_digest(vault) };
  } catch (caught) {
    ignore_error("services/crypto/recovery_backup_refresh:coverage", caught);
  }
}

async function save_backup_once(
  vault: EncryptedVault,
  passphrase: string,
  codes: string[],
): Promise<SaveOutcome> {
  const recovery_key = generate_recovery_key();

  try {
    const binding = await current_recovery_backup_binding(vault);
    const backup = await encrypt_vault_backup(
      await build_backup_vault(vault, passphrase),
      recovery_key,
      binding,
    );
    const shares = await generate_all_recovery_shares(
      codes,
      recovery_key,
      await current_set_share_options(),
    );
    const backup_key_fingerprints = await backup_key_fingerprints_of(vault);
    const response = await save_recovery_backup(
      backup.encrypted_data,
      backup.nonce,
      backup.salt,
      shares,
      backup_key_fingerprints.length ? { backup_key_fingerprints } : {},
    );

    if (is_backup_drops_published_key(response)) return "drops_published_key";

    if (response.error || response.data?.success !== true) return "failed";

    await record_recovery_backup_coverage(binding, vault);
    await record_recovery_backup_generation(binding, vault, passphrase);

    return "saved";
  } catch (caught) {
    ignore_error("services/crypto/recovery_backup_refresh", caught);

    return "failed";
  } finally {
    clear_recovery_key(recovery_key);
  }
}

async function merged_with_server(
  vault: EncryptedVault,
  passphrase: string,
): Promise<EncryptedVault> {
  let latest: EncryptedVault | null = null;

  try {
    latest = (await read_latest_vault(passphrase))?.vault ?? null;
  } catch (caught) {
    ignore_error("services/crypto/recovery_backup_refresh:refetch", caught);
  }

  const base = latest ? carry_displaced_ratchet_keys(latest, vault) : vault;

  return carry_displaced_ratchet_keys(base, get_vault_from_memory());
}

function serialized<T>(fn: () => Promise<T>): Promise<T> {
  const next = save_chain.then(fn, fn);

  save_chain = next.then(
    () => undefined,
    () => undefined,
  );

  return next;
}

async function save_with_retry(
  vault: EncryptedVault,
  passphrase: string,
): Promise<boolean> {
  const codes = recovery_codes_of(vault);

  if (codes.length === 0) return false;

  let outcome = await save_backup_once(vault, passphrase, codes);

  if (outcome === "drops_published_key") {
    const merged = await merged_with_server(vault, passphrase);
    const retry_codes = recovery_codes_of(merged);

    if (retry_codes.length === 0) return false;

    outcome = await save_backup_once(merged, passphrase, retry_codes);
  }

  return outcome === "saved";
}

export function refresh_recovery_backup(
  vault: EncryptedVault,
  passphrase: string,
): Promise<boolean> {
  if (recovery_codes_of(vault).length === 0) return Promise.resolve(false);

  return serialized(() => save_with_retry(vault, passphrase));
}

export async function reseal_unbound_recovery_backup(
  vault: EncryptedVault,
  passphrase: string,
): Promise<boolean> {
  if ((vault.recovery_backup_generation ?? 0) > 0) return false;

  if (recovery_codes_of(vault).length === 0) return false;

  const readiness = await get_sync_format_readiness();

  if (!readiness.recovery_backup_bound) return false;

  return refresh_recovery_backup(vault, passphrase);
}

async function refresh_from_latest_vault(): Promise<void> {
  const passphrase = vault_passphrase();
  const user_id = get_vault_owner_id();

  if (!passphrase || !user_id) return;

  await with_vault_write_lock(async () => {
    const latest = await read_latest_vault(passphrase);

    if (!latest || get_vault_owner_id() !== user_id) return;
    if (recovery_codes_of(latest.vault).length === 0) return;
    if (await is_already_backed_up(user_id, latest.vault)) return;

    await refresh_recovery_backup(latest.vault, passphrase);
  });
}

async function drain_refreshes(): Promise<void> {
  refresh_running = true;

  try {
    do {
      refresh_again = false;

      try {
        await refresh_from_latest_vault();
      } catch (caught) {
        ignore_error("services/crypto/recovery_backup_refresh:run", caught);
      }
    } while (refresh_again);
  } finally {
    refresh_running = false;
  }
}

export function schedule_recovery_backup_refresh(
  delay_ms = RECOVERY_BACKUP_REFRESH_DELAY_MS,
): void {
  if (refresh_running) {
    refresh_again = true;

    return;
  }

  if (refresh_timer) clearTimeout(refresh_timer);

  refresh_timer = setTimeout(() => {
    refresh_timer = null;

    if (refresh_running) {
      refresh_again = true;

      return;
    }

    refresh_idle = drain_refreshes();
  }, delay_ms);
}

export async function wait_for_recovery_backup_refresh(): Promise<void> {
  for (;;) {
    const idle = refresh_idle;
    const chain = save_chain;

    await idle;
    await chain;

    if (idle === refresh_idle && chain === save_chain && !refresh_running) {
      return;
    }
  }
}

function handle_vault_written(event: VaultWrittenEvent): void {
  if (recovery_codes_of(event.vault).length === 0) return;
  if (!vault_key_material_changed(event.previous, event.vault)) return;

  schedule_recovery_backup_refresh();
}

export function backup_needs_catch_up(
  covers: boolean | null | undefined,
  marks: string[],
  recorded: string[] | null,
): boolean {
  const coverage = classify_recovery_backup_coverage(marks, recorded);

  if (coverage === "would_shrink" || coverage === "unknown") return false;
  if (covers === false || covers === null) return true;
  if (covers === true) return recorded !== null && coverage === "uncovered";

  return coverage === "uncovered";
}

async function catch_up_from_latest_vault(
  user_id: string,
  covers: boolean | null | undefined,
): Promise<boolean> {
  const passphrase = vault_passphrase();

  if (!passphrase) return false;

  return with_vault_write_lock(async () => {
    const latest = await read_latest_vault(passphrase);

    if (!latest || get_vault_owner_id() !== user_id) return false;
    if (recovery_codes_of(latest.vault).length === 0) return false;

    const needed = backup_needs_catch_up(
      covers,
      await inbound_key_marks(latest.vault),
      read_recovery_backup_coverage(user_id),
    );

    if (!needed) {
      return reseal_unbound_recovery_backup(latest.vault, passphrase);
    }

    return refresh_recovery_backup(latest.vault, passphrase);
  });
}

export async function check_recovery_backup_coverage(): Promise<boolean> {
  const user_id = get_vault_owner_id();

  if (!user_id || coverage_checked.has(user_id)) return false;

  coverage_checked.add(user_id);

  try {
    const vault = get_vault_from_memory();

    if (!vault || recovery_codes_of(vault).length === 0) return false;

    const response = await get_codes_status({ skip_cache: true });

    if (response.error || !response.data) {
      coverage_checked.delete(user_id);

      return false;
    }

    return await catch_up_from_latest_vault(
      user_id,
      response.data.backup_covers_published_keys,
    );
  } catch (caught) {
    ignore_error("services/crypto/recovery_backup_refresh:check", caught);

    return false;
  }
}

function clear_refresh_state(): void {
  if (refresh_timer) clearTimeout(refresh_timer);

  refresh_timer = null;
  last_backed_up = null;
  coverage_checked.clear();
}

export function reset_recovery_backup_refresh_state(): void {
  refresh_again = false;
  clear_refresh_state();
}

function handle_vault_cleared(event: { same_owner: boolean }): void {
  if (event.same_owner) return;

  clear_refresh_state();
}

try {
  on_vault_written(handle_vault_written);
  on_vault_cleared(handle_vault_cleared);
} catch (caught) {
  ignore_error("services/crypto/recovery_backup_refresh:listen", caught);
}
