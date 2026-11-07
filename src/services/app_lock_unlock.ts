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
import {
  attempt_pin_unlock,
  clear_app_lock_config,
  clear_session_unlock,
  derive_wrapped_pin_key,
  duress_pin_correct,
  encode_hex,
  ensure_pepper,
  generate_pin_salt,
  get_app_lock_config,
  is_server_wrapped_config,
  KDF_VERSION_PEPPER,
  KDF_VERSION_SERVER_WRAP,
  mark_session_unlocked,
  pin_matches_regular,
  reset_app_lock_attempts,
  save_app_lock_config,
  verify_pin,
  type AppLockConfig,
  type AppLockWrapInfo,
} from "@/services/app_lock_store";
import {
  APP_LOCK_FIELD_BYTES,
  base64_to_bytes,
  bytes_to_base64,
  clear_pending_passphrase,
  derive_pin_key,
  derive_proof,
  derive_verifier,
  derive_wrap_key,
  forget_all_unlocked_locks,
  forget_unlocked_lock,
  get_pending_passphrase,
  get_unlocked_key,
  get_unlocked_verifier,
  has_unlock_waiters,
  open_wrapped_passphrase,
  read_wrapped_record,
  remove_wrapped_passphrase,
  set_pending_passphrase,
  set_unlocked_lock,
  settle_app_unlock,
  write_wrapped_passphrase,
} from "@/services/app_lock_wrap";
import {
  delete_app_lock,
  register_app_lock,
  unwrap_app_lock,
} from "@/services/app_lock_server";
import {
  get_session_passphrase,
  get_stored_encrypted_vault,
  is_session_passphrase_on_device,
  remove_unwrapped_passphrase,
  store_unwrapped_passphrase,
} from "@/contexts/auth/session_passphrase";
import { decrypt_vault } from "@/services/crypto/key_manager";
import {
  restore_device_passphrase,
  seal_device_passphrase,
} from "@/native/desktop_device_auth";
import { MAIL_EVENTS } from "@/hooks/mail_events";
import {
  safe_local_get,
  safe_local_remove,
  safe_local_set,
} from "@/lib/safe_storage";
import {
  clear_vault_from_memory,
  get_passphrase_from_memory,
} from "@/services/crypto/memory_key_store";

const RELEASE_TIMEOUT_MS = 4000;
const PENDING_DELETES_KEY = "astermail_app_lock_pending_deletes";
const MAX_PENDING_DELETES = 20;
const PENDING_DELETE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

interface PendingAppLockDelete {
  account_id: string;
  device_lock_id: string;
  queued_at: number;
}

const released_lock_ids = new Set<string>();

function is_pending_delete(entry: unknown): entry is PendingAppLockDelete {
  if (!entry || typeof entry !== "object") return false;
  const candidate = entry as Record<string, unknown>;

  return (
    typeof candidate.account_id === "string" &&
    typeof candidate.device_lock_id === "string" &&
    typeof candidate.queued_at === "number"
  );
}

function read_pending_deletes(): PendingAppLockDelete[] {
  try {
    const parsed: unknown = JSON.parse(
      safe_local_get(PENDING_DELETES_KEY) ?? "[]",
    );

    if (!Array.isArray(parsed)) return [];
    const now = Date.now();

    return parsed
      .filter(is_pending_delete)
      .filter((entry) => now - entry.queued_at < PENDING_DELETE_TTL_MS);
  } catch {
    return [];
  }
}

function write_pending_deletes(entries: PendingAppLockDelete[]): void {
  if (entries.length === 0) {
    safe_local_remove(PENDING_DELETES_KEY);

    return;
  }
  safe_local_set(
    PENDING_DELETES_KEY,
    JSON.stringify(entries.slice(-MAX_PENDING_DELETES)),
  );
}

function queue_app_lock_delete(account_id: string, device_lock_id: string): void {
  const entries = read_pending_deletes().filter(
    (entry) => entry.device_lock_id !== device_lock_id,
  );

  entries.push({ account_id, device_lock_id, queued_at: Date.now() });
  write_pending_deletes(entries);
}

export function pending_app_lock_deletes(): PendingAppLockDelete[] {
  return read_pending_deletes();
}

async function active_account_id(): Promise<string | null> {
  try {
    const { get_current_account_id } = await import(
      "@/services/account_manager"
    );

    return await get_current_account_id();
  } catch {
    return null;
  }
}

function delete_within_timeout(work: Promise<boolean>): Promise<boolean> {
  return Promise.race([
    work.catch(() => false),
    new Promise<boolean>((resolve) =>
      setTimeout(() => resolve(false), RELEASE_TIMEOUT_MS),
    ),
  ]);
}

export type AppLockRemoteDelete = (device_lock_id: string) => Promise<boolean>;

async function delete_or_queue(
  account_id: string,
  device_lock_id: string,
  remote_delete?: AppLockRemoteDelete,
): Promise<boolean> {
  if (released_lock_ids.has(device_lock_id)) return true;
  let deleted = false;

  if (remote_delete) {
    deleted = await delete_within_timeout(remote_delete(device_lock_id));
  } else if ((await active_account_id()) === account_id) {
    deleted = await delete_within_timeout(delete_app_lock(device_lock_id));
  }
  if (deleted) {
    released_lock_ids.add(device_lock_id);
    write_pending_deletes(
      read_pending_deletes().filter(
        (entry) => entry.device_lock_id !== device_lock_id,
      ),
    );
  } else {
    queue_app_lock_delete(account_id, device_lock_id);
  }

  return deleted;
}

export async function flush_pending_app_lock_deletes(): Promise<number> {
  const account_id = await active_account_id();

  if (!account_id) return 0;
  const mine = read_pending_deletes().filter(
    (entry) => entry.account_id === account_id,
  );
  const done = new Set<string>();

  for (const entry of mine) {
    if (await delete_within_timeout(delete_app_lock(entry.device_lock_id))) {
      done.add(entry.device_lock_id);
      released_lock_ids.add(entry.device_lock_id);
    }
  }
  write_pending_deletes(
    read_pending_deletes().filter((entry) => !done.has(entry.device_lock_id)),
  );

  return done.size;
}

export type AppUnlockOutcome =
  | { outcome: "unlocked" }
  | { outcome: "duress" }
  | { outcome: "failed"; locked: boolean; attempts_remaining: number | null }
  | { outcome: "locked_out"; remaining_ms: number }
  | { outcome: "reset" }
  | { outcome: "busy" }
  | { outcome: "unavailable" };

type WrappedConfig = AppLockConfig & { wrap: AppLockWrapInfo };

type ServerUnlock =
  | { status: "ok"; wrap_key: CryptoKey; verifier: Uint8Array }
  | { status: "wrong_pin" }
  | { status: "reset" }
  | { status: "busy" }
  | { status: "unavailable" };

export async function seal_device_passphrase_for_lock(
  account_id: string,
): Promise<boolean> {
  if (!get_app_lock_config(account_id)?.enabled) return false;
  if (is_app_lock_server_wrapped(account_id)) {
    await drop_device_readable_lists(account_id);
  }
  const wrapped = read_wrapped_record(account_id);

  return seal_device_passphrase(
    account_id,
    wrapped ? JSON.stringify(wrapped.record) : "",
  );
}

async function drop_device_readable_lists(account_id: string): Promise<void> {
  try {
    const { clear_account_list_cache } = await import(
      "@/services/offline_email_cache"
    );

    await clear_account_list_cache(account_id);
  } catch {
    return;
  }
}

const DRAFT_FLUSH_LIMIT_MS = 4000;

export async function lock_server_wrapped_session(
  account_id: string,
): Promise<boolean> {
  if (!is_app_lock_server_wrapped(account_id)) return false;
  window.dispatchEvent(new CustomEvent(MAIL_EVENTS.FLUSH_DRAFTS));
  await Promise.race([
    import("@/services/crypto/encrypted_drafts").then(({ draft_manager }) =>
      draft_manager.await_all_pending_saves(),
    ),
    new Promise((resolve) => setTimeout(resolve, DRAFT_FLUSH_LIMIT_MS)),
  ]).catch(() => undefined);
  await drop_device_readable_lists(account_id);

  return wipe_unlocked_secrets(account_id);
}

async function restore_device_passphrase_after_lock(
  account_id: string,
  passphrase: string | null,
): Promise<void> {
  if (!passphrase || get_app_lock_config(account_id)?.enabled) return;
  await restore_device_passphrase(account_id, passphrase);
}

export function is_app_lock_server_wrapped(account_id: string): boolean {
  return is_server_wrapped_config(get_app_lock_config(account_id));
}

function decode_secret(secret: string): Uint8Array | null {
  const bytes = base64_to_bytes(secret);

  if (!bytes || bytes.length !== APP_LOCK_FIELD_BYTES) return null;

  return bytes;
}

async function resolve_current_passphrase(
  account_id: string,
): Promise<string | null> {
  const stored = await get_session_passphrase(account_id).catch(() => null);

  if (stored) return stored;

  return get_passphrase_from_memory();
}

export async function upgrade_to_server_wrap(
  account_id: string,
  pin: string,
): Promise<boolean> {
  const config = get_app_lock_config(account_id);

  if (!config?.enabled || is_server_wrapped_config(config)) return false;
  const passphrase = await resolve_current_passphrase(account_id);

  if (!passphrase) return false;
  const pepper = await ensure_pepper(account_id);

  if (!pepper) return false;
  const remember_on_device = is_session_passphrase_on_device(account_id);
  const salt = generate_pin_salt();
  const device_lock_id = crypto.randomUUID();
  const pin_key = await derive_pin_key(pin, salt, pepper);

  try {
    const verifier = await derive_verifier(await derive_proof(pin_key));
    const registered = await register_app_lock(
      device_lock_id,
      bytes_to_base64(verifier),
    );

    if (registered.status !== "ok") return false;
    const secret = decode_secret(registered.secret);

    if (!secret) {
      void delete_app_lock(device_lock_id);

      return false;
    }
    const wrap_key = await derive_wrap_key(
      pin_key,
      secret,
      account_id,
      device_lock_id,
    );

    secret.fill(0);
    await write_wrapped_passphrase(
      account_id,
      wrap_key,
      passphrase,
      remember_on_device,
    );
    const round_trip = await open_wrapped_passphrase(account_id, wrap_key);
    const current = get_app_lock_config(account_id);

    if (
      round_trip !== passphrase ||
      !current?.enabled ||
      current.pin_hash !== config.pin_hash
    ) {
      remove_wrapped_passphrase(account_id);
      void delete_app_lock(device_lock_id);

      return false;
    }

    set_unlocked_lock(account_id, wrap_key, verifier);
    save_app_lock_config(account_id, {
      ...current,
      pin_hash: "",
      pin_salt: "",
      kdf_version: KDF_VERSION_SERVER_WRAP,
      wrap: { device_lock_id, salt: encode_hex(salt) },
      ...(current.kdf_version === KDF_VERSION_PEPPER
        ? {}
        : { duress_legacy_kdf: true }),
    });
    remove_unwrapped_passphrase(account_id);
    reset_app_lock_attempts(account_id);

    return true;
  } catch {
    return false;
  } finally {
    pin_key.fill(0);
  }
}

async function server_unlock(
  account_id: string,
  config: WrappedConfig,
  pin_key: Uint8Array,
): Promise<ServerUnlock> {
  const proof = await derive_proof(pin_key);

  try {
    const result = await unwrap_app_lock(
      config.wrap.device_lock_id,
      bytes_to_base64(proof),
    );

    if (result.status === "wrong_pin") return { status: "wrong_pin" };
    if (result.status === "reset") return { status: "reset" };
    if (result.status === "busy") return { status: "busy" };
    if (result.status !== "ok") return { status: "unavailable" };
    const secret = decode_secret(result.secret);

    if (!secret) return { status: "unavailable" };
    const wrap_key = await derive_wrap_key(
      pin_key,
      secret,
      account_id,
      config.wrap.device_lock_id,
    );

    secret.fill(0);
    if (
      read_wrapped_record(account_id) !== null &&
      (await open_wrapped_passphrase(account_id, wrap_key)) === null
    ) {
      return { status: "reset" };
    }

    return { status: "ok", wrap_key, verifier: await derive_verifier(proof) };
  } finally {
    proof.fill(0);
  }
}

async function finish_unlock(account_id: string): Promise<void> {
  const pending = get_pending_passphrase(account_id);
  const wrap_key = get_unlocked_key(account_id);

  if (pending && wrap_key) {
    await write_wrapped_passphrase(
      account_id,
      wrap_key,
      pending.passphrase,
      pending.remember_on_device,
    );
    const round_trip = await open_wrapped_passphrase(account_id, wrap_key);

    if (round_trip === pending.passphrase) {
      clear_pending_passphrase(account_id);
    }
  }

  mark_session_unlocked(account_id);
  settle_app_unlock(account_id, true);
  await seal_device_passphrase_for_lock(account_id);
}

async function unlock_server_wrapped(
  account_id: string,
  config: WrappedConfig,
  pin: string,
): Promise<AppUnlockOutcome> {
  const [is_duress, pin_key] = await Promise.all([
    duress_pin_correct(account_id, pin),
    derive_wrapped_pin_key(account_id, config, pin),
  ]);

  if (is_duress) {
    pin_key?.fill(0);

    return { outcome: "duress" };
  }
  if (!pin_key) {
    await handle_lock_reset(account_id);

    return { outcome: "reset" };
  }

  try {
    const result = await server_unlock(account_id, config, pin_key);

    if (result.status === "wrong_pin") {
      return { outcome: "failed", locked: false, attempts_remaining: null };
    }
    if (result.status === "reset") {
      await handle_lock_reset(account_id);

      return { outcome: "reset" };
    }
    if (result.status === "busy") return { outcome: "busy" };
    if (result.status !== "ok") return { outcome: "unavailable" };

    set_unlocked_lock(account_id, result.wrap_key, result.verifier);
    result.verifier.fill(0);
    await finish_unlock(account_id);

    return { outcome: "unlocked" };
  } finally {
    pin_key.fill(0);
  }
}

export async function attempt_app_unlock(
  account_id: string,
  pin: string,
): Promise<AppUnlockOutcome> {
  const config = get_app_lock_config(account_id);

  if (is_server_wrapped_config(config)) {
    return unlock_server_wrapped(account_id, config, pin);
  }

  const legacy = await attempt_pin_unlock(account_id, pin);

  if (legacy.outcome === "unlocked") {
    mark_session_unlocked(account_id);
    settle_app_unlock(account_id, true);
    await seal_device_passphrase_for_lock(account_id);
    void upgrade_to_server_wrap(account_id, pin)
      .then((upgraded) =>
        upgraded ? seal_device_passphrase_for_lock(account_id) : false,
      )
      .catch(() => false);

    return { outcome: "unlocked" };
  }
  if (legacy.outcome === "failed") {
    return {
      outcome: "failed",
      locked: legacy.locked,
      attempts_remaining: legacy.attempts_remaining,
    };
  }

  return legacy;
}

export async function unlock_with_password(
  account_id: string,
  password: string,
): Promise<boolean> {
  const stored = get_stored_encrypted_vault(account_id);

  if (!stored || !password) return false;
  try {
    await decrypt_vault(stored.encrypted_vault, stored.vault_nonce, password);
  } catch {
    return false;
  }

  if (is_app_lock_server_wrapped(account_id)) {
    const remember_on_device =
      read_wrapped_record(account_id)?.on_device ?? true;

    set_pending_passphrase(account_id, password, remember_on_device);
  }
  mark_session_unlocked(account_id);
  settle_app_unlock(account_id, true);
  await seal_device_passphrase_for_lock(account_id);

  return true;
}

export async function handle_lock_reset(account_id: string): Promise<boolean> {
  const pending = get_pending_passphrase(account_id);
  const keep = pending?.passphrase ?? get_passphrase_from_memory();
  const remember_on_device = pending?.remember_on_device ?? true;

  forget_unlocked_lock(account_id);
  remove_wrapped_passphrase(account_id);
  clear_app_lock_config(account_id);
  clear_session_unlock(account_id);

  if (keep) {
    await store_unwrapped_passphrase(account_id, keep, remember_on_device);
    await restore_device_passphrase_after_lock(account_id, keep);
    settle_app_unlock(account_id, true);

    return true;
  }

  settle_app_unlock(account_id, false);

  return false;
}

export async function convert_to_unwrapped(
  account_id: string,
): Promise<boolean> {
  const config = get_app_lock_config(account_id);

  if (!is_server_wrapped_config(config)) return true;
  const passphrase = await resolve_current_passphrase(account_id);
  const remember_on_device = is_session_passphrase_on_device(account_id);

  if (!passphrase) return false;
  const { wrap: _w, duress_legacy_kdf: _l, ...rest } = config;

  save_app_lock_config(account_id, {
    ...rest,
    enabled: false,
    kdf_version: config.duress_legacy_kdf ? undefined : KDF_VERSION_PEPPER,
  });
  await store_unwrapped_passphrase(account_id, passphrase, remember_on_device);
  await restore_device_passphrase_after_lock(account_id, passphrase);
  remove_wrapped_passphrase(account_id);
  forget_unlocked_lock(account_id);
  await delete_or_queue(account_id, config.wrap.device_lock_id);

  return true;
}

export async function remove_app_lock(account_id: string): Promise<void> {
  await convert_to_unwrapped(account_id).catch(() => false);
  clear_app_lock_config(account_id);
  const passphrase = await resolve_current_passphrase(account_id).catch(
    () => null,
  );

  await restore_device_passphrase_after_lock(account_id, passphrase);
}

export async function release_app_lock(
  account_id: string,
  remote_delete?: AppLockRemoteDelete,
): Promise<void> {
  const config = get_app_lock_config(account_id);

  forget_unlocked_lock(account_id);
  remove_wrapped_passphrase(account_id);
  if (is_server_wrapped_config(config)) {
    await delete_or_queue(
      account_id,
      config.wrap.device_lock_id,
      remote_delete,
    );
  }
}

export async function verify_app_lock_pin(
  account_id: string,
  pin: string,
): Promise<{
  ok: boolean;
  locked: boolean;
  attempts_remaining: number | null;
}> {
  const config = get_app_lock_config(account_id);

  if (!is_server_wrapped_config(config)) return verify_pin(account_id, pin);
  if (get_unlocked_verifier(account_id)) {
    return {
      ok: await pin_matches_regular(account_id, pin),
      locked: false,
      attempts_remaining: null,
    };
  }
  const pin_key = await derive_wrapped_pin_key(account_id, config, pin);

  if (!pin_key) return { ok: false, locked: false, attempts_remaining: null };
  try {
    const result = await server_unlock(account_id, config, pin_key);

    if (result.status !== "ok") {
      return { ok: false, locked: false, attempts_remaining: null };
    }
    set_unlocked_lock(account_id, result.wrap_key, result.verifier);
    result.verifier.fill(0);
    await finish_unlock(account_id);

    return { ok: true, locked: false, attempts_remaining: null };
  } finally {
    pin_key.fill(0);
  }
}

export async function pin_is_regular(
  account_id: string,
  pin: string,
): Promise<boolean> {
  const config = get_app_lock_config(account_id);

  if (is_server_wrapped_config(config) && !get_unlocked_verifier(account_id)) {
    return (await verify_app_lock_pin(account_id, pin)).ok;
  }

  return pin_matches_regular(account_id, pin);
}

export function wipe_unlocked_secrets(account_id: string): boolean {
  if (!is_app_lock_server_wrapped(account_id)) return false;
  forget_all_unlocked_locks();
  clear_session_unlock(account_id);
  clear_vault_from_memory();

  return true;
}

export function is_waiting_for_app_unlock(account_id: string): boolean {
  return has_unlock_waiters(account_id);
}
