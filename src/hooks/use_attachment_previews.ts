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

import { useState, useEffect, useRef, useCallback, useMemo } from "react";

import { batch_attachment_meta } from "@/services/api/attachments";
import { decrypt_attachment_meta } from "@/services/crypto/attachment_crypto";
import { get_type_label, get_type_color } from "@/lib/attachment_utils";

export interface AttachmentPreviewInfo {
  id: string;
  filename: string;
  content_type: string;
  size_bytes: number;
  type_label: string;
  type_color: string;
}

export interface AttachmentPreviewEntry {
  state: "loading" | "loaded" | "error";
  attachments: AttachmentPreviewInfo[];
}

interface CacheEntry {
  entry: AttachmentPreviewEntry;
  timestamp: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_CACHE_SIZE = 500;

const preview_cache = new Map<string, CacheEntry>();

function evict_stale_entries(): void {
  const now = Date.now();

  if (preview_cache.size <= MAX_CACHE_SIZE) return;

  const entries = Array.from(preview_cache.entries());

  entries.sort((a, b) => a[1].timestamp - b[1].timestamp);

  const to_remove = entries.slice(0, entries.length - MAX_CACHE_SIZE);

  for (const [key] of to_remove) {
    preview_cache.delete(key);
  }

  for (const [key, val] of preview_cache) {
    if (now - val.timestamp > CACHE_TTL_MS) {
      preview_cache.delete(key);
    }
  }
}

function build_initial_state(
  ids: string[],
): Map<string, AttachmentPreviewEntry> {
  const map = new Map<string, AttachmentPreviewEntry>();
  const now = Date.now();

  for (const id of ids) {
    const cached = preview_cache.get(id);

    if (cached && now - cached.timestamp < CACHE_TTL_MS) {
      map.set(id, cached.entry);
    }
  }

  return map;
}

export function use_attachment_previews(
  emails: InboxEmail[],
): Map<string, AttachmentPreviewEntry> {
  const group_map = useMemo(() => {
    const map = new Map<string, string[]>();

    for (const email of emails) {
      const ids =
        email.grouped_email_ids && email.grouped_email_ids.length > 0
          ? email.grouped_email_ids
          : [email.id];

      map.set(email.id, ids);
    }

    return map;
  }, [emails]);

  const all_ids = useMemo(() => {
    const set = new Set<string>();

    for (const ids of group_map.values()) {
      for (const id of ids) {
        set.add(id);
      }
    }

    const arr = Array.from(set);

    arr.sort();

    return arr;
  }, [group_map]);

  const ids_key = useMemo(() => all_ids.join(","), [all_ids]);

  const [raw_previews, set_raw_previews] = useState<
    Map<string, AttachmentPreviewEntry>
  >(() => build_initial_state(all_ids));
  const abort_ref = useRef<AbortController | null>(null);
  const fetching_ref = useRef<Set<string>>(new Set());

  const fetch_previews = useCallback(async (ids_to_fetch: string[]) => {
    if (ids_to_fetch.length === 0) return;

    const controller = new AbortController();

    abort_ref.current = controller;

    try {
      const response = await batch_attachment_meta(ids_to_fetch);

      if (controller.signal.aborted) return;

      if (!response.data) {
        for (const id of ids_to_fetch) {
          fetching_ref.current.delete(id);
        }

        set_raw_previews((prev) => {
          const next = new Map(prev);

          for (const id of ids_to_fetch) {
            const error_entry: AttachmentPreviewEntry = {
              state: "error",
              attachments: [],
            };

            next.set(id, error_entry);
            preview_cache.set(id, {
              entry: error_entry,
              timestamp: Date.now(),
            });
          }

          return next;
        });

        return;
      }

      const results = new Map<string, AttachmentPreviewEntry>();

      const decrypt_promises = ids_to_fetch.map(async (mail_id) => {
        const items = response.data!.items[mail_id] || [];

        if (items.length === 0) {
          results.set(mail_id, { state: "loaded", attachments: [] });

          return;
        }

        const settlement = await Promise.allSettled(
          items.map(async (item) => {
            const meta = await decrypt_attachment_meta(
              item.encrypted_meta,
              item.meta_nonce,
            );

            return {
              id: item.id,
              filename: meta.filename,
              content_type: meta.content_type,
              size_bytes: item.size_bytes,
              type_label: get_type_label(meta.content_type, meta.filename),
              type_color: get_type_color(meta.content_type),
            } as AttachmentPreviewInfo;
          }),
        );

        const attachments: AttachmentPreviewInfo[] = [];

        for (const result of settlement) {
          if (result.status === "fulfilled") {
            attachments.push(result.value);
          }
        }

        results.set(mail_id, {
          state: attachments.length > 0 ? "loaded" : "error",
          attachments,
        });
      });

      await Promise.allSettled(decrypt_promises);

      if (controller.signal.aborted) return;

      const now = Date.now();

      set_raw_previews((prev) => {
        const next = new Map(prev);

        for (const [mail_id, entry] of results) {
          next.set(mail_id, entry);
          preview_cache.set(mail_id, { entry, timestamp: now });
          fetching_ref.current.delete(mail_id);
        }

        return next;
      });

      evict_stale_entries();
    } catch {
      if (controller.signal.aborted) return;

      for (const id of ids_to_fetch) {
        fetching_ref.current.delete(id);
      }

      set_raw_previews((prev) => {
        const next = new Map(prev);

        for (const id of ids_to_fetch) {
          next.set(id, { state: "error", attachments: [] });
        }

        return next;
      });
    }
  }, []);

  useEffect(() => {
    const now = Date.now();
    const email_ids = ids_key ? ids_key.split(",") : [];

    const uncached_ids: string[] = [];
    const cached_updates = new Map<string, AttachmentPreviewEntry>();

    for (const id of email_ids) {
      if (fetching_ref.current.has(id)) continue;

      const cached = preview_cache.get(id);

      if (cached && now - cached.timestamp < CACHE_TTL_MS) {
        cached_updates.set(id, cached.entry);
      } else {
        uncached_ids.push(id);
      }
    }

    if (cached_updates.size > 0) {
      set_raw_previews((prev) => {
        const next = new Map(prev);

        for (const [id, entry] of cached_updates) {
          next.set(id, entry);
        }

        return next;
      });
    }

    if (uncached_ids.length > 0) {
      for (const id of uncached_ids) {
        fetching_ref.current.add(id);
      }

      fetch_previews(uncached_ids);
    }
  }, [ids_key, fetch_previews]);

  useEffect(() => {
    return () => {
      if (abort_ref.current) {
        abort_ref.current.abort();
      }
    };
  }, []);

  const merged = useMemo(() => {
    const result = new Map<string, AttachmentPreviewEntry>();

    for (const [email_id, member_ids] of group_map) {
      if (member_ids.length <= 1) {
        const entry = raw_previews.get(email_id);

        if (entry) result.set(email_id, entry);
        continue;
      }

      const all_attachments: AttachmentPreviewInfo[] = [];
      const seen_ids = new Set<string>();
      let any_loading = false;
      let any_loaded = false;

      for (const mid of member_ids) {
        const entry = raw_previews.get(mid);

        if (!entry) {
          any_loading = true;
          continue;
        }

        if (entry.state === "loading") any_loading = true;
        if (entry.state === "loaded") any_loaded = true;

        for (const att of entry.attachments) {
          if (!seen_ids.has(att.id)) {
            seen_ids.add(att.id);
            all_attachments.push(att);
          }
        }
      }

      const state =
        any_loaded || all_attachments.length > 0
          ? ("loaded" as const)
          : any_loading
            ? ("loading" as const)
            : ("error" as const);

      result.set(email_id, { state, attachments: all_attachments });
    }

    return result;
  }, [raw_previews, group_map]);

  return merged;
}
