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
import { decrypt_aes_gcm_with_fallback } from "@/services/crypto/legacy_keks";
import { api_client } from "@/services/api/client";
import {
  DoubleRatchet,
  save_ratchet_state,
  load_ratchet_state,
} from "./double_ratchet";

const HASH_ALG = ["SHA", "256"].join("-");
const API_BASE = "/crypto/v1/ratchet";

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

function array_to_base64(array: Uint8Array): string {
  return btoa(String.fromCharCode(...array));
}

function base64_to_array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
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

async function decrypt_state_from_server(
  encrypted_state: string,
  state_nonce: string,
  encryption_key: CryptoKey,
): Promise<string> {
  const ciphertext = base64_to_array(encrypted_state);
  const nonce = base64_to_array(state_nonce);

  const plaintext = await decrypt_aes_gcm_with_fallback(encryption_key, ciphertext, nonce);

  const decoder = new TextDecoder();

  return decoder.decode(plaintext);
}

const sync_locks = new Map<string, Promise<number>>();
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
  | { kind: "found"; version: number }
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

  return { kind: "found", version: response.data.state_version };
}

async function do_sync(
  ratchet: DoubleRatchet,
  encryption_key: CryptoKey,
  initial_version_hint?: number,
): Promise<number> {
  const serialized = await ratchet.serialize();
  const state_json = JSON.stringify(serialized);
  const conversation_id = ratchet.get_conversation_id();
  const conversation_id_b64 = array_to_base64(
    new TextEncoder().encode(conversation_id),
  );

  let known_version =
    initial_version_hint ?? known_server_versions.get(conversation_id);

  let last_error = "Failed to sync ratchet state";

  for (let attempt = 0; attempt < MAX_SYNC_ATTEMPTS; attempt++) {
    const { encrypted_state, state_nonce } = await encrypt_state_for_server(
      state_json,
      encryption_key,
    );

    if (known_version === undefined) {
      const lookup = await lookup_server_state(conversation_id_b64);

      if (lookup.kind === "error") {
        last_error = lookup.message;
        continue;
      }

      if (lookup.kind === "not_found") {
        const response = await post_state(
          conversation_id_b64,
          encrypted_state,
          state_nonce,
        );

        if (!response.error && response.data) {
          known_server_versions.set(
            conversation_id,
            response.data.state_version,
          );

          return response.data.state_version;
        }

        last_error = response.error || "store failed";

        const recheck = await lookup_server_state(conversation_id_b64);

        if (recheck.kind === "found") {
          known_version = recheck.version;
        } else {
          continue;
        }
      } else {
        known_version = lookup.version;
      }
    }

    const put_response = await put_state(
      conversation_id_b64,
      encrypted_state,
      state_nonce,
      known_version,
    );

    if (!put_response.error && put_response.data) {
      known_server_versions.set(
        conversation_id,
        put_response.data.state_version,
      );

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
        /* ignore prior failure, we'll try fresh */
      }
    }

    return do_sync(ratchet, encryption_key, server_version);
  })();

  sync_locks.set(conversation_id, run);

  try {
    return await run;
  } finally {
    if (sync_locks.get(conversation_id) === run) {
      sync_locks.delete(conversation_id);
    }
  }
}

export async function load_ratchet_from_server(
  conversation_id: string,
  encryption_key: CryptoKey,
): Promise<{ ratchet: DoubleRatchet; version: number } | null> {
  const conversation_id_b64 = array_to_base64(
    new TextEncoder().encode(conversation_id),
  );

  const response = await api_client.get<RatchetStateResponse>(
    `${API_BASE}/state/${encodeURIComponent(conversation_id_b64)}`,
  );

  if (response.code === "NOT_FOUND") {
    return null;
  }

  if (response.error || !response.data) {
    throw new Error(response.error || "Failed to load ratchet state");
  }

  const state_json = await decrypt_state_from_server(
    response.data.encrypted_state,
    response.data.state_nonce,
    encryption_key,
  );

  const serialized = JSON.parse(state_json);
  const ratchet = DoubleRatchet.deserialize(serialized);

  return { ratchet, version: response.data.state_version };
}

export async function delete_ratchet_from_server(
  conversation_id: string,
): Promise<void> {
  const conversation_id_b64 = array_to_base64(
    new TextEncoder().encode(conversation_id),
  );

  const response = await api_client.delete(
    `${API_BASE}/state/${encodeURIComponent(conversation_id_b64)}`,
  );

  if (response.error && response.code !== "NOT_FOUND") {
    throw new Error(response.error || "Failed to delete ratchet state");
  }
}

export async function list_server_ratchet_states(
  _encryption_key: CryptoKey,
): Promise<
  Array<{ conversation_id: string; version: number; updated_at: string }>
> {
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

    const local_states = await import("./double_ratchet").then((m) =>
      m.list_ratchet_conversations(),
    );

    for (const conversation_id of local_states) {
      try {
        const local_ratchet = await load_ratchet_state(conversation_id);

        if (!local_ratchet) continue;

        const server_info = server_map.get(conversation_id);

        if (!server_info) {
          await sync_ratchet_to_server(local_ratchet, encryption_key);
          result.synced.push(conversation_id);
        } else if (local_ratchet.get_state_version() > server_info.version) {
          try {
            await sync_ratchet_to_server(
              local_ratchet,
              encryption_key,
              server_info.version,
            );
            result.synced.push(conversation_id);
          } catch {
            result.conflicts.push(conversation_id);
          }
        }

        server_map.delete(conversation_id);
      } catch (e) {
        result.errors.push({
          conversation_id,
          error: e instanceof Error ? e.message : "Unknown error",
        });
      }
    }

    for (const [conversation_id] of server_map) {
      try {
        const loaded = await load_ratchet_from_server(
          conversation_id,
          encryption_key,
        );

        if (loaded) {
          await save_ratchet_state(loaded.ratchet);
          result.synced.push(conversation_id);
        }
      } catch (e) {
        result.errors.push({
          conversation_id,
          error: e instanceof Error ? e.message : "Unknown error",
        });
      }
    }
  } catch (e) {
    result.errors.push({
      conversation_id: "_global",
      error: e instanceof Error ? e.message : "Failed to sync ratchet states",
    });
  }

  return result;
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
