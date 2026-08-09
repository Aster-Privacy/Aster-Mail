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
import { HASH_ALG } from "@/services/crypto/constants";
import { array_to_base64 } from "./base64";
import { get_derived_encryption_key } from "./memory_key_store";
import { derive_ratchet_encryption_key } from "./ratchet_sync";

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

  conversation_queues.set(
    conversation_id,
    current.catch(() => {}),
  );

  return current;
}

export async function get_sync_encryption_key(): Promise<CryptoKey | null> {
  const master_key = get_derived_encryption_key();

  if (!master_key) return null;

  const key = await derive_ratchet_encryption_key(master_key);

  master_key.fill(0);

  return key;
}
