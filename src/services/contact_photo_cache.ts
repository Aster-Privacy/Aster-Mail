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
import {
  ensure_contact_email_index,
  get_cached_contact_entry,
  invalidate_contact_email_index,
  on_contact_index_invalidated,
  subscribe_contact_index,
  is_contact_index_fresh,
} from "@/services/contact_email_index";
import {
  get_contact_photo,
  revoke_photo_blob_url,
} from "@/services/api/contact_photos";

export const CONTACT_PHOTO_RETRY_MS = 60 * 1000;
const MAX_CONCURRENT_PHOTO_FETCHES = 3;
const ALLOWED_PHOTO_MIME = /^image\/(png|jpe?g|gif|webp|avif|bmp)$/i;

const photo_cache = new Map<string, string | null>();
const photo_failures = new Map<string, number>();
const photo_pending = new Set<string>();
const photo_outdated = new Set<string>();
const photo_queue: string[] = [];
const photo_listeners = new Set<() => void>();
let active_fetches = 0;
let cache_generation = 0;

function notify_photo_change(): void {
  photo_listeners.forEach((listener) => {
    try {
      listener();
    } catch {
      return;
    }
  });
}

function bytes_to_base64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;

  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }

  return btoa(binary);
}

export function photo_to_data_url(
  data: Uint8Array,
  mime_type: string | undefined,
): string | null {
  const mime = (mime_type || "").trim().toLowerCase();

  if (!ALLOWED_PHOTO_MIME.test(mime) || data.length === 0) return null;

  return `data:${mime};base64,${bytes_to_base64(data)}`;
}

async function fetch_photo(contact_id: string): Promise<void> {
  const started_generation = cache_generation;

  try {
    const response = await get_contact_photo(contact_id);

    if (
      started_generation !== cache_generation ||
      photo_outdated.has(contact_id)
    ) {
      if (response.data?.blob_url) revoke_photo_blob_url(response.data.blob_url);

      return;
    }

    if (response.error) {
      photo_failures.set(contact_id, Date.now());

      return;
    }

    if (!response.data) {
      photo_cache.set(contact_id, null);
      notify_photo_change();

      return;
    }

    if (response.data.blob_url) revoke_photo_blob_url(response.data.blob_url);
    photo_cache.set(
      contact_id,
      photo_to_data_url(response.data.data, response.data.meta?.mime_type),
    );
    photo_failures.delete(contact_id);
    notify_photo_change();
  } catch {
    if (
      started_generation === cache_generation &&
      !photo_outdated.has(contact_id)
    ) {
      photo_failures.set(contact_id, Date.now());
    }
  }
}

function pump_queue(): void {
  while (
    active_fetches < MAX_CONCURRENT_PHOTO_FETCHES &&
    photo_queue.length > 0
  ) {
    const contact_id = photo_queue.shift()!;
    const started_generation = cache_generation;

    active_fetches += 1;
    void fetch_photo(contact_id).finally(() => {
      const outdated =
        started_generation === cache_generation &&
        photo_outdated.delete(contact_id);

      if (started_generation === cache_generation) {
        active_fetches -= 1;
        photo_pending.delete(contact_id);
      }
      pump_queue();
      if (outdated) notify_photo_change();
    });
  }
}

function enqueue_photo_fetch(contact_id: string): void {
  if (photo_cache.has(contact_id) || photo_pending.has(contact_id)) return;
  const failed_at = photo_failures.get(contact_id);

  if (failed_at && Date.now() - failed_at < CONTACT_PHOTO_RETRY_MS) return;

  photo_pending.add(contact_id);
  photo_queue.push(contact_id);
  pump_queue();
}

export function get_contact_photo_src(email: string): string | null | undefined {
  if (!email) return null;
  const entry = get_cached_contact_entry(email);

  if (entry === undefined) return undefined;
  if (entry === null) return null;
  if (entry.inline_photo) return entry.inline_photo;
  if (photo_cache.has(entry.contact_id)) {
    return photo_cache.get(entry.contact_id) ?? null;
  }

  return undefined;
}

export function contact_photo_needs_request(email: string): boolean {
  if (!email) return false;

  return (
    !is_contact_index_fresh() || get_contact_photo_src(email) === undefined
  );
}

export function request_contact_photo(email: string): void {
  if (!email) return;
  const entry = get_cached_contact_entry(email);

  if (entry === undefined || !is_contact_index_fresh()) {
    void ensure_contact_email_index().then(() => {
      const next = get_cached_contact_entry(email);

      if (next && !next.inline_photo) enqueue_photo_fetch(next.contact_id);
    });

    return;
  }

  if (entry && !entry.inline_photo) enqueue_photo_fetch(entry.contact_id);
}

export function subscribe_contact_photos(listener: () => void): () => void {
  photo_listeners.add(listener);
  const unsubscribe_index = subscribe_contact_index(listener);

  return () => {
    photo_listeners.delete(listener);
    unsubscribe_index();
  };
}

function reset_photo_state(): void {
  cache_generation += 1;
  photo_cache.clear();
  photo_failures.clear();
  photo_pending.clear();
  photo_outdated.clear();
  photo_queue.length = 0;
  active_fetches = 0;
}

function forget_contact_photos(contact_ids: ReadonlySet<string>): void {
  for (const contact_id of contact_ids) {
    photo_cache.delete(contact_id);
    photo_failures.delete(contact_id);
    if (photo_pending.has(contact_id) && !photo_queue.includes(contact_id)) {
      photo_outdated.add(contact_id);
    }
  }
}

export function clear_contact_photo_cache(): void {
  reset_photo_state();
  invalidate_contact_email_index();
}

on_contact_index_invalidated((changed_ids) => {
  if (changed_ids) {
    forget_contact_photos(changed_ids);

    return;
  }
  reset_photo_state();
});
