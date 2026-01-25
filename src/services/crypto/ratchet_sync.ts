import {
  DoubleRatchet,
  save_ratchet_state,
  load_ratchet_state,
} from "./double_ratchet";

const API_BASE = "/api/ratchet";

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

  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: nonce },
    encryption_key,
    ciphertext,
  );

  const decoder = new TextDecoder();

  return decoder.decode(plaintext);
}

async function get_auth_headers(): Promise<Headers> {
  const token = sessionStorage.getItem("auth_token");
  const headers = new Headers();

  headers.set("Content-Type", "application/json");
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  return headers;
}

export async function sync_ratchet_to_server(
  ratchet: DoubleRatchet,
  encryption_key: CryptoKey,
  server_version?: number,
): Promise<number> {
  const serialized = await ratchet.serialize();
  const state_json = JSON.stringify(serialized);
  const conversation_id_b64 = array_to_base64(
    new TextEncoder().encode(ratchet.get_conversation_id()),
  );

  const { encrypted_state, state_nonce } = await encrypt_state_for_server(
    state_json,
    encryption_key,
  );

  const headers = await get_auth_headers();

  if (server_version !== undefined) {
    const response = await fetch(`${API_BASE}/state`, {
      method: "PUT",
      headers,
      body: JSON.stringify({
        conversation_id: conversation_id_b64,
        encrypted_state,
        state_nonce,
        expected_version: server_version,
      }),
    });

    if (!response.ok) {
      const error = await response.json();

      throw new Error(error.error || "Failed to update ratchet state");
    }

    const result: RatchetStateResponse = await response.json();

    return result.state_version;
  } else {
    const response = await fetch(`${API_BASE}/state`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        conversation_id: conversation_id_b64,
        encrypted_state,
        state_nonce,
      }),
    });

    if (!response.ok) {
      const error = await response.json();

      throw new Error(error.error || "Failed to store ratchet state");
    }

    const result: RatchetStateResponse = await response.json();

    return result.state_version;
  }
}

export async function load_ratchet_from_server(
  conversation_id: string,
  encryption_key: CryptoKey,
): Promise<{ ratchet: DoubleRatchet; version: number } | null> {
  const conversation_id_b64 = array_to_base64(
    new TextEncoder().encode(conversation_id),
  );
  const headers = await get_auth_headers();

  const response = await fetch(
    `${API_BASE}/state/${encodeURIComponent(conversation_id_b64)}`,
    { method: "GET", headers },
  );

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const error = await response.json();

    throw new Error(error.error || "Failed to load ratchet state");
  }

  const result: RatchetStateResponse = await response.json();
  const state_json = await decrypt_state_from_server(
    result.encrypted_state,
    result.state_nonce,
    encryption_key,
  );

  const serialized = JSON.parse(state_json);
  const ratchet = DoubleRatchet.deserialize(serialized);

  return { ratchet, version: result.state_version };
}

export async function delete_ratchet_from_server(
  conversation_id: string,
): Promise<void> {
  const conversation_id_b64 = array_to_base64(
    new TextEncoder().encode(conversation_id),
  );
  const headers = await get_auth_headers();

  const response = await fetch(
    `${API_BASE}/state/${encodeURIComponent(conversation_id_b64)}`,
    { method: "DELETE", headers },
  );

  if (!response.ok && response.status !== 404) {
    const error = await response.json();

    throw new Error(error.error || "Failed to delete ratchet state");
  }
}

export async function list_server_ratchet_states(
  _encryption_key: CryptoKey,
): Promise<
  Array<{ conversation_id: string; version: number; updated_at: string }>
> {
  const headers = await get_auth_headers();

  const response = await fetch(`${API_BASE}/states`, {
    method: "GET",
    headers,
  });

  if (!response.ok) {
    const error = await response.json();

    throw new Error(error.error || "Failed to list ratchet states");
  }

  const results: RatchetStateResponse[] = await response.json();

  return results.map((r) => ({
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
      hash: "SHA-256",
    },
    key_material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}
