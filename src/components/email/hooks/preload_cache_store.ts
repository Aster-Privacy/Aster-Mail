//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
import type { DecryptedThreadMessage } from "@/types/thread";
import type { DecryptedEmail } from "@/components/email/hooks/email_detail_types";
import type { ExternalContentReport } from "@/lib/html_sanitizer";
import type { MailItem } from "@/services/api/mail";
import type { DraftWithContent } from "@/services/api/multi_drafts";

import { LOCKDOWN_CHANGED_EVENT } from "@/services/lockdown_store";
import { clear_iframe_height_cache } from "@/components/email/sandboxed_email_renderer/helpers";
import { revoke_cid_blob_urls } from "@/lib/cid_resolver";
import { clear_attachment_meta_cache } from "@/services/attachment_meta_cache";
import { clear_attachment_preview_cache } from "@/services/attachment_preview_cache";

// Preloaded-email cache state, kept apart from the preloader so app startup
// (auth, preferences, list hooks) can clear or tune it without loading the
// email renderer, its styles and the decryption pipeline.

export interface PreloadedSanitizedContent {
  html: string;
  body_background?: string;
  is_plain_text: boolean;
  external_content: ExternalContentReport;
}

export interface PreloadedEmail {
  mail_item: MailItem;
  email: DecryptedEmail;
  thread_messages: DecryptedThreadMessage[];
  thread_draft: DraftWithContent | null;
  current_user_email: string;
  current_user_name: string;
  thread_sanitized: Map<string, PreloadedSanitizedContent>;
  cid_resolved?: { html: string; blob_urls: string[] };
  thread_cid_resolved: Map<string, { html: string; blob_urls: string[] }>;
  time: number;
  is_stale: boolean;
  conversation_grouping: boolean;
}

const preload_cache = new Map<string, PreloadedEmail>();
const preload_in_flight = new Map<string, Promise<void>>();
const MAX_PRELOAD_CACHE_SIZE = 30;
let preload_generation = 0;

export function invalidate_in_flight_preloads(): void {
  preload_generation += 1;
}

if (typeof window !== "undefined") {
  window.addEventListener(LOCKDOWN_CHANGED_EVENT, () => clear_preload_cache());
}

export function is_preload_busy(): boolean {
  return preload_in_flight.size > 0;
}

export function get_preload_generation(): number {
  return preload_generation;
}

export function get_preloaded_email(email_id: string): PreloadedEmail | null {
  const in_flight = preload_in_flight.get(email_id);

  if (in_flight) {
    return null;
  }

  return preload_cache.get(email_id) ?? null;
}

export const consume_preloaded_email = get_preloaded_email;

export const PRELOAD_FRESH_MS = 30_000;

export function is_preloaded_email_fresh(
  cached: PreloadedEmail,
  max_age_ms: number = PRELOAD_FRESH_MS,
): boolean {
  return !cached.is_stale && Date.now() - cached.time <= max_age_ms;
}

export async function await_preloaded_email(
  email_id: string,
  conversation_grouping?: boolean,
  options?: { fresh_only?: boolean; max_age_ms?: number },
): Promise<PreloadedEmail | null> {
  const in_flight = preload_in_flight.get(email_id);

  if (in_flight) {
    try {
      await Promise.race([
        in_flight,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("preload timeout")), 10000),
        ),
      ]);
    } catch {
      preload_in_flight.delete(email_id);

      return null;
    }
  }

  const cached = preload_cache.get(email_id) ?? null;

  if (
    cached &&
    conversation_grouping !== undefined &&
    cached.conversation_grouping !== conversation_grouping
  ) {
    return null;
  }

  if (
    cached &&
    options?.fresh_only &&
    !is_preloaded_email_fresh(cached, options.max_age_ms)
  ) {
    return null;
  }

  return cached;
}

export function evict_stale_cache_entries(): void {
  if (preload_cache.size > MAX_PRELOAD_CACHE_SIZE) {
    const entries = Array.from(preload_cache.entries()).sort(
      (a, b) => a[1].time - b[1].time,
    );
    const to_remove = entries.length - MAX_PRELOAD_CACHE_SIZE;

    for (let i = 0; i < to_remove; i++) {
      const evicted = entries[i][1];

      if (evicted.cid_resolved)
        revoke_cid_blob_urls(evicted.cid_resolved.blob_urls);
      for (const r of evicted.thread_cid_resolved.values())
        revoke_cid_blob_urls(r.blob_urls);
      preload_cache.delete(entries[i][0]);
    }
  }
}

export function clear_preload_cache(): void {
  for (const entry of preload_cache.values()) {
    if (entry.cid_resolved) revoke_cid_blob_urls(entry.cid_resolved.blob_urls);
    for (const r of entry.thread_cid_resolved.values())
      revoke_cid_blob_urls(r.blob_urls);
  }
  preload_cache.clear();
  clear_attachment_meta_cache();
  clear_attachment_preview_cache();
}

export function mark_preload_stale(email_id?: string): void {
  invalidate_in_flight_preloads();
  if (email_id) {
    const cached = preload_cache.get(email_id);

    if (cached) {
      preload_cache.set(email_id, { ...cached, is_stale: true });
    }
  } else {
    for (const [key, cached] of preload_cache.entries()) {
      preload_cache.set(key, { ...cached, is_stale: true });
    }
  }
}

export function delete_preloaded_email(email_id: string): void {
  invalidate_in_flight_preloads();
  const entry = preload_cache.get(email_id);

  if (entry?.cid_resolved) revoke_cid_blob_urls(entry.cid_resolved.blob_urls);
  if (entry)
    for (const r of entry.thread_cid_resolved.values())
      revoke_cid_blob_urls(r.blob_urls);
  preload_cache.delete(email_id);
}

export function pop_preloaded_cid(
  email_id: string,
): { html: string; blob_urls: string[] } | null {
  const entry = preload_cache.get(email_id);

  if (!entry?.cid_resolved) return null;
  const result = entry.cid_resolved;

  preload_cache.set(email_id, { ...entry, cid_resolved: undefined });

  return result;
}

export function pop_preloaded_thread_cid(
  message_id: string,
): { html: string; blob_urls: string[] } | null {
  for (const entry of preload_cache.values()) {
    const result = entry.thread_cid_resolved.get(message_id);

    if (result) {
      entry.thread_cid_resolved.delete(message_id);

      return result;
    }
  }

  return null;
}

export function get_preload_cache(): Map<string, PreloadedEmail> {
  return preload_cache;
}

export function get_preload_in_flight(): Map<string, Promise<void>> {
  return preload_in_flight;
}

let _email_zoom = "1.000";

export function set_preload_email_font_px(px: number): void {
  const next_zoom = (px / 14).toFixed(3);

  if (next_zoom !== _email_zoom) {
    _email_zoom = next_zoom;
    clear_iframe_height_cache();
  }
}

let _email_font_stack =
  "'Google Sans Flex',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";

export function set_preload_email_font_stack(stack: string): void {
  if (stack !== _email_font_stack) {
    _email_font_stack = stack;
    clear_iframe_height_cache();
  }
}

export function get_preload_email_zoom(): string {
  return _email_zoom;
}

export function get_preload_email_font_stack(): string {
  return _email_font_stack;
}
