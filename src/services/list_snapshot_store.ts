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
import type { InboxEmail } from "@/types/email";

import {
  format_email_list_timestamp,
  type FormatOptions,
} from "@/utils/date_format";
import { get_current_account_id } from "@/services/account_manager";
import { has_vault_in_memory } from "@/services/crypto/memory_key_store";
import {
  secure_decrypt,
  secure_encrypt,
} from "@/services/crypto/secure_storage";

const DB_NAME = "astermail_offline_cache";
const STORE_NAME = "email_lists";
const KEY_PREFIX = "snapshot";
const SNAPSHOT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const SNAPSHOT_SAVE_DELAY_MS = 1000;
const MAX_SNAPSHOT_ROWS = 100;

export interface ListSnapshot {
  emails: InboxEmail[];
  saved_at: number;
}

interface StoredSnapshot extends ListSnapshot {
  owner: string;
  signature: string;
}

interface PendingSave {
  timer: ReturnType<typeof setTimeout>;
}

const pending_saves = new Map<string, PendingSave>();
const last_saved = new Map<string, { signature: string; rows: InboxEmail[] }>();
const scope_epochs = new Map<string, number>();
let store_epoch = 0;

function epoch_token(scope: string): string {
  return `${store_epoch}:${scope_epochs.get(scope) ?? 0}`;
}

function open_db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function build_record_key(scope: string): Promise<string | null> {
  const account_id = await get_current_account_id();

  return account_id ? `${KEY_PREFIX}:${account_id}:${scope}` : null;
}

let folders_module: Promise<typeof import("@/hooks/use_folders")> | null = null;

async function has_protected_folder_row(
  emails: InboxEmail[],
): Promise<boolean> {
  if (!emails.some((email) => (email.folders?.length ?? 0) > 0)) return false;

  folders_module ??= import("@/hooks/use_folders");

  const { get_cached_folders } = await folders_module;
  const folders = get_cached_folders();

  if (folders.length === 0) return true;

  const protected_tokens = new Set<string>();

  for (const folder of folders) {
    if (folder.is_password_protected) protected_tokens.add(folder.folder_token);
  }

  if (protected_tokens.size === 0) return false;

  return emails.some((email) =>
    email.folders?.some((folder) => protected_tokens.has(folder.folder_token)),
  );
}

async function put_record(
  key: string,
  value: string | null,
  is_current: () => boolean = () => true,
): Promise<void> {
  const db = await open_db();

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);

    if (value === null) store.delete(key);
    else if (is_current()) store.put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  db.close();
}

async function write_snapshot(
  record_key: Promise<string | null>,
  owner: string,
  signature: string,
  rows: InboxEmail[],
  is_current: () => boolean,
): Promise<void> {
  const key = await record_key;

  if (!key) return;

  if (rows.length === 0 || (await has_protected_folder_row(rows))) {
    await put_record(key, null);

    return;
  }

  if (!has_vault_in_memory()) return;

  const stored: StoredSnapshot = {
    owner,
    signature,
    saved_at: Date.now(),
    emails: rows
      .slice(0, MAX_SNAPSHOT_ROWS)
      .map((email) =>
        email.is_selected ? { ...email, is_selected: false } : email,
      ),
  };

  await put_record(
    key,
    await secure_encrypt(JSON.stringify(stored)),
    is_current,
  );
}

export function schedule_list_snapshot(
  scope: string,
  owner: string,
  signature: string,
  rows: InboxEmail[],
): void {
  if (!owner) return;

  const previous = last_saved.get(scope);

  if (previous && previous.signature === signature && previous.rows === rows) {
    return;
  }

  const pending = pending_saves.get(scope);

  if (pending) clearTimeout(pending.timer);

  const record_key = build_record_key(scope).catch(() => null);
  const timer = setTimeout(() => {
    pending_saves.delete(scope);
    last_saved.set(scope, { signature, rows });

    const token = epoch_token(scope);

    write_snapshot(
      record_key,
      owner,
      signature,
      rows,
      () => epoch_token(scope) === token,
    ).catch(() => {
      last_saved.delete(scope);
    });
  }, SNAPSHOT_SAVE_DELAY_MS);

  pending_saves.set(scope, { timer });
}

export async function read_list_snapshot(
  scope: string,
  owner: string,
  signature: string,
  format_options: FormatOptions,
): Promise<ListSnapshot | null> {
  try {
    if (!owner || !has_vault_in_memory()) return null;

    const key = await build_record_key(scope);

    if (!key) return null;

    const db = await open_db();
    const encrypted = await new Promise<string | undefined>(
      (resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readonly");
        const request = tx.objectStore(STORE_NAME).get(key);

        request.onsuccess = () => resolve(request.result as string | undefined);
        request.onerror = () => reject(request.error);
      },
    );

    db.close();

    if (!encrypted) return null;

    const stored = JSON.parse(
      await secure_decrypt(encrypted),
    ) as StoredSnapshot;

    if (stored.owner !== owner || stored.signature !== signature) return null;
    if (!Array.isArray(stored.emails) || stored.emails.length === 0) {
      return null;
    }
    if (
      typeof stored.saved_at !== "number" ||
      Date.now() - stored.saved_at > SNAPSHOT_TTL_MS
    ) {
      return null;
    }
    if (await has_protected_folder_row(stored.emails)) return null;

    return {
      saved_at: stored.saved_at,
      emails: stored.emails.map((email) => {
        if (!email.raw_timestamp) return email;

        const date = new Date(email.raw_timestamp);

        return Number.isNaN(date.getTime())
          ? email
          : {
              ...email,
              timestamp: format_email_list_timestamp(date, format_options),
            };
      }),
    };
  } catch {
    return null;
  }
}

export async function drop_list_snapshot(scope: string): Promise<void> {
  const pending = pending_saves.get(scope);

  if (pending) clearTimeout(pending.timer);
  pending_saves.delete(scope);
  last_saved.delete(scope);
  scope_epochs.set(scope, (scope_epochs.get(scope) ?? 0) + 1);

  try {
    const key = await build_record_key(scope);

    if (key) await put_record(key, null);
  } catch {
    return;
  }
}

export function cancel_pending_list_snapshots(): void {
  for (const pending of pending_saves.values()) clearTimeout(pending.timer);
  pending_saves.clear();
  last_saved.clear();
  store_epoch += 1;
}
