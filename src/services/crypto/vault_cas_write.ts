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

import { decrypt_vault, encrypt_vault } from "./key_manager";
import {
  get_passphrase_bytes,
  get_passphrase_from_memory,
  get_vault_from_memory,
  MASTER_KEY_VAULT_FORMAT,
  store_vault_in_memory,
} from "./memory_key_store";
import { collect_vault_key_fingerprints } from "./vault_key_fingerprints";
import {
  note_vault_written,
  vault_write_iterations,
  write_vault_at_level,
  type SealedVault,
  type VaultKdfIterations,
} from "./vault_level2";

import { get_current_account } from "@/services/account_manager";
import { api_client } from "@/services/api/client";
import { ignore_error } from "@/lib/ignore_error";

export const VAULT_PATH = "/crypto/v1/keys/vault";
export const MAX_VAULT_CONFLICT_RETRIES = 3;

export const STORAGE_KEY_FIELDS = [
  "data_kek",
  "data_kek_random",
  "storage_rekey",
  "mk_created_at",
] as const;

type VaultRecord = Record<string, unknown>;

interface ServerVaultView {
  encrypted_vault?: string;
  vault_nonce?: string;
  vault_sha256?: string;
}

export interface ServerVaultSnapshot {
  encrypted_vault: string;
  vault_nonce: string;
  vault_sha256: string;
}

export interface FetchedVault {
  encrypted_vault: string;
  vault_nonce: string;
  vault_sha256: string | null;
}

export type FetchResult =
  | { kind: "ok"; snapshot: FetchedVault }
  | { kind: "missing" }
  | { kind: "error" };

export interface VaultWriteRequest {
  next: EncryptedVault;
  base?: EncryptedVault | null;
  passphrase?: string;
  user_id?: string;
  vault_format?: number;
  preserve_pq_prekeys?: boolean;
  owns_storage_key?: boolean;
  snapshot?: ServerVaultSnapshot;
  max_conflict_retries?: number;
}

export type VaultWriteResult =
  | {
      status: "written";
      vault: EncryptedVault;
      encrypted_vault: string;
      vault_nonce: string;
    }
  | { status: "conflict" }
  | { status: "superseded"; vault: EncryptedVault }
  | { status: "failed"; error?: string };

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

function is_storage_key_field(key: string): boolean {
  return (STORAGE_KEY_FIELDS as readonly string[]).includes(key);
}

function field(vault: EncryptedVault | null | undefined, key: string): unknown {
  return vault ? (vault as unknown as VaultRecord)[key] : undefined;
}

function has_random_storage_key(
  vault: EncryptedVault | null | undefined,
): boolean {
  return vault?.data_kek_random === true || !!vault?.storage_rekey;
}

function storage_key_fields_match(
  a: EncryptedVault | null | undefined,
  b: EncryptedVault | null | undefined,
): boolean {
  if (!has_random_storage_key(a) && !has_random_storage_key(b)) return true;

  return STORAGE_KEY_FIELDS.every((key) => same(field(a, key), field(b, key)));
}

function merge_legacy_keks(
  server: EncryptedVault["legacy_keks"],
  next: EncryptedVault["legacy_keks"],
): EncryptedVault["legacy_keks"] {
  const merged = [...(server ?? [])];
  const seen = new Set(merged.map((entry) => entry.k));

  for (const entry of next ?? []) {
    if (seen.has(entry.k)) continue;
    seen.add(entry.k);
    merged.push(entry);
  }

  return merged.length ? merged : (server ?? next);
}

export function merge_vault_for_write(
  server: EncryptedVault,
  base: EncryptedVault | null,
  next: EncryptedVault,
  owns_storage_key = false,
): EncryptedVault {
  const merged: VaultRecord = { ...(server as unknown as VaultRecord) };
  const next_record = next as unknown as VaultRecord;
  const base_record = base ? (base as unknown as VaultRecord) : null;
  const keys = new Set([
    ...Object.keys(next_record),
    ...Object.keys(base_record ?? {}),
  ]);

  for (const key of keys) {
    if (key === "legacy_keks" || key === "vault_format") continue;
    if (is_storage_key_field(key) && !owns_storage_key) continue;

    const changed = base_record
      ? !same(next_record[key], base_record[key])
      : key in next_record;

    if (!changed) continue;

    if (next_record[key] === undefined) {
      delete merged[key];
    } else {
      merged[key] = next_record[key];
    }
  }

  const legacy_keks = merge_legacy_keks(server.legacy_keks, next.legacy_keks);

  if (legacy_keks) merged.legacy_keks = legacy_keks;

  merged.vault_format = Math.max(
    server.vault_format ?? 1,
    next.vault_format ?? 1,
  );

  if (server.data_kek_random === true && merged.data_kek_random !== true) {
    for (const key of STORAGE_KEY_FIELDS) {
      merged[key] = field(server, key);
    }
  }

  return merged as unknown as EncryptedVault;
}

export function is_vault_conflict(response: {
  status?: number;
  code?: string;
}): boolean {
  return is_conflict(response);
}

function is_conflict(response: { status?: number; code?: string }): boolean {
  return response.status === 409 || response.code === "CONFLICT";
}

export async function fetch_latest_vault(): Promise<FetchResult> {
  try {
    const response = await api_client.get<ServerVaultView>(VAULT_PATH, {
      skip_cache: true,
      skip_dedup: true,
    });

    if (response.code === "NOT_FOUND") return { kind: "missing" };

    const data = response.data;

    if (response.error || !data?.encrypted_vault || !data.vault_nonce) {
      return { kind: "error" };
    }

    return {
      kind: "ok",
      snapshot: {
        encrypted_vault: data.encrypted_vault,
        vault_nonce: data.vault_nonce,
        vault_sha256: data.vault_sha256 ?? null,
      },
    };
  } catch {
    return { kind: "error" };
  }
}

export async function fetch_server_vault_snapshot(): Promise<ServerVaultSnapshot | null> {
  const fetched = await fetch_latest_vault();

  if (fetched.kind !== "ok" || !fetched.snapshot.vault_sha256) return null;

  return {
    encrypted_vault: fetched.snapshot.encrypted_vault,
    vault_nonce: fetched.snapshot.vault_nonce,
    vault_sha256: fetched.snapshot.vault_sha256,
  };
}

async function open_snapshot(
  snapshot: { encrypted_vault: string; vault_nonce: string },
  passphrase: string,
): Promise<EncryptedVault | null> {
  try {
    return await decrypt_vault(
      snapshot.encrypted_vault,
      snapshot.vault_nonce,
      passphrase,
    );
  } catch {
    return null;
  }
}

export async function read_latest_vault(
  passphrase: string,
): Promise<{ vault: EncryptedVault; vault_sha256: string | null } | null> {
  const fetched = await fetch_latest_vault();

  if (fetched.kind !== "ok") return null;

  const vault = await open_snapshot(fetched.snapshot, passphrase);

  return vault ? { vault, vault_sha256: fetched.snapshot.vault_sha256 } : null;
}

export function persist_local_vault(
  user_id: string,
  encrypted_vault: string,
  vault_nonce: string,
): void {
  try {
    localStorage.setItem(
      `astermail_encrypted_vault_${user_id}`,
      encrypted_vault,
    );
    localStorage.setItem(`astermail_vault_nonce_${user_id}`, vault_nonce);
  } catch (caught) {
    ignore_error("services/crypto/vault_cas_write:persist", caught);
  }
}

async function sealed_matches(
  encrypted_vault: string,
  vault_nonce: string,
  passphrase: string,
  expected: EncryptedVault,
): Promise<boolean> {
  const roundtrip = await open_snapshot(
    { encrypted_vault, vault_nonce },
    passphrase,
  );

  return (
    !!roundtrip &&
    roundtrip.identity_key === expected.identity_key &&
    roundtrip.data_kek === expected.data_kek &&
    roundtrip.data_kek_random === expected.data_kek_random &&
    roundtrip.storage_rekey?.state === expected.storage_rekey?.state
  );
}

async function write_once(
  request: VaultWriteRequest,
  base: EncryptedVault | null,
  passphrase: string,
  user_id: string,
  fetched: FetchResult,
): Promise<VaultWriteResult> {
  if (fetched.kind === "error") {
    return { status: "failed", error: "vault_unavailable" };
  }

  let server: EncryptedVault | null = null;

  if (fetched.kind === "ok") {
    server = await open_snapshot(fetched.snapshot, passphrase);
    if (!server) return { status: "failed", error: "vault_unreadable" };
  }

  if (
    server &&
    request.owns_storage_key &&
    base &&
    !storage_key_fields_match(server, base)
  ) {
    return { status: "superseded", vault: server };
  }

  const merged = server
    ? merge_vault_for_write(
        server,
        base,
        request.next,
        request.owns_storage_key === true,
      )
    : request.next;
  const vault_key_fingerprints = await collect_vault_key_fingerprints(merged);
  const vault_format = Math.max(
    merged.vault_format ?? 1,
    request.vault_format ?? 1,
    merged.data_kek ? MASTER_KEY_VAULT_FORMAT : 1,
  );
  const expected_vault_sha256 =
    fetched.kind === "ok" ? fetched.snapshot.vault_sha256 : null;
  let roundtrip_failed = false;
  const seal = async (iterations: VaultKdfIterations): Promise<SealedVault> => {
    const sealed = await encrypt_vault(merged, passphrase, iterations);

    if (
      !(await sealed_matches(
        sealed.encrypted_vault,
        sealed.vault_nonce,
        passphrase,
        merged,
      ))
    ) {
      roundtrip_failed = true;
    }

    return sealed;
  };
  const send = async (
    sealed: SealedVault,
    field: { vault_kdf_iterations?: VaultKdfIterations },
  ) => {
    if (roundtrip_failed) return { roundtrip_failed: true as const };

    return api_client.put<{ success: boolean }>(VAULT_PATH, {
      encrypted_vault: sealed.encrypted_vault,
      vault_nonce: sealed.vault_nonce,
      expected_user_id: user_id,
      vault_format,
      preserve_pq_prekeys: request.preserve_pq_prekeys ?? true,
      ...field,
      ...(expected_vault_sha256 ? { expected_vault_sha256 } : {}),
      ...(vault_key_fingerprints.length ? { vault_key_fingerprints } : {}),
    });
  };
  const written = await write_vault_at_level(
    vault_write_iterations(
      fetched.kind === "ok" ? fetched.snapshot.encrypted_vault : null,
    ),
    seal,
    send,
  );
  const response = written.response;

  if ("roundtrip_failed" in response) {
    return { status: "failed", error: "roundtrip_failed" };
  }
  if (is_conflict(response)) return { status: "conflict" };
  if (response.error) return { status: "failed", error: response.error };

  const { encrypted_vault, vault_nonce } = written.sealed;

  note_vault_written(written.sealed, written.iterations);
  persist_local_vault(user_id, encrypted_vault, vault_nonce);
  await store_vault_in_memory(merged, passphrase, user_id);

  return { status: "written", vault: merged, encrypted_vault, vault_nonce };
}

export function vault_passphrase(): string | null {
  return get_passphrase_from_memory();
}

export function vault_passphrase_bytes(): Uint8Array | null {
  return get_passphrase_bytes();
}

export function put_vault_with_expected_hash(
  body: Record<string, unknown>,
): Promise<ApiResponse<unknown>> {
  return api_client.put<unknown>(VAULT_PATH, body);
}

export async function open_vault_for_write(
  encrypted_vault: string,
  vault_nonce: string,
  vault?: EncryptedVault | null,
): Promise<{ next: EncryptedVault; passphrase: string } | null> {
  const passphrase = vault_passphrase();

  if (!passphrase) return null;
  if (vault) return { next: vault, passphrase };

  try {
    const next = await decrypt_vault(encrypted_vault, vault_nonce, passphrase);

    return { next, passphrase };
  } catch {
    return null;
  }
}

export async function write_vault_merged(
  request: VaultWriteRequest,
): Promise<VaultWriteResult> {
  const passphrase = request.passphrase ?? vault_passphrase();
  const account = await get_current_account();
  const account_id = account?.user?.id ?? null;
  const user_id = request.user_id ?? account_id;

  if (!passphrase || !user_id) return { status: "failed", error: "no_session" };
  if (account_id && account_id !== user_id) {
    return { status: "failed", error: "account_changed" };
  }

  const base =
    request.base === undefined ? get_vault_from_memory() : request.base;
  const retries = request.max_conflict_retries ?? MAX_VAULT_CONFLICT_RETRIES;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const fetched: FetchResult =
      attempt === 0 && request.snapshot
        ? { kind: "ok", snapshot: request.snapshot }
        : await fetch_latest_vault();
    const result = await write_once(
      request,
      base,
      passphrase,
      user_id,
      fetched,
    );

    if (result.status !== "conflict") return result;
  }

  return { status: "conflict" };
}
