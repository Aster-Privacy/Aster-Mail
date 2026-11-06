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
import type { PrivateKey } from "openpgp";
import type { ApiResponse } from "@/services/api/client/helpers";

import { api_client } from "@/services/api/client";
import { get_account_key_capabilities } from "@/services/api/account_key";
import { load_openpgp } from "@/services/crypto/openpgp_loader";
import {
  get_vault_from_memory,
  get_vault_owner_id,
  is_master_key_vault,
  on_vault_cleared,
} from "@/services/crypto/memory_key_store";
import { base64_to_array } from "@/services/crypto/base64";
import {
  external_challenge_message,
  normalize_external_fingerprint,
  unwrap_external_private_key,
  wrap_external_private_key,
} from "@/services/crypto/external_pgp_wrap";
import {
  normalize_external_key,
  parse_external_key,
  read_unprotected_key,
  serialize_unprotected_key,
  unlock_external_key,
  type normalized_external_key,
} from "@/services/crypto/external_pgp_import";
import {
  read_cached_external_key,
  remove_cached_external_key,
  write_cached_external_key,
} from "@/services/crypto/external_pgp_cache";

export const EXTERNAL_PGP_ENDPOINT = "/crypto/v1/keys/pgp/external";

const LOAD_WAIT_MS = 3000;

export interface external_key_record {
  fingerprint: string;
  key_id: string;
  algorithm: string;
  key_size: number;
  public_key_armored: string;
  wrapped_private_key: string;
  created_at: string;
  expires_at: string | null;
  published: boolean;
  uid_mismatch: boolean;
}

export type external_key_status = "none" | "ready" | "needs_reimport";

export interface external_key_state {
  status: external_key_status;
  record: external_key_record | null;
  loaded: boolean;
}

export interface blocking_device {
  client_id: string;
  platform: string;
  last_seen_at: string;
}

export type external_key_action_result =
  | { ok: true; record: external_key_record | null }
  | {
      ok: false;
      code: string;
      reason?: string;
      blocking_devices?: blocking_device[];
    };

export interface external_key_support {
  available: boolean;
  needs_master_key: boolean;
}

interface unlocked_material {
  key: PrivateKey;
  armored: string;
}

let state: external_key_state = { status: "none", record: null, loaded: false };
let unlocked: unlocked_material | null = null;
let load_generation = 0;
let load_signature: string | null = null;
let load_promise: Promise<void> | null = null;
const listeners = new Set<(next: external_key_state) => void>();

function emit(next: external_key_state): void {
  state = next;
  listeners.forEach((listener) => {
    try {
      listener(state);
    } catch {
      return;
    }
  });
}

export function get_external_key_state(): external_key_state {
  return state;
}

export function subscribe_external_key(
  listener: (next: external_key_state) => void,
): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

export function get_external_decryption_keys(): PrivateKey[] {
  return state.status === "ready" && unlocked ? [unlocked.key] : [];
}

export function get_external_unlocked_armored_keys(): string[] {
  return state.status === "ready" && unlocked ? [unlocked.armored] : [];
}

export function get_external_signing_key(): PrivateKey | null {
  if (state.status !== "ready" || !unlocked || !state.record?.published) {
    return null;
  }

  return unlocked.key;
}

export function export_external_public_key(): string | null {
  return state.record?.public_key_armored ?? null;
}

export function clear_external_pgp_key(): void {
  load_generation += 1;
  load_signature = null;
  load_promise = null;
  unlocked = null;
  emit({ status: "none", record: null, loaded: false });
}

let vault_listener_armed = false;

function arm_vault_listener(): void {
  if (vault_listener_armed) return;
  vault_listener_armed = true;
  on_vault_cleared(({ same_owner }) => {
    if (!same_owner) clear_external_pgp_key();
  });
}

function current_owner(): string | null {
  return get_vault_owner_id();
}

function current_data_kek(): string | null {
  const vault = get_vault_from_memory();

  if (!vault || !is_master_key_vault(vault)) return null;

  return vault.data_kek ?? null;
}

function response_code(response: ApiResponse<unknown>): string {
  if (response.server_code) return response.server_code;

  const body_error = response.body?.error;

  if (typeof body_error === "string" && /^[A-Z_]+$/.test(body_error)) {
    return body_error;
  }

  if (response.status === 404) return "NOT_AVAILABLE";

  return "REQUEST_FAILED";
}

function response_reason(response: ApiResponse<unknown>): string | undefined {
  const reason = response.body?.reason ?? response.details?.reason;

  return typeof reason === "string" ? reason : undefined;
}

function parse_blocking_devices(
  response: ApiResponse<unknown>,
): blocking_device[] {
  const raw = response.body?.blocking_devices ?? response.details?.blocking_devices;

  if (!Array.isArray(raw)) return [];

  return raw
    .filter(
      (entry): entry is Record<string, unknown> =>
        typeof entry === "object" && entry !== null,
    )
    .map((entry) => ({
      client_id: String(entry.client_id ?? ""),
      platform: String(entry.platform ?? ""),
      last_seen_at: String(entry.last_seen_at ?? ""),
    }));
}

function failure(response: ApiResponse<unknown>): external_key_action_result {
  return {
    ok: false,
    code: response_code(response),
    reason: response_reason(response),
    blocking_devices: parse_blocking_devices(response),
  };
}

function is_record(value: unknown): value is external_key_record {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;

  return (
    typeof record.fingerprint === "string" &&
    typeof record.public_key_armored === "string" &&
    typeof record.wrapped_private_key === "string" &&
    typeof record.published === "boolean"
  );
}

function record_from_cache(
  cached: Awaited<ReturnType<typeof read_cached_external_key>>,
): external_key_record | null {
  if (!cached) return null;

  return {
    fingerprint: cached.fingerprint,
    key_id: cached.fingerprint.slice(-16),
    algorithm: "",
    key_size: 0,
    public_key_armored: cached.public_key_armored,
    wrapped_private_key: cached.wrapped_private_key,
    created_at: "",
    expires_at: null,
    published: cached.published,
    uid_mismatch: false,
  };
}

async function remember_record(
  user_id: string,
  record: external_key_record,
): Promise<void> {
  await write_cached_external_key({
    user_id,
    fingerprint: record.fingerprint,
    wrapped_private_key: record.wrapped_private_key,
    public_key_armored: record.public_key_armored,
    published: record.published,
    stored_at: Date.now(),
  });
}

async function open_record(
  record: external_key_record,
  user_id: string,
  data_kek_b64: string,
): Promise<unlocked_material | null> {
  const data_kek = base64_to_array(data_kek_b64);
  let plaintext: Uint8Array | null = null;

  try {
    const fingerprint = normalize_external_fingerprint(record.fingerprint);

    plaintext = await unwrap_external_private_key(
      record.wrapped_private_key,
      data_kek,
      user_id,
      fingerprint,
    );

    const key = await read_unprotected_key(plaintext);

    if (key.getFingerprint().toLowerCase() !== fingerprint) return null;

    return { key, armored: key.armor() };
  } catch {
    return null;
  } finally {
    data_kek.fill(0);
    plaintext?.fill(0);
  }
}

async function apply_record(
  record: external_key_record | null,
  user_id: string,
  data_kek_b64: string,
  generation: number,
): Promise<void> {
  if (!record) {
    if (generation !== load_generation) return;
    unlocked = null;
    emit({ status: "none", record: null, loaded: true });

    return;
  }

  const material = await open_record(record, user_id, data_kek_b64);

  if (generation !== load_generation) return;

  unlocked = material;
  emit({
    status: material ? "ready" : "needs_reimport",
    record,
    loaded: true,
  });
}

async function fetch_record(): Promise<
  | { kind: "record"; record: external_key_record | null }
  | { kind: "off" }
  | { kind: "unreachable" }
> {
  const response = await api_client.get<{ key: unknown }>(
    EXTERNAL_PGP_ENDPOINT,
    { skip_cache: true },
  );

  if (response.status === 404) return { kind: "off" };
  if (response.error || !response.data) return { kind: "unreachable" };

  const key = response.data.key;

  return { kind: "record", record: is_record(key) ? key : null };
}

async function run_load(
  user_id: string,
  data_kek_b64: string,
  generation: number,
): Promise<void> {
  const capabilities = await get_account_key_capabilities();

  if (generation !== load_generation) return;

  if (!capabilities.external_pgp_keys) {
    await apply_record(null, user_id, data_kek_b64, generation);

    return;
  }

  const fetched = await fetch_record().catch(
    () => ({ kind: "unreachable" }) as const,
  );

  if (generation !== load_generation) return;

  if (fetched.kind === "off") {
    await apply_record(null, user_id, data_kek_b64, generation);

    return;
  }

  if (fetched.kind === "unreachable") {
    const cached = await read_cached_external_key(user_id);

    await apply_record(record_from_cache(cached), user_id, data_kek_b64, generation);

    return;
  }

  if (fetched.record) {
    await remember_record(user_id, fetched.record);
  } else {
    await remove_cached_external_key(user_id);
  }

  await apply_record(fetched.record, user_id, data_kek_b64, generation);
}

export function request_external_pgp_key_load(
  options: { force?: boolean } = {},
): Promise<void> {
  arm_vault_listener();

  const user_id = current_owner();
  const data_kek_b64 = current_data_kek();

  if (!user_id || !data_kek_b64) {
    if (state.status !== "none" || unlocked) clear_external_pgp_key();

    return Promise.resolve();
  }

  const signature = `${user_id}|${data_kek_b64}`;

  if (!options.force && load_signature === signature && load_promise) {
    return load_promise;
  }

  load_generation += 1;
  load_signature = signature;

  const generation = load_generation;
  const promise = run_load(user_id, data_kek_b64, generation).catch(() => {
    if (generation === load_generation) {
      unlocked = null;
      emit({ status: "none", record: null, loaded: true });
    }
  });

  load_promise = promise;

  return promise;
}

export function is_external_pgp_key_loading(): boolean {
  return load_promise !== null && !state.loaded;
}

export async function settle_external_pgp_key_load(): Promise<void> {
  const pending = load_promise;

  if (!pending || state.loaded) return;

  await Promise.race([
    pending,
    new Promise<void>((resolve) => setTimeout(resolve, LOAD_WAIT_MS)),
  ]);
}

export async function check_external_pgp_support(): Promise<external_key_support> {
  const capabilities = await get_account_key_capabilities();

  return {
    available: capabilities.external_pgp_keys,
    needs_master_key: !is_master_key_vault(get_vault_from_memory()),
  };
}

export async function prepare_external_key_import(
  input: Uint8Array | string,
  passphrase: string,
  primary_address: string,
): Promise<normalized_external_key> {
  const parsed = await parse_external_key(input);
  const opened = await unlock_external_key(parsed, passphrase);

  return normalize_external_key(opened, primary_address);
}

async function sign_challenge(
  key: PrivateKey,
  user_id: string,
  challenge: string,
): Promise<string> {
  const openpgp = await load_openpgp();
  const message = await openpgp.createMessage({
    binary: external_challenge_message(user_id, challenge),
  });

  return (await openpgp.sign({
    message,
    signingKeys: key,
    detached: true,
    format: "armored",
  })) as string;
}

export async function upload_external_key(
  normalized: normalized_external_key,
): Promise<external_key_action_result> {
  const user_id = current_owner();
  const data_kek_b64 = current_data_kek();

  if (!user_id || !data_kek_b64) {
    return { ok: false, code: "MASTER_KEY_REQUIRED" };
  }

  const fingerprint = normalized.key.getFingerprint().toLowerCase();
  const plaintext = serialize_unprotected_key(normalized.key);
  const data_kek = base64_to_array(data_kek_b64);
  let wrapped: string;

  try {
    wrapped = await wrap_external_private_key(
      plaintext,
      data_kek,
      user_id,
      fingerprint,
    );
  } finally {
    data_kek.fill(0);
    plaintext.fill(0);
  }

  const challenge_response = await api_client.post<{
    challenge: string;
    expires_at: string;
  }>(`${EXTERNAL_PGP_ENDPOINT}/challenge`, {});

  if (challenge_response.error || !challenge_response.data?.challenge) {
    return failure(challenge_response);
  }

  const challenge = challenge_response.data.challenge;
  const challenge_signature = await sign_challenge(
    normalized.key,
    user_id,
    challenge,
  );
  const public_key_armored = normalized.key.toPublic().armor();
  const response = await api_client.put<unknown>(EXTERNAL_PGP_ENDPOINT, {
    public_key_armored,
    wrapped_private_key: wrapped,
    challenge,
    challenge_signature,
  });

  if (response.error) return failure(response);

  const returned = is_record(response.data)
    ? response.data
    : is_record((response.data as { key?: unknown } | undefined)?.key)
      ? ((response.data as { key: external_key_record }).key)
      : null;
  const record: external_key_record = returned ?? {
    fingerprint,
    key_id: normalized.summary.key_id,
    algorithm: normalized.summary.algorithm,
    key_size: normalized.summary.key_size,
    public_key_armored,
    wrapped_private_key: wrapped,
    created_at: normalized.summary.created_at.toISOString(),
    expires_at: normalized.summary.expires_at?.toISOString() ?? null,
    published: false,
    uid_mismatch: false,
  };

  load_generation += 1;
  load_signature = `${user_id}|${data_kek_b64}`;
  load_promise = Promise.resolve();
  unlocked = { key: normalized.key, armored: normalized.key.armor() };
  emit({ status: "ready", record, loaded: true });
  await remember_record(user_id, record);

  return { ok: true, record };
}

export async function set_external_key_published(
  publish: boolean,
): Promise<external_key_action_result> {
  const response = await api_client.post<unknown>(
    `${EXTERNAL_PGP_ENDPOINT}/publish`,
    { publish },
  );

  if (response.error) return failure(response);

  const user_id = current_owner();
  const current = state.record;
  const returned = is_record(response.data) ? response.data : null;
  const record = returned ?? (current ? { ...current, published: publish } : null);

  if (record) {
    emit({ ...state, record });
    if (user_id) await remember_record(user_id, record);
  }

  return { ok: true, record };
}

export async function delete_external_key(
  purge: boolean,
): Promise<external_key_action_result> {
  const response = await api_client.delete<unknown>(
    `${EXTERNAL_PGP_ENDPOINT}?purge=${purge ? "true" : "false"}`,
  );

  if (response.error) return failure(response);

  const user_id = current_owner();

  if (purge) {
    load_generation += 1;
    unlocked = null;
    emit({ status: "none", record: null, loaded: true });
    if (user_id) await remove_cached_external_key(user_id);

    return { ok: true, record: null };
  }

  const record = state.record ? { ...state.record, published: false } : null;

  if (record) {
    emit({ ...state, record });
    if (user_id) await remember_record(user_id, record);
  }

  return { ok: true, record };
}
