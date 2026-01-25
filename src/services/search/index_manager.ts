import type { EncryptedIndex, SearchIndex } from "../crypto/search_crypto";
import type {
  SearchableFields,
  EncryptedIndexPayload,
  IndexSyncRequest,
  IndexSyncResponse,
  FetchIndexResponse,
} from "./types";

import {
  get_search_crypto,
  reset_search_crypto,
} from "../crypto/search_crypto";
import { api_client } from "../api/client";

import { array_to_base64, base64_to_array } from "./utils";
import { clear_search_cache } from "./cache";

let local_index_version = 0;
let last_sync_time = 0;
let sync_timeout: ReturnType<typeof setTimeout> | null = null;

const SYNC_DEBOUNCE_MS = 5000;

export async function sync_encrypted_index(): Promise<{
  success: boolean;
  synced: boolean;
  error?: string;
}> {
  const search_crypto = get_search_crypto();

  try {
    await search_crypto.initialize();

    const fetch_response = await api_client.get<FetchIndexResponse>(
      "/search/encrypted-index",
    );

    if (fetch_response.error) {
      return { success: false, synced: false, error: fetch_response.error };
    }

    const server_data = fetch_response.data;

    if (!server_data) {
      return { success: false, synced: false, error: "No data received" };
    }

    if (
      server_data.encrypted_index &&
      server_data.version > local_index_version
    ) {
      const encrypted: EncryptedIndex = {
        nonce: base64_to_array(server_data.encrypted_index.nonce),
        ciphertext: base64_to_array(server_data.encrypted_index.ciphertext),
        version: server_data.encrypted_index.version,
        checksum: server_data.encrypted_index.checksum,
      };

      await search_crypto.decrypt_index(encrypted);
      local_index_version = server_data.version;
      search_crypto.mark_index_clean();

      return { success: true, synced: true };
    }

    if (search_crypto.is_index_dirty()) {
      const encrypted = await search_crypto.encrypt_index();

      const payload: EncryptedIndexPayload = {
        nonce: array_to_base64(encrypted.nonce),
        ciphertext: array_to_base64(encrypted.ciphertext),
        version: encrypted.version,
        checksum: encrypted.checksum,
        updated_at: Date.now(),
      };

      const sync_request: IndexSyncRequest = {
        encrypted_index: payload,
        version: local_index_version + 1,
      };

      const sync_response = await api_client.post<IndexSyncResponse>(
        "/search/encrypted-index/sync",
        sync_request,
      );

      if (sync_response.error) {
        return { success: false, synced: false, error: sync_response.error };
      }

      if (sync_response.data?.conflict) {
        return {
          success: false,
          synced: false,
          error: "Version conflict - please refresh",
        };
      }

      if (sync_response.data?.success) {
        local_index_version = sync_response.data.version;
        search_crypto.mark_index_clean();

        return { success: true, synced: true };
      }
    }

    return { success: true, synced: false };
  } catch (error) {
    return {
      success: false,
      synced: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

async function perform_sync(): Promise<void> {
  last_sync_time = Date.now();

  try {
    await sync_encrypted_index();
  } catch {
    schedule_index_sync();
  }
}

export function schedule_index_sync(): void {
  const now = Date.now();

  if (now - last_sync_time < SYNC_DEBOUNCE_MS) {
    if (sync_timeout) {
      clearTimeout(sync_timeout);
    }

    sync_timeout = setTimeout(
      () => {
        sync_timeout = null;
        perform_sync();
      },
      SYNC_DEBOUNCE_MS - (now - last_sync_time),
    );
  } else {
    perform_sync();
  }
}

export async function force_sync_index(): Promise<{
  success: boolean;
  error?: string;
}> {
  if (sync_timeout) {
    clearTimeout(sync_timeout);
    sync_timeout = null;
  }

  const result = await sync_encrypted_index();

  return { success: result.success, error: result.error };
}

export async function load_index_from_server(): Promise<{
  success: boolean;
  document_count: number;
  error?: string;
}> {
  const search_crypto = get_search_crypto();

  try {
    await search_crypto.initialize();

    const fetch_response = await api_client.get<FetchIndexResponse>(
      "/search/encrypted-index",
    );

    if (fetch_response.error) {
      return { success: false, document_count: 0, error: fetch_response.error };
    }

    const server_data = fetch_response.data;

    if (!server_data || !server_data.encrypted_index) {
      return { success: true, document_count: 0 };
    }

    const encrypted: EncryptedIndex = {
      nonce: base64_to_array(server_data.encrypted_index.nonce),
      ciphertext: base64_to_array(server_data.encrypted_index.ciphertext),
      version: server_data.encrypted_index.version,
      checksum: server_data.encrypted_index.checksum,
    };

    const index = await search_crypto.decrypt_index(encrypted);

    local_index_version = server_data.version;
    search_crypto.mark_index_clean();

    return { success: true, document_count: index.total_documents };
  } catch (error) {
    return {
      success: false,
      document_count: 0,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function build_full_index(
  emails: Array<{
    id: string;
    subject?: string;
    body?: string;
    sender_email?: string;
    sender_name?: string;
    recipient_emails?: string[];
    recipient_names?: string[];
    timestamp?: string;
    folder?: string;
    has_attachments?: boolean;
  }>,
): Promise<{
  success: boolean;
  document_count: number;
  error?: string;
}> {
  const search_crypto = get_search_crypto();

  try {
    await search_crypto.initialize();
    const index = await search_crypto.build_index(emails);

    schedule_index_sync();

    return { success: true, document_count: index.total_documents };
  } catch (error) {
    return {
      success: false,
      document_count: 0,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export function get_local_index_stats(): {
  total_documents: number;
  total_tokens: number;
  created_at: number;
  updated_at: number;
  version: number;
  is_dirty: boolean;
  local_version: number;
} {
  const search_crypto = get_search_crypto();
  const stats = search_crypto.get_index_stats();

  return {
    ...stats,
    is_dirty: search_crypto.is_index_dirty(),
    local_version: local_index_version,
  };
}

export function get_local_index(): SearchIndex {
  return get_search_crypto().get_index();
}

export function clear_local_index(): void {
  reset_search_crypto();
  local_index_version = 0;
  clear_search_cache();
}

export async function remove_from_local_index(
  message_ids: string[],
  options: { sync_to_server?: boolean } = {},
): Promise<void> {
  const { sync_to_server = true } = options;

  const search_crypto = get_search_crypto();

  await search_crypto.update_index([], message_ids);

  if (sync_to_server) {
    schedule_index_sync();
  }
}

let global_index_built = false;
let global_index_building = false;
let global_index_promise: Promise<{
  success: boolean;
  indexed_count: number;
  error?: string;
}> | null = null;

export async function build_global_search_index(): Promise<{
  success: boolean;
  indexed_count: number;
  error?: string;
}> {
  if (global_index_building && global_index_promise) {
    return global_index_promise;
  }

  if (global_index_built) {
    return { success: true, indexed_count: 0 };
  }

  global_index_building = true;

  global_index_promise = (async () => {
    try {
      const { list_mail_items } = await import("../api/mail");
      const { get_passphrase_bytes, has_passphrase_in_memory } = await import(
        "../crypto/memory_key_store"
      );
      const { decrypt_envelope_with_bytes, base64_to_array } = await import(
        "../crypto/envelope"
      );
      const { zero_uint8_array } = await import("../crypto/secure_memory");
      const { bulk_index_with_worker } = await import(
        "../crypto/search_worker_client"
      );

      const has_passphrase = has_passphrase_in_memory();

      if (!has_passphrase) {
        global_index_building = false;

        return { success: false, indexed_count: 0, error: "Session expired" };
      }

      const all_messages: Array<{ id: string; fields: SearchableFields }> = [];

      const item_types: Array<"received" | "sent" | "draft" | "scheduled"> = [
        "received",
        "sent",
        "draft",
        "scheduled",
      ];

      const all_items: Array<{
        id: string;
        encrypted_envelope: string;
        envelope_nonce: string;
        item_type: string;
      }> = [];

      for (const item_type of item_types) {
        const response = await list_mail_items({ limit: 200, item_type });

        if (response.data?.items) {
          all_items.push(...response.data.items);
        }
      }

      if (all_items.length === 0) {
        global_index_building = false;

        return { success: true, indexed_count: 0 };
      }

      for (const item of all_items) {
        const passphrase_bytes = get_passphrase_bytes();

        if (!passphrase_bytes) {
          continue;
        }

        try {
          const version_bytes = base64_to_array(item.envelope_nonce);

          if (version_bytes.length === 1 && version_bytes[0] === 1) {
            interface DecryptedEnvelope {
              from: { email: string; name?: string };
              to: Array<{ email: string; name?: string }>;
              subject: string;
              body_text: string;
              sent_at?: string;
            }

            const envelope =
              await decrypt_envelope_with_bytes<DecryptedEnvelope>(
                item.encrypted_envelope,
                passphrase_bytes,
              );

            zero_uint8_array(passphrase_bytes);

            if (envelope) {
              all_messages.push({
                id: item.id,
                fields: {
                  subject: envelope.subject || "",
                  body: envelope.body_text || "",
                  sender_email: envelope.from.email,
                  sender_name: envelope.from.name,
                  recipient_emails: envelope.to.map((r) => r.email),
                  recipient_names: envelope.to
                    .map((r) => r.name)
                    .filter((n): n is string => !!n),
                },
              });
            }
          } else {
            zero_uint8_array(passphrase_bytes);
          }
        } catch {
          const passphrase_bytes = get_passphrase_bytes();

          if (passphrase_bytes) {
            zero_uint8_array(passphrase_bytes);
          }
        }
      }

      if (all_messages.length > 0) {
        await bulk_index_with_worker(all_messages);
      }

      global_index_built = true;
      global_index_building = false;
      global_index_promise = null;

      return { success: true, indexed_count: all_messages.length };
    } catch (error) {
      global_index_building = false;
      global_index_promise = null;

      return {
        success: false,
        indexed_count: 0,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  })();

  return global_index_promise;
}

export function is_global_index_ready(): boolean {
  return global_index_built;
}

export function reset_global_index(): void {
  global_index_built = false;
  global_index_building = false;
  global_index_promise = null;
}
