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
import { array_to_base64 } from "./base64";
import { load_storage_write_key_bytes } from "./storage_write_key";
import { get_vault_from_memory } from "./memory_key_store";
import { derive_ratchet_sync_key, type RatchetSyncKey } from "./ratchet_sync";

import { HASH_ALG } from "@/services/crypto/constants";
import { ignore_error } from "@/lib/ignore_error";

export async function derive_conversation_id(
  email_a: string,
  email_b: string,
): Promise<string> {
  const sorted = [email_a.toLowerCase(), email_b.toLowerCase()].sort();
  const input = new TextEncoder().encode(sorted.join(":"));
  const hash = await crypto.subtle.digest(HASH_ALG, input);

  return array_to_base64(new Uint8Array(hash));
}

const conversation_queues = new Map<string, Promise<unknown>>();

export async function run_serialized_for_conversation<T>(
  conversation_id: string,
  task: () => Promise<T>,
): Promise<T> {
  const previous =
    conversation_queues.get(conversation_id) ?? Promise.resolve();
  const current = previous.then(task, task);
  const settled: Promise<void> = current
    .catch((caught) =>
      ignore_error(
        "services/crypto/ratchet_conversation:run_serialized_for_conversation",
        caught,
      ),
    )
    .then(() => {
      if (conversation_queues.get(conversation_id) === settled) {
        conversation_queues.delete(conversation_id);
      }
    });

  conversation_queues.set(conversation_id, settled);

  return current;
}

export async function get_sync_encryption_key(): Promise<RatchetSyncKey | null> {
  const { get_current_account } = await import("@/services/account_manager");
  const user_id = (await get_current_account())?.user?.id;

  if (!user_id) return null;

  const master_key = await load_storage_write_key_bytes();

  if (!master_key) return null;

  try {
    if (get_vault_from_memory()?.data_kek_random !== true) return null;

    return await derive_ratchet_sync_key(master_key, user_id);
  } finally {
    master_key.fill(0);
  }
}

const SYNC_KEY_ATTEMPTS = 6;
const SYNC_KEY_RETRY_MS = 2000;

export async function wait_for_sync_encryption_key(
  attempts: number = SYNC_KEY_ATTEMPTS,
  retry_ms: number = SYNC_KEY_RETRY_MS,
): Promise<RatchetSyncKey | null> {
  for (let attempt = 0; attempt < attempts; attempt++) {
    const sync_key = await get_sync_encryption_key().catch(() => null);

    if (sync_key) return sync_key;

    if (attempt + 1 < attempts) {
      await new Promise((resolve) => setTimeout(resolve, retry_ms));
    }
  }

  return null;
}
