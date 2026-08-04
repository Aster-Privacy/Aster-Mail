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
import type { EmailCategory } from "@/types/email";
import type { CategoryPreview } from "@/lib/category_preview_text";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";

import {
  get_entry_preview,
  get_new_heads,
  get_index_generation,
  get_preview_version,
  get_version,
  subscribe,
} from "@/services/category_index";
import {
  are_keys_ready,
  on_keys_ready,
} from "@/services/crypto/memory_key_store";
import { list_mail_items } from "@/services/api/mail";
import { decrypt_envelope } from "@/hooks/email_list_helpers";
import { build_category_preview } from "@/lib/category_preview_text";

export type { CategoryPreview };

export {
  titlecase_localpart,
  preview_sender_label,
} from "@/lib/category_preview_text";

export type CategoryPreviews = Partial<Record<EmailCategory, CategoryPreview>>;

const MAX_PREVIEW_FETCH = 12;
const MAX_CACHE_ENTRIES = 120;
const MAX_ATTEMPTS = 2;

const preview_cache = new Map<string, CategoryPreview>();
const attempts = new Map<string, number>();
const in_flight = new Set<string>();

let cache_generation = -1;

const EMPTY_HEADS: ReadonlyMap<EmailCategory, string> = new Map();

function reset_if_stale(): void {
  const generation = get_index_generation();

  if (generation === cache_generation) return;
  cache_generation = generation;
  preview_cache.clear();
  attempts.clear();
  in_flight.clear();
}

function trim_cache(): void {
  while (preview_cache.size > MAX_CACHE_ENTRIES) {
    const oldest = preview_cache.keys().next().value;

    if (!oldest) return;
    preview_cache.delete(oldest);
  }
}

function note_attempt(id: string): void {
  attempts.set(id, (attempts.get(id) ?? 0) + 1);
}

function is_exhausted(id: string): boolean {
  return (attempts.get(id) ?? 0) >= MAX_ATTEMPTS;
}

function resolve_preview(id: string): CategoryPreview | undefined {
  return get_entry_preview(id) ?? preview_cache.get(id);
}

export function use_category_previews(enabled: boolean): CategoryPreviews {
  const version = useSyncExternalStore(subscribe, get_version, get_version);
  const preview_version = useSyncExternalStore(
    subscribe,
    get_preview_version,
    get_preview_version,
  );
  const [tick, set_tick] = useState(0);
  const [keys_ready, set_keys_ready] = useState(are_keys_ready);

  useEffect(() => {
    if (!enabled || keys_ready) return;

    return on_keys_ready(() => set_keys_ready(true));
  }, [enabled, keys_ready]);

  const heads = useMemo(
    () => (enabled ? get_new_heads() : EMPTY_HEADS),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [enabled, version],
  );

  useEffect(() => {
    if (!enabled) return;
    if (heads.size === 0) return;
    if (!keys_ready) return;

    reset_if_stale();

    const missing: string[] = [];

    for (const id of heads.values()) {
      if (resolve_preview(id) || is_exhausted(id) || in_flight.has(id))
        continue;
      if (!missing.includes(id)) missing.push(id);
      if (missing.length >= MAX_PREVIEW_FETCH) break;
    }

    if (missing.length === 0) return;

    let cancelled = false;

    void (async () => {
      const generation = get_index_generation();

      for (const id of missing) {
        in_flight.add(id);
      }

      try {
        const response = await list_mail_items({ ids: missing });

        if (cancelled || generation !== get_index_generation()) return;

        const items = response.data?.items ?? [];

        for (const item of items) {
          const envelope = await decrypt_envelope(
            item.encrypted_envelope,
            item.envelope_nonce,
          );

          if (cancelled || generation !== get_index_generation()) return;
          if (!envelope) continue;

          preview_cache.set(
            item.id,
            build_category_preview(
              envelope.from?.name,
              envelope.from?.email,
              envelope.subject,
            ),
          );
          attempts.delete(item.id);
        }

        for (const id of missing) {
          if (!preview_cache.has(id)) note_attempt(id);
        }

        trim_cache();
        if (!cancelled) set_tick((value) => value + 1);
      } catch {
        return;
      } finally {
        for (const id of missing) {
          in_flight.delete(id);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, heads, keys_ready]);

  return useMemo(() => {
    const result: CategoryPreviews = {};

    for (const [category, id] of heads) {
      const preview = resolve_preview(id);

      if (preview) result[category] = preview;
    }

    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heads, tick, preview_version]);
}
