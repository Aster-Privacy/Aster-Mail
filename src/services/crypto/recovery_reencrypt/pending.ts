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
import type { EncryptedVault } from "../key_manager";

import { device_store, device_retrieve } from "../secure_storage";
import { vault_identity_key_materials } from "../identity_key_materials";

import type {} from "@/services/api/signatures";
import type {} from "@/services/api/templates";
import type {} from "@/services/api/blocked_senders";
import type {} from "@/services/api/allowed_senders";
import { api_client } from "@/services/api/client";
import { HASH_ALG } from "@/services/crypto/constants";
import { ignore_error } from "@/lib/ignore_error";

export const PENDING_KEY = "aster_pending_reencryption";

const SCOPED_KEY_PREFIX = `${PENDING_KEY}:`;
const SCOPE_CONTEXT = "aster-pending-reencryption-scope-v1:";

export interface PendingReencryptData {
  old_data_kek?: string;
  old_identity_key: string;
  done_identity_steps?: string[];
  identity_attempts?: number;
  owner_user_id?: string;
}

export interface PendingReencryptEntry {
  storage_key: string;
  data: PendingReencryptData;
}

type PendingOwnerVault = Pick<
  EncryptedVault,
  "identity_key" | "previous_keys" | "legacy_identity_keys" | "legacy_keks"
>;

export async function pending_storage_key(
  old_identity_key: string,
): Promise<string> {
  const digest = new Uint8Array(
    await crypto.subtle.digest(
      HASH_ALG,
      new TextEncoder().encode(SCOPE_CONTEXT + old_identity_key),
    ),
  );
  const scope = Array.from(digest, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");

  return SCOPED_KEY_PREFIX + scope;
}

function is_pending_record(value: unknown): value is PendingReencryptData {
  if (!value || typeof value !== "object") return false;

  const old_identity_key = (value as PendingReencryptData).old_identity_key;

  return typeof old_identity_key === "string" && old_identity_key.length > 0;
}

function belongs_to_vault(
  data: PendingReencryptData,
  vault: PendingOwnerVault,
): boolean {
  if (data.owner_user_id) {
    return data.owner_user_id === api_client.get_expected_user_id();
  }

  if (vault_identity_key_materials(vault).includes(data.old_identity_key)) {
    return true;
  }

  const old_data_kek = data.old_data_kek;

  if (!old_data_kek) return false;

  return (vault.legacy_keks ?? []).some((entry) => entry.k === old_data_kek);
}

function scoped_storage_keys(): string[] {
  const keys: string[] = [];

  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);

      if (key && key.startsWith(SCOPED_KEY_PREFIX)) keys.push(key);
    }
  } catch (caught) {
    ignore_error(
      "services/crypto/recovery_reencrypt/pending:scoped_storage_keys",
      caught,
    );
  }

  return keys.sort();
}

async function read_record(
  storage_key: string,
): Promise<PendingReencryptData | null> {
  try {
    const data = await device_retrieve<PendingReencryptData>(storage_key);

    return is_pending_record(data) ? data : null;
  } catch {
    return null;
  }
}

export async function store_pending_reencryption(
  data: PendingReencryptData,
): Promise<void> {
  try {
    await device_store(await pending_storage_key(data.old_identity_key), data);
  } catch (caught) {
    ignore_error(
      "services/crypto/recovery_reencrypt/pending:store_pending_reencryption",
      caught,
    );
  }
}

export function clear_pending_entry(storage_key: string): void {
  try {
    localStorage.removeItem(storage_key);
  } catch (caught) {
    ignore_error(
      "services/crypto/recovery_reencrypt/pending:clear_pending_entry",
      caught,
    );
  }
}

export async function clear_pending_reencryption(
  old_identity_key: string,
): Promise<void> {
  try {
    clear_pending_entry(await pending_storage_key(old_identity_key));
  } catch (caught) {
    ignore_error(
      "services/crypto/recovery_reencrypt/pending:clear_pending_reencryption",
      caught,
    );
  }
}

export async function read_pending_entry(
  storage_key: string,
  vault: PendingOwnerVault,
): Promise<PendingReencryptData | null> {
  const data = await read_record(storage_key);

  if (!data || !belongs_to_vault(data, vault)) return null;

  return data;
}

async function claim_unscoped_record(
  vault: PendingOwnerVault,
): Promise<PendingReencryptEntry | null> {
  const data = await read_record(PENDING_KEY);

  if (!data || !belongs_to_vault(data, vault)) return null;

  const storage_key = await pending_storage_key(data.old_identity_key);

  await device_store(storage_key, data);
  clear_pending_entry(PENDING_KEY);

  return { storage_key, data };
}

export async function find_pending_entries(
  vault: PendingOwnerVault,
): Promise<PendingReencryptEntry[]> {
  const entries: PendingReencryptEntry[] = [];

  for (const storage_key of scoped_storage_keys()) {
    const data = await read_pending_entry(storage_key, vault);

    if (data) entries.push({ storage_key, data });
  }

  try {
    const claimed = await claim_unscoped_record(vault);

    if (
      claimed &&
      !entries.some((entry) => entry.storage_key === claimed.storage_key)
    ) {
      entries.push(claimed);
    }
  } catch (caught) {
    ignore_error(
      "services/crypto/recovery_reencrypt/pending:claim_unscoped_record",
      caught,
    );
  }

  return entries;
}
