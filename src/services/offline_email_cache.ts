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
  device_encrypt,
  device_decrypt,
} from "@/services/crypto/secure_storage";

const DB_NAME = "astermail_offline_cache";
const STORE_NAME = "email_lists";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_EMAILS_PER_VIEW = 200;

interface CacheEntry {
  emails: InboxEmail[];
  cached_at: number;
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

export async function cache_email_list(
  view: string,
  emails: InboxEmail[],
): Promise<void> {
  try {
    const trimmed = emails.slice(0, MAX_EMAILS_PER_VIEW);
    const entry: CacheEntry = {
      emails: trimmed,
      cached_at: Date.now(),
    };
    const serialized = JSON.stringify(entry);
    const encrypted = await device_encrypt(serialized);
    const db = await open_db();

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);

      store.put(encrypted, view);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    db.close();
  } catch {
    return;
  }
}

export async function get_cached_email_list(
  view: string,
): Promise<InboxEmail[] | null> {
  try {
    const db = await open_db();

    const encrypted = await new Promise<string | undefined>(
      (resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readonly");
        const store = tx.objectStore(STORE_NAME);
        const request = store.get(view);

        request.onsuccess = () => resolve(request.result as string | undefined);
        request.onerror = () => reject(request.error);
      },
    );

    db.close();

    if (!encrypted) return null;

    const decrypted = await device_decrypt(encrypted);
    const entry: CacheEntry = JSON.parse(decrypted);

    if (Date.now() - entry.cached_at > CACHE_TTL_MS) return null;

    return entry.emails;
  } catch {
    return null;
  }
}

export async function clear_email_cache(): Promise<void> {
  try {
    const db = await open_db();

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);

      store.clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    db.close();
  } catch {
    return;
  }
}

export async function clear_view_cache(view: string): Promise<void> {
  try {
    const db = await open_db();

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);

      store.delete(view);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    db.close();
  } catch {
    return;
  }
}
