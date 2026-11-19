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
import { array_to_base64, base64_to_array } from "./base64";
import {
  save_ratchet_state,
  load_ratchet_state,
  archive_ratchet_state,
} from "./ratchet_state_store";
import { DoubleRatchet, type SerializedState } from "./double_ratchet";
import {
  merge_discards_local_epoch,
  merge_ratchet_states,
  merge_retired_ratchet_state,
  retired_send_target,
  shares_ratchet_epoch,
} from "./ratchet_state_merge";
import {
  decode_ratchet_state_container,
  encode_ratchet_state_container,
  encode_ratchet_state_header,
  header_matches_state,
  next_sync_version,
  ratchet_state_bound_aad,
  ratchet_state_sync_aad,
  split_ratchet_state_payload,
  type RatchetStateHeader,
} from "./ratchet_state_container";
import { raise_sync_counter, read_sync_counter } from "./ratchet_sync_counter";
import { raise_sync_floor, read_sync_floor } from "./ratchet_sync_floor";
import { RATCHET_SYNC_SEALED_PREFIX } from "./storage_key_names";
import {
  ratchet_sync_writes_bound,
  vault_requires_bound_state,
} from "./ratchet_sync_format";

import { user_facing_error } from "@/utils/user_facing_error";
import { api_client } from "@/services/api/client";
import {
  decrypt_aes_gcm_with_fallback,
  decrypt_with_legacy_derived_keys,
} from "@/services/crypto/legacy_keks";
import { HASH_ALG } from "@/services/crypto/constants";
import { trim_map_to_size } from "@/lib/bounded_map";

const API_BASE = "/crypto/v1/ratchet";

const NOT_FOUND_TTL_MS = 5 * 60 * 1000;

export class RatchetStateUnreadableError extends Error {
  constructor() {
    super("Synced ratchet state is not readable with any available key");
    this.name = "RatchetStateUnreadableError";
  }
}
const MAX_CONVERSATION_CACHE = 5000;
const not_found_cache = new Map<string, number>();

interface RatchetStateResponse {
  id: string;
  conversation_id: string;
  encrypted_state: string;
  state_nonce: string;
  state_version: number;
  updated_at: string;
}

interface EncryptedStatePayload {
  encrypted_state: string;
  state_nonce: string;
}

export interface RatchetSyncKey {
  state_key: CryptoKey;
  compat_key: CryptoKey;
  user_id: string;
}

export class RatchetStateRetiredKeyError extends Error {
  constructor() {
    super("Synced ratchet state refused: retired key");
    this.name = "RatchetStateRetiredKeyError";
  }
}

const bound_server_copies = new Set<string>();

async function encrypt_legacy_state_for_server(
  container: string,
  sync_key: RatchetSyncKey,
): Promise<EncryptedStatePayload> {
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonce },
      sync_key.compat_key,
      new TextEncoder().encode(container),
    ),
  );

  return {
    encrypted_state: array_to_base64(ciphertext),
    state_nonce: array_to_base64(nonce),
  };
}

async function encrypt_state_for_server(
  container: string,
  header: RatchetStateHeader,
  sync_key: RatchetSyncKey,
  conversation_id: string,
): Promise<EncryptedStatePayload> {
  const header_bytes = encode_ratchet_state_header(header);
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv: nonce,
        additionalData: ratchet_state_sync_aad(
          sync_key.user_id,
          conversation_id,
          header_bytes,
        ),
      },
      sync_key.state_key,
      new TextEncoder().encode(container),
    ),
  );
  const payload = new Uint8Array(header_bytes.length + ciphertext.length);

  payload.set(header_bytes, 0);
  payload.set(ciphertext, header_bytes.length);

  return {
    encrypted_state: array_to_base64(payload),
    state_nonce: array_to_base64(nonce),
  };
}

interface OpenedState {
  plaintext: string;
  opened_bound: boolean;
  header: RatchetStateHeader | null;
}

async function try_decrypt(
  key: CryptoKey,
  nonce: Uint8Array,
  ciphertext: Uint8Array,
  additional_data?: Uint8Array,
): Promise<ArrayBuffer | null> {
  return crypto.subtle
    .decrypt(
      additional_data
        ? { name: "AES-GCM", iv: nonce, additionalData: additional_data }
        : { name: "AES-GCM", iv: nonce },
      key,
      ciphertext,
    )
    .catch(() => null);
}

async function open_under_retired_key(
  bytes: Uint8Array,
  nonce: Uint8Array,
  sync_key: RatchetSyncKey,
  conversation_id: string,
): Promise<ArrayBuffer | null> {
  const payload = split_ratchet_state_payload(bytes);
  const sealed = payload
    ? await decrypt_with_legacy_derived_keys(
        derive_ratchet_state_key_from_base,
        payload.ciphertext,
        nonce,
        ratchet_state_sync_aad(
          sync_key.user_id,
          conversation_id,
          payload.header_bytes,
        ),
      )
    : null;
  const opened =
    sealed ??
    (await decrypt_with_legacy_derived_keys(
      derive_ratchet_encryption_key_from_base,
      bytes,
      nonce,
    )) ??
    (await decrypt_aes_gcm_with_fallback(
      sync_key.compat_key,
      bytes,
      nonce,
    ).catch(() => null));

  return opened ?? null;
}

async function opens_under_retired_key(
  bytes: Uint8Array,
  nonce: Uint8Array,
  sync_key: RatchetSyncKey,
  conversation_id: string,
): Promise<boolean> {
  const opened = await open_under_retired_key(
    bytes,
    nonce,
    sync_key,
    conversation_id,
  );

  if (!opened) return false;

  new Uint8Array(opened).fill(0);

  return true;
}

async function read_retired_state_for_merge(
  lookup: { encrypted_state: string; state_nonce: string },
  sync_key: RatchetSyncKey,
  conversation_id: string,
): Promise<SerializedState | null> {
  const opened = await open_under_retired_key(
    base64_to_array(lookup.encrypted_state),
    base64_to_array(lookup.state_nonce),
    sync_key,
    conversation_id,
  );

  if (!opened) return null;

  const bytes = new Uint8Array(opened);

  if (
    vault_requires_bound_state() &&
    !split_ratchet_state_payload(base64_to_array(lookup.encrypted_state))
  ) {
    bytes.fill(0);

    return null;
  }

  try {
    const parsed = JSON.parse(new TextDecoder().decode(bytes));

    if (parsed?.conversation_id !== conversation_id || !parsed.state) {
      return null;
    }

    return parsed as SerializedState;
  } catch {
    return null;
  } finally {
    bytes.fill(0);
  }
}

async function absorb_retired_state(
  ratchet: DoubleRatchet,
  encryption_key: RatchetSyncKey,
  lookup: { encrypted_state: string; state_nonce: string },
): Promise<AbsorbOutcome> {
  const local = await ratchet.serialize();
  const remote = await read_retired_state_for_merge(
    lookup,
    encryption_key,
    local.conversation_id,
  );

  if (!remote || !shares_ratchet_epoch(local.state, remote.state)) {
    return "refused";
  }

  ratchet.adopt_state(merge_retired_ratchet_state(local, remote));
  await ratchet.advance_send_chain_to(retired_send_target(local, remote));

  return "absorbed";
}

async function open_state_from_server(
  encrypted_state: string,
  state_nonce: string,
  sync_key: RatchetSyncKey,
  conversation_id: string,
): Promise<OpenedState> {
  const bytes = base64_to_array(encrypted_state);
  const nonce = base64_to_array(state_nonce);
  const decoder = new TextDecoder();
  const payload = split_ratchet_state_payload(bytes);

  if (payload) {
    const sealed = await try_decrypt(
      sync_key.state_key,
      nonce,
      payload.ciphertext,
      ratchet_state_sync_aad(
        sync_key.user_id,
        conversation_id,
        payload.header_bytes,
      ),
    );

    if (sealed) {
      return {
        plaintext: decoder.decode(sealed),
        opened_bound: true,
        header: payload.header,
      };
    }
  }

  const bound = await try_decrypt(
    sync_key.compat_key,
    nonce,
    bytes,
    ratchet_state_bound_aad(conversation_id),
  );

  if (bound) {
    return {
      plaintext: decoder.decode(bound),
      opened_bound: true,
      header: null,
    };
  }

  const unbound = await try_decrypt(sync_key.compat_key, nonce, bytes);

  if (unbound) {
    return {
      plaintext: decoder.decode(unbound),
      opened_bound: false,
      header: null,
    };
  }

  if (await opens_under_retired_key(bytes, nonce, sync_key, conversation_id)) {
    throw new RatchetStateRetiredKeyError();
  }

  throw new RatchetStateUnreadableError();
}

interface ServerStateRead {
  state: SerializedState;
  versioned: boolean;
}

async function read_server_state(
  encrypted_state: string,
  state_nonce: string,
  encryption_key: RatchetSyncKey,
  conversation_id: string,
  local_state_present: boolean,
): Promise<SerializedState> {
  const read = await read_server_state_record(
    encrypted_state,
    state_nonce,
    encryption_key,
    conversation_id,
    local_state_present,
    false,
  );

  return read.state;
}

async function read_server_state_for_merge(
  encrypted_state: string,
  state_nonce: string,
  encryption_key: RatchetSyncKey,
  conversation_id: string,
): Promise<ServerStateRead> {
  return read_server_state_record(
    encrypted_state,
    state_nonce,
    encryption_key,
    conversation_id,
    true,
    true,
  );
}

async function read_server_state_record(
  encrypted_state: string,
  state_nonce: string,
  sync_key: RatchetSyncKey,
  conversation_id: string,
  local_state_present: boolean,
  merging: boolean,
): Promise<ServerStateRead> {
  const { plaintext, opened_bound, header } = await open_state_from_server(
    encrypted_state,
    state_nonce,
    sync_key,
    conversation_id,
  );
  const confirmed = await read_sync_floor(conversation_id);
  const floor =
    local_state_present && !merging
      ? Math.max(
          confirmed,
          await read_sync_counter(RATCHET_SYNC_SEALED_PREFIX, conversation_id),
        )
      : confirmed;
  const established = floor > 0 || local_state_present;
  const decoded = decode_ratchet_state_container(
    plaintext,
    conversation_id,
    floor,
    opened_bound,
    established,
    merging && !opened_bound,
  );

  if (decoded.kind !== "accepted") {
    throw new Error(`Synced ratchet state refused: ${decoded.kind}`);
  }

  if (!header && vault_requires_bound_state()) {
    throw new Error("Synced ratchet state refused: legacy_after_bound");
  }

  if (header) bound_server_copies.add(conversation_id);

  if (
    header &&
    !header_matches_state(header, decoded.state, decoded.sync_version)
  ) {
    throw new Error("Synced ratchet state refused: header_mismatch");
  }

  const versioned = decoded.sync_version !== null;

  if (versioned || !established) {
    await raise_sync_floor(conversation_id, decoded.sync_version ?? 1);
  }

  return { state: decoded.state, versioned };
}

async function has_local_state(conversation_id: string): Promise<boolean> {
  try {
    return Boolean(await load_ratchet_state(conversation_id));
  } catch {
    return true;
  }
}

async function seal_state_for_server(
  ratchet: DoubleRatchet,
  sync_key: RatchetSyncKey,
): Promise<EncryptedStatePayload & { sync_version: number }> {
  const conversation_id = ratchet.get_conversation_id();
  const sync_version = next_sync_version(
    Math.max(
      await read_sync_floor(conversation_id),
      await read_sync_counter(RATCHET_SYNC_SEALED_PREFIX, conversation_id),
    ),
  );
  const serialized = await ratchet.serialize();
  const container = encode_ratchet_state_container(serialized, sync_version);
  const sealed = (await ratchet_sync_writes_bound(
    bound_server_copies.has(conversation_id),
  ))
    ? await encrypt_state_for_server(
        container,
        { epoch: serialized.state.epoch ?? 0, sync_version },
        sync_key,
        conversation_id,
      )
    : await encrypt_legacy_state_for_server(container, sync_key);

  await raise_sync_counter(
    RATCHET_SYNC_SEALED_PREFIX,
    conversation_id,
    sync_version,
  );

  return { ...sealed, sync_version };
}

const sync_locks = new Map<string, Promise<number>>();
const sync_lock_owners = new Map<string, symbol>();
const known_server_versions = new Map<string, number>();

const MAX_SYNC_ATTEMPTS = 4;

async function put_state(
  conversation_id_b64: string,
  encrypted_state: string,
  state_nonce: string,
  expected_version: number,
) {
  return api_client.put<RatchetStateResponse>(`${API_BASE}/state`, {
    conversation_id: conversation_id_b64,
    encrypted_state,
    state_nonce,
    expected_version,
  });
}

async function post_state(
  conversation_id_b64: string,
  encrypted_state: string,
  state_nonce: string,
) {
  return api_client.post<RatchetStateResponse>(`${API_BASE}/state`, {
    conversation_id: conversation_id_b64,
    encrypted_state,
    state_nonce,
  });
}

type LookupResult =
  | {
      kind: "found";
      version: number;
      encrypted_state: string;
      state_nonce: string;
    }
  | { kind: "not_found" }
  | { kind: "error"; message: string };

async function lookup_server_state(
  conversation_id_b64: string,
): Promise<LookupResult> {
  const response = await api_client.get<RatchetStateResponse>(
    `${API_BASE}/state/${encodeURIComponent(conversation_id_b64)}`,
  );

  if (response.code === "NOT_FOUND") return { kind: "not_found" };

  if (response.error || !response.data) {
    return { kind: "error", message: response.error || "lookup failed" };
  }

  return {
    kind: "found",
    version: response.data.state_version,
    encrypted_state: response.data.encrypted_state,
    state_nonce: response.data.state_nonce,
  };
}

type AbsorbOutcome = "absorbed" | "refused" | "unreadable";

async function absorb_server_state(
  ratchet: DoubleRatchet,
  encryption_key: RatchetSyncKey,
  lookup: Pick<
    Extract<LookupResult, { kind: "found" }>,
    "encrypted_state" | "state_nonce"
  >,
): Promise<AbsorbOutcome> {
  try {
    const local = await ratchet.serialize();
    const remote = await read_server_state_for_merge(
      lookup.encrypted_state,
      lookup.state_nonce,
      encryption_key,
      local.conversation_id,
    );

    if (merge_discards_local_epoch(local, remote.state, remote.versioned)) {
      await archive_ratchet_state(local);
    }

    ratchet.adopt_state(
      merge_ratchet_states(local, remote.state, remote.versioned),
    );

    return "absorbed";
  } catch (error) {
    if (error instanceof RatchetStateRetiredKeyError) {
      return absorb_retired_state(ratchet, encryption_key, lookup).catch(
        () => "refused" as const,
      );
    }

    return error instanceof RatchetStateUnreadableError
      ? "unreadable"
      : "refused";
  }
}

async function absorb_or_refuse_overwrite(
  ratchet: DoubleRatchet,
  encryption_key: RatchetSyncKey,
  lookup: Pick<
    Extract<LookupResult, { kind: "found" }>,
    "encrypted_state" | "state_nonce"
  >,
): Promise<void> {
  const outcome = await absorb_server_state(ratchet, encryption_key, lookup);

  if (outcome === "unreadable") throw new RatchetStateUnreadableError();

  if (outcome === "absorbed") {
    await save_ratchet_state(ratchet).catch(() => undefined);
  }
}

async function do_sync(
  ratchet: DoubleRatchet,
  encryption_key: RatchetSyncKey,
  initial_version_hint?: number,
): Promise<number> {
  const conversation_id = ratchet.get_conversation_id();
  const conversation_id_b64 = array_to_base64(
    new TextEncoder().encode(conversation_id),
  );

  let known_version =
    initial_version_hint ?? known_server_versions.get(conversation_id);

  let last_error = "Failed to sync ratchet state";

  for (let attempt = 0; attempt < MAX_SYNC_ATTEMPTS; attempt++) {
    if (known_version === undefined) {
      const lookup = await lookup_server_state(conversation_id_b64);

      if (lookup.kind === "error") {
        last_error = lookup.message;
        continue;
      }

      if (lookup.kind === "not_found") {
        const sealed = await seal_state_for_server(ratchet, encryption_key);
        const response = await post_state(
          conversation_id_b64,
          sealed.encrypted_state,
          sealed.state_nonce,
        );

        if (!response.error && response.data) {
          known_server_versions.set(
            conversation_id,
            response.data.state_version,
          );
          not_found_cache.delete(conversation_id);
          await raise_sync_floor(conversation_id, sealed.sync_version);

          return response.data.state_version;
        }

        last_error = response.error || "store failed";

        const recheck = await lookup_server_state(conversation_id_b64);

        if (recheck.kind === "found") {
          await absorb_or_refuse_overwrite(ratchet, encryption_key, recheck);
          known_version = recheck.version;
        }

        continue;
      } else {
        await absorb_or_refuse_overwrite(ratchet, encryption_key, lookup);
        known_version = lookup.version;
      }
    }

    const sealed = await seal_state_for_server(ratchet, encryption_key);
    const put_response = await put_state(
      conversation_id_b64,
      sealed.encrypted_state,
      sealed.state_nonce,
      known_version,
    );

    if (!put_response.error && put_response.data) {
      known_server_versions.set(
        conversation_id,
        put_response.data.state_version,
      );
      await raise_sync_floor(conversation_id, sealed.sync_version);

      return put_response.data.state_version;
    }

    last_error = put_response.error || "update failed";

    const recheck = await lookup_server_state(conversation_id_b64);

    if (recheck.kind === "not_found") {
      known_version = undefined;
      continue;
    }

    if (recheck.kind === "error") {
      continue;
    }

    if (recheck.version === known_version) {
      await new Promise((r) => setTimeout(r, 50 * (attempt + 1)));
    } else {
      await absorb_or_refuse_overwrite(ratchet, encryption_key, recheck);
    }

    known_version = recheck.version;
  }

  throw new Error(last_error);
}

export async function sync_ratchet_to_server(
  ratchet: DoubleRatchet,
  encryption_key: RatchetSyncKey,
  server_version?: number,
): Promise<number> {
  const conversation_id = ratchet.get_conversation_id();
  const pending = sync_locks.get(conversation_id);

  const run = (async () => {
    if (pending) {
      try {
        await pending;
      } catch {
        /* ignore prior failure and retry with a fresh sync */
      }
    }

    return do_sync(ratchet, encryption_key, server_version);
  })();

  const lock_owner = Symbol();

  sync_locks.set(conversation_id, run);
  sync_lock_owners.set(conversation_id, lock_owner);

  try {
    return await run;
  } finally {
    if (sync_lock_owners.get(conversation_id) === lock_owner) {
      sync_locks.delete(conversation_id);
      sync_lock_owners.delete(conversation_id);
    }
  }
}

async function fetch_server_state_record(
  conversation_id: string,
): Promise<RatchetStateResponse | null> {
  const now = Date.now();
  const cached_not_found = not_found_cache.get(conversation_id);

  if (cached_not_found !== undefined && now < cached_not_found) {
    return null;
  }

  const conversation_id_b64 = array_to_base64(
    new TextEncoder().encode(conversation_id),
  );

  const response = await api_client.get<RatchetStateResponse>(
    `${API_BASE}/state/${encodeURIComponent(conversation_id_b64)}`,
  );

  if (response.code === "NOT_FOUND") {
    not_found_cache.set(conversation_id, now + NOT_FOUND_TTL_MS);
    trim_map_to_size(not_found_cache, MAX_CONVERSATION_CACHE);

    return null;
  }

  if (response.error || !response.data) {
    throw new Error(response.error || "Failed to load ratchet state");
  }

  return response.data;
}

export async function load_ratchet_from_server(
  conversation_id: string,
  encryption_key: RatchetSyncKey,
): Promise<{ ratchet: DoubleRatchet; version: number } | null> {
  const record = await fetch_server_state_record(conversation_id);

  if (!record) return null;

  const serialized = await read_server_state(
    record.encrypted_state,
    record.state_nonce,
    encryption_key,
    conversation_id,
    await has_local_state(conversation_id),
  );
  const ratchet = DoubleRatchet.deserialize(serialized);

  return { ratchet, version: record.state_version };
}

interface ListedRatchetState {
  conversation_id: string;
  version: number;
  updated_at: string;
  encrypted_state?: string;
  state_nonce?: string;
}

export async function load_ratchet_for_merge(
  conversation_id: string,
  encryption_key: RatchetSyncKey,
): Promise<ServerStateRead | null> {
  const record = await fetch_server_state_record(conversation_id);

  if (!record) return null;

  return read_server_state_for_merge(
    record.encrypted_state,
    record.state_nonce,
    encryption_key,
    conversation_id,
  );
}

async function load_listed_ratchet_state(
  listed: ListedRatchetState,
  encryption_key: RatchetSyncKey,
): Promise<{ ratchet: DoubleRatchet; version: number } | null> {
  if (!listed.encrypted_state || !listed.state_nonce) {
    return load_ratchet_from_server(listed.conversation_id, encryption_key);
  }

  const serialized = await read_server_state(
    listed.encrypted_state,
    listed.state_nonce,
    encryption_key,
    listed.conversation_id,
    await has_local_state(listed.conversation_id),
  );

  return {
    ratchet: DoubleRatchet.deserialize(serialized),
    version: listed.version,
  };
}

async function absorb_listed_into_local(
  local_ratchet: DoubleRatchet,
  listed: ListedRatchetState,
  encryption_key: RatchetSyncKey,
): Promise<DoubleRatchet | null> {
  const record =
    listed.encrypted_state && listed.state_nonce
      ? {
          encrypted_state: listed.encrypted_state,
          state_nonce: listed.state_nonce,
        }
      : await fetch_server_state_record(listed.conversation_id);

  if (!record) return null;

  const local = await local_ratchet.serialize();
  const remote = await read_server_state_for_merge(
    record.encrypted_state,
    record.state_nonce,
    encryption_key,
    listed.conversation_id,
  );

  if (merge_discards_local_epoch(local, remote.state, remote.versioned)) {
    await archive_ratchet_state(local);
  }

  local_ratchet.adopt_state(
    merge_ratchet_states(local, remote.state, remote.versioned),
  );

  return local_ratchet;
}

export async function list_server_ratchet_states(
  _encryption_key: RatchetSyncKey,
): Promise<ListedRatchetState[]> {
  const response = await api_client.get<RatchetStateResponse[]>(
    `${API_BASE}/states`,
  );

  if (response.error || !response.data) {
    throw new Error(response.error || "Failed to list ratchet states");
  }

  return response.data.map((r) => ({
    conversation_id: new TextDecoder().decode(
      base64_to_array(r.conversation_id),
    ),
    version: r.state_version,
    updated_at: r.updated_at,
    encrypted_state: r.encrypted_state,
    state_nonce: r.state_nonce,
  }));
}

interface SyncResult {
  synced: string[];
  conflicts: string[];
  errors: Array<{ conversation_id: string; error: string }>;
}

export async function sync_all_ratchet_states(
  encryption_key: RatchetSyncKey,
): Promise<SyncResult> {
  const result: SyncResult = { synced: [], conflicts: [], errors: [] };

  try {
    const server_states = await list_server_ratchet_states(encryption_key);
    const server_map = new Map(
      server_states.map((s) => [s.conversation_id, s]),
    );

    const local_states = await import("./ratchet_state_store").then((m) =>
      m.list_ratchet_conversations(),
    );

    for (const conversation_id of local_states) {
      try {
        const local_ratchet = await load_ratchet_state(conversation_id);

        if (!local_ratchet) continue;

        const server_info = server_map.get(conversation_id);

        if (!server_info) {
          await sync_ratchet_to_server(local_ratchet, encryption_key);
          local_ratchet.mark_synced();
          await save_ratchet_state(local_ratchet);
          result.synced.push(conversation_id);
        } else if (local_ratchet.is_dirty_since_sync()) {
          try {
            if (server_info.encrypted_state && server_info.state_nonce) {
              await absorb_or_refuse_overwrite(local_ratchet, encryption_key, {
                encrypted_state: server_info.encrypted_state,
                state_nonce: server_info.state_nonce,
              });
            }
            await sync_ratchet_to_server(
              local_ratchet,
              encryption_key,
              server_info.version,
            );
            local_ratchet.mark_synced();
            await save_ratchet_state(local_ratchet);
            result.synced.push(conversation_id);
          } catch {
            result.conflicts.push(conversation_id);
          }
        } else if (server_info.version > local_ratchet.get_state_version()) {
          try {
            const absorbed = await absorb_listed_into_local(
              local_ratchet,
              server_info,
              encryption_key,
            );

            if (absorbed) {
              absorbed.mark_synced();
              await save_ratchet_state(absorbed);
              result.synced.push(conversation_id);
            }
          } catch (e) {
            result.errors.push({
              conversation_id,
              error: user_facing_error(e, "Unknown error"),
            });
          }
        }

        server_map.delete(conversation_id);
      } catch (e) {
        result.errors.push({
          conversation_id,
          error: user_facing_error(e, "Unknown error"),
        });
      }
    }

    for (const [conversation_id, server_info] of server_map) {
      try {
        const loaded = await load_listed_ratchet_state(
          server_info,
          encryption_key,
        );

        if (loaded) {
          loaded.ratchet.mark_synced();
          await save_ratchet_state(loaded.ratchet);
          result.synced.push(conversation_id);
        }
      } catch (e) {
        result.errors.push({
          conversation_id,
          error: user_facing_error(e, "Unknown error"),
        });
      }
    }
  } catch (e) {
    result.errors.push({
      conversation_id: "_global",
      error: user_facing_error(e, "Failed to sync ratchet states"),
    });
  }

  return result;
}

export async function derive_ratchet_encryption_key_from_base(
  key_material: CryptoKey,
): Promise<CryptoKey> {
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      salt: new TextEncoder().encode("Aster Mail_Ratchet_State_Encryption"),
      info: new TextEncoder().encode("ratchet_state_key"),
      hash: HASH_ALG,
    },
    key_material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function derive_ratchet_state_key_from_base(
  key_material: CryptoKey,
): Promise<CryptoKey> {
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      salt: new TextEncoder().encode("Aster Mail_Ratchet_State_Sync"),
      info: new TextEncoder().encode("ratchet_state_sync_key_v3"),
      hash: HASH_ALG,
    },
    key_material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function import_hkdf_base(master_key: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", master_key, "HKDF", false, [
    "deriveKey",
  ]);
}

export async function derive_ratchet_encryption_key(
  master_key: Uint8Array,
): Promise<CryptoKey> {
  return derive_ratchet_encryption_key_from_base(
    await import_hkdf_base(master_key),
  );
}

export async function derive_ratchet_sync_key(
  master_key: Uint8Array,
  user_id: string,
): Promise<RatchetSyncKey> {
  if (!user_id) throw new Error("Ratchet sync needs an account");

  const base = await import_hkdf_base(master_key);

  return {
    state_key: await derive_ratchet_state_key_from_base(base),
    compat_key: await derive_ratchet_encryption_key_from_base(base),
    user_id,
  };
}
