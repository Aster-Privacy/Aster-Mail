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
} from "./ratchet_state_merge";
import {
  decode_ratchet_state_container,
  encode_ratchet_state_container,
  next_sync_version,
  ratchet_state_bound_aad,
} from "./ratchet_state_container";
import { raise_sync_floor, read_sync_floor } from "./ratchet_sync_floor";

import { user_facing_error } from "@/utils/user_facing_error";
import { api_client } from "@/services/api/client";
import { decrypt_aes_gcm_with_fallback } from "@/services/crypto/legacy_keks";
import { HASH_ALG } from "@/services/crypto/constants";

const API_BASE = "/crypto/v1/ratchet";

const NOT_FOUND_TTL_MS = 5 * 60 * 1000;
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

async function encrypt_state_for_server(
  state: string,
  encryption_key: CryptoKey,
): Promise<EncryptedStatePayload> {
  const encoder = new TextEncoder();
  const state_bytes = encoder.encode(state);
  const nonce = crypto.getRandomValues(new Uint8Array(12));

  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    encryption_key,
    state_bytes,
  );

  return {
    encrypted_state: array_to_base64(new Uint8Array(ciphertext)),
    state_nonce: array_to_base64(nonce),
  };
}

async function open_state_from_server(
  encrypted_state: string,
  state_nonce: string,
  encryption_key: CryptoKey,
  conversation_id: string,
): Promise<{ plaintext: string; opened_bound: boolean }> {
  const ciphertext = base64_to_array(encrypted_state);
  const nonce = base64_to_array(state_nonce);
  const decoder = new TextDecoder();

  try {
    const bound = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: nonce,
        additionalData: ratchet_state_bound_aad(conversation_id),
      },
      encryption_key,
      ciphertext,
    );

    return { plaintext: decoder.decode(bound), opened_bound: true };
  } catch {
    const legacy = await decrypt_aes_gcm_with_fallback(
      encryption_key,
      ciphertext,
      nonce,
    );

    return { plaintext: decoder.decode(legacy), opened_bound: false };
  }
}

async function read_server_state(
  encrypted_state: string,
  state_nonce: string,
  encryption_key: CryptoKey,
  conversation_id: string,
): Promise<SerializedState> {
  const { plaintext, opened_bound } = await open_state_from_server(
    encrypted_state,
    state_nonce,
    encryption_key,
    conversation_id,
  );
  const decoded = decode_ratchet_state_container(
    plaintext,
    conversation_id,
    await read_sync_floor(conversation_id),
    opened_bound,
  );

  if (decoded.kind !== "accepted") {
    throw new Error(`Synced ratchet state refused: ${decoded.kind}`);
  }

  if (decoded.sync_version !== null) {
    await raise_sync_floor(conversation_id, decoded.sync_version);
  }

  return decoded.state;
}

async function observe_server_version(
  encrypted_state: string | undefined,
  state_nonce: string | undefined,
  encryption_key: CryptoKey,
  conversation_id: string,
): Promise<void> {
  if (!encrypted_state || !state_nonce) return;

  try {
    await read_server_state(
      encrypted_state,
      state_nonce,
      encryption_key,
      conversation_id,
    );
  } catch {
    return;
  }
}

async function seal_state_for_server(
  ratchet: DoubleRatchet,
  encryption_key: CryptoKey,
): Promise<EncryptedStatePayload & { sync_version: number }> {
  const sync_version = next_sync_version(
    await read_sync_floor(ratchet.get_conversation_id()),
    Date.now(),
  );
  const sealed = await encrypt_state_for_server(
    encode_ratchet_state_container(await ratchet.serialize(), sync_version),
    encryption_key,
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

async function absorb_server_state(
  ratchet: DoubleRatchet,
  encryption_key: CryptoKey,
  lookup: Extract<LookupResult, { kind: "found" }>,
): Promise<boolean> {
  try {
    const local = await ratchet.serialize();
    const remote = await read_server_state(
      lookup.encrypted_state,
      lookup.state_nonce,
      encryption_key,
      local.conversation_id,
    );

    if (merge_discards_local_epoch(local, remote)) {
      await archive_ratchet_state(local);
    }

    ratchet.adopt_state(merge_ratchet_states(local, remote));

    return true;
  } catch {
    return false;
  }
}

async function do_sync(
  ratchet: DoubleRatchet,
  encryption_key: CryptoKey,
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
          if (await absorb_server_state(ratchet, encryption_key, recheck)) {
            await save_ratchet_state(ratchet).catch(() => undefined);
          }

          known_version = recheck.version;
        }

        continue;
      } else {
        await observe_server_version(
          lookup.encrypted_state,
          lookup.state_nonce,
          encryption_key,
          conversation_id,
        );
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
    } else if (await absorb_server_state(ratchet, encryption_key, recheck)) {
      await save_ratchet_state(ratchet).catch(() => undefined);
    }

    known_version = recheck.version;
  }

  throw new Error(last_error);
}

export async function sync_ratchet_to_server(
  ratchet: DoubleRatchet,
  encryption_key: CryptoKey,
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

export async function load_ratchet_from_server(
  conversation_id: string,
  encryption_key: CryptoKey,
): Promise<{ ratchet: DoubleRatchet; version: number } | null> {
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

    return null;
  }

  if (response.error || !response.data) {
    throw new Error(response.error || "Failed to load ratchet state");
  }

  const serialized = await read_server_state(
    response.data.encrypted_state,
    response.data.state_nonce,
    encryption_key,
    conversation_id,
  );
  const ratchet = DoubleRatchet.deserialize(serialized);

  return { ratchet, version: response.data.state_version };
}

interface ListedRatchetState {
  conversation_id: string;
  version: number;
  updated_at: string;
  encrypted_state?: string;
  state_nonce?: string;
}

async function load_listed_ratchet_state(
  listed: ListedRatchetState,
  encryption_key: CryptoKey,
): Promise<{ ratchet: DoubleRatchet; version: number } | null> {
  if (!listed.encrypted_state || !listed.state_nonce) {
    return load_ratchet_from_server(listed.conversation_id, encryption_key);
  }

  const serialized = await read_server_state(
    listed.encrypted_state,
    listed.state_nonce,
    encryption_key,
    listed.conversation_id,
  );

  return {
    ratchet: DoubleRatchet.deserialize(serialized),
    version: listed.version,
  };
}

export async function list_server_ratchet_states(
  _encryption_key: CryptoKey,
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
  encryption_key: CryptoKey,
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
            await observe_server_version(
              server_info.encrypted_state,
              server_info.state_nonce,
              encryption_key,
              conversation_id,
            );
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

export async function derive_ratchet_encryption_key(
  master_key: Uint8Array,
): Promise<CryptoKey> {
  const key_material = await crypto.subtle.importKey(
    "raw",
    master_key,
    "HKDF",
    false,
    ["deriveKey"],
  );

  return derive_ratchet_encryption_key_from_base(key_material);
}
