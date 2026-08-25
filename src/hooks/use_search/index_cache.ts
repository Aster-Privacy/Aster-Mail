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
  DEEP_SEGMENT_ITEMS,
  DEEP_SEGMENT_PAUSE_MS,
  INDEX_TTL_MS,
  MAX_INDEX_ITEMS,
  MAX_RAM_INDEX_ITEMS,
} from "./constants";
import { run_index_pipeline } from "./pipeline";
import {
  emit_index_refreshed,
  emit_indexing,
  indexing_progress,
} from "./progress";
import { CachedIndex, DecryptedIndexEntry } from "./types";

import { ignore_error } from "@/lib/ignore_error";
import {
  add_vocabulary_entry,
  reset_vocabulary,
} from "@/services/search/vocabulary";
import {
  clear_search_snapshots,
  has_index_storage_headroom,
  open_snapshot_reader,
  open_snapshot_writer,
  SNAPSHOT_CHUNK_SIZE,
  type PersistedSearchEntry,
  type SnapshotMeta,
} from "@/services/search_index_store";
import {
  is_index_download_paused,
  record_index_download_checkpoint,
  reset_index_download_state,
} from "@/services/search/index_download_control";
export let cached_index: CachedIndex | null = null;
export let index_build_promise: Promise<CachedIndex> | null = null;
export let build_generation = 0;
export let deep_index_active = false;
export function empty_index(
  user_email: string,
  include_body: boolean,
): CachedIndex {
  return {
    items: [],
    decrypted: new Map(),
    built_at: 0,
    include_body,
    user_email,
    disk_chunk_ids: [],
    total_indexed: 0,
    complete: false,
    meta: null,
  };
}

export function front_chunk_count(index: CachedIndex): number {
  return Math.ceil(index.items.length / SNAPSHOT_CHUNK_SIZE);
}

export function disk_ids_after_hot(
  chunk_ids: number[],
  hot_count: number,
): number[] {
  return chunk_ids.slice(Math.ceil(hot_count / SNAPSHOT_CHUNK_SIZE));
}

export function apply_meta(index: CachedIndex, meta: SnapshotMeta): void {
  index.meta = meta;
  index.total_indexed = meta.total;
  index.complete = meta.complete;
  index.disk_chunk_ids = disk_ids_after_hot(meta.chunk_ids, index.items.length);
}

export async function build_index_full(
  user_email: string,
  include_body: boolean,
  prior?: Map<string, DecryptedIndexEntry>,
): Promise<CachedIndex> {
  const my_gen = build_generation;

  if (is_index_download_paused()) {
    if (cached_index && cached_index.user_email === user_email) {
      return cached_index;
    }

    return empty_index(user_email, include_body);
  }

  const index = empty_index(user_email, include_body);

  emit_indexing({ building: true, current: 0, total: 0 });
  reset_vocabulary();

  const writer = await open_snapshot_writer(user_email);

  try {
    const result = await run_index_pipeline({
      user_email,
      include_body,
      prior,
      my_gen,
      max_items: MAX_RAM_INDEX_ITEMS,
      hot: index,
      writer,
      report_progress: true,
      pausable: true,
      checkpoint: true,
    });

    index.built_at = Date.now();
    index.total_indexed = index.items.length;
    index.complete = !result.paused && !result.next_cursor;

    if (writer) {
      const exhausted = writer.storage_exhausted();
      const meta = await writer.finish({
        next_cursor: exhausted ? undefined : result.next_cursor,
        complete: exhausted || result.paused ? false : !result.next_cursor,
        include_body,
      });

      if (meta) apply_meta(index, meta);
    }

    if (my_gen !== build_generation) {
      throw new Error("search_index_cancelled");
    }

    cached_index = index;
    emit_indexing({ building: false });

    if (index.meta && !index.meta.complete && !is_index_download_paused()) {
      schedule_deep_index(user_email, include_body, index.meta);
    }

    return index;
  } catch (error) {
    index.items.length = 0;
    index.decrypted.clear();
    emit_indexing({ building: false });
    throw error;
  }
}

export async function build_index_front_refresh(
  user_email: string,
  include_body: boolean,
  stale: CachedIndex,
): Promise<CachedIndex> {
  const my_gen = build_generation;
  const prior = stale.decrypted;
  const base = stale.meta as SnapshotMeta;
  const reader = await open_snapshot_reader(user_email);
  const keep_ids = base.chunk_ids.slice(front_chunk_count(stale));
  const boundary_chunk = reader ? await reader.read(keep_ids[0]) : null;
  const boundary_id = boundary_chunk?.items[0]?.id;

  if (!boundary_id) {
    return build_index_full(user_email, include_body, prior);
  }

  const index = empty_index(user_email, include_body);

  emit_indexing({ building: true, current: 0, total: 0 });

  try {
    const result = await run_index_pipeline({
      user_email,
      include_body,
      prior,
      my_gen,
      stop_at_id: boundary_id,
      max_items: MAX_RAM_INDEX_ITEMS,
      hot: index,
      writer: null,
      report_progress: true,
      pausable: true,
    });

    if (result.paused) {
      index.items.length = 0;
      index.decrypted.clear();
      emit_indexing({ building: false });

      return stale;
    }

    if (!result.reached_boundary) {
      index.items.length = 0;
      index.decrypted.clear();
      emit_indexing({ building: false });

      return build_index_full(user_email, include_body, prior);
    }

    index.built_at = Date.now();
    index.total_indexed = index.items.length;
    index.complete = base.complete;
    index.disk_chunk_ids = keep_ids;
    index.meta = base;

    const unchanged =
      result.fresh_count === 0 && index.items.length === prior.size;

    if (!unchanged) {
      const writer = await open_snapshot_writer(user_email, base);

      if (writer) {
        await writer.add_page(index.items, index.decrypted);

        if (writer.storage_exhausted()) {
          await writer.discard();
        } else {
          const meta = await writer.finish({
            next_cursor: base.next_cursor,
            complete: base.complete,
            include_body,
            keep_chunk_ids: keep_ids,
            kept_total: Math.max(base.total - stale.items.length, 0),
          });

          if (meta) apply_meta(index, meta);
        }
      }
    }

    if (my_gen !== build_generation) {
      throw new Error("search_index_cancelled");
    }

    cached_index = index;
    emit_indexing({ building: false });

    if (index.meta && !index.meta.complete) {
      schedule_deep_index(user_email, include_body, index.meta);
    }

    return index;
  } catch (error) {
    index.items.length = 0;
    index.decrypted.clear();
    emit_indexing({ building: false });
    throw error;
  }
}

export function schedule_deep_index(
  user_email: string,
  include_body: boolean,
  base: SnapshotMeta,
): void {
  if (deep_index_active) return;
  if (is_index_download_paused()) return;

  deep_index_active = true;
  void run_deep_index(user_email, include_body, base).finally(() => {
    deep_index_active = false;
  });
}

export async function run_deep_index(
  user_email: string,
  include_body: boolean,
  base: SnapshotMeta,
): Promise<void> {
  const my_gen = build_generation;
  let meta = base;
  let emitted = false;

  try {
    while (
      !meta.complete &&
      meta.next_cursor &&
      meta.total < MAX_INDEX_ITEMS &&
      my_gen === build_generation &&
      !is_index_download_paused()
    ) {
      await new Promise<void>((r) => setTimeout(r, DEEP_SEGMENT_PAUSE_MS));

      if (my_gen !== build_generation) return;
      if (is_index_download_paused()) return;
      if (!(await has_index_storage_headroom())) return;

      const writer = await open_snapshot_writer(user_email, meta);

      if (!writer) return;

      emitted = true;
      emit_indexing({
        building: true,
        current: meta.total,
        total: Math.max(indexing_progress.total, meta.total),
      });

      const result = await run_index_pipeline({
        user_email,
        include_body,
        my_gen,
        start_cursor: meta.next_cursor,
        max_items: Math.min(DEEP_SEGMENT_ITEMS, MAX_INDEX_ITEMS - meta.total),
        hot: null,
        writer,
        report_progress: true,
        pausable: true,
        checkpoint: true,
        progress_base: meta.total,
      });

      const exhausted = writer.storage_exhausted();
      const next = await writer.finish({
        next_cursor: exhausted ? undefined : result.next_cursor,
        complete: exhausted || result.paused ? false : !result.next_cursor,
        include_body,
        keep_chunk_ids: meta.chunk_ids,
        kept_total: meta.total,
        keep_first: true,
      });

      if (!next || my_gen !== build_generation) return;

      meta = next;

      if (
        cached_index &&
        cached_index.user_email === user_email &&
        cached_index.include_body === include_body
      ) {
        apply_meta(cached_index, meta);
      }

      emit_index_refreshed();

      if (result.paused) return;
      if (result.processed === 0) return;
    }

    if (meta.complete) {
      record_index_download_checkpoint(meta.total, meta.total);
    }
  } catch {
    return;
  } finally {
    if (emitted) {
      emit_indexing({ building: false });
    }
  }
}

export function reset_index_cache(): void {
  cached_index = null;
  build_generation++;
  index_build_promise = null;
  reset_vocabulary();
}

export function clear_search_index(): void {
  cached_index = null;
  build_generation++;
  index_build_promise = null;
  reset_vocabulary();
  reset_index_download_state();
  emit_indexing({ building: false, current: 0, total: 0 });
  void clear_search_snapshots();
}

export function mark_search_index_stale(): void {
  if (cached_index) {
    cached_index.built_at = 0;
  }
}

export async function prewarm_search_index(
  user_email: string,
  include_body: boolean,
): Promise<void> {
  try {
    await build_search_index(user_email, include_body);
  } catch {
    return;
  }
}

export function start_background_rebuild(
  user_email: string,
  include_body: boolean,
  stale?: CachedIndex | null,
): Promise<CachedIndex> {
  if (index_build_promise) {
    return index_build_promise;
  }

  const can_refresh_front =
    !!stale &&
    stale.items.length > 0 &&
    !!stale.meta &&
    stale.meta.chunk_ids.length > front_chunk_count(stale) &&
    (stale.meta.include_body || !include_body);

  const promise = (
    can_refresh_front && stale
      ? build_index_front_refresh(user_email, include_body, stale)
      : build_index_full(user_email, include_body, stale?.decrypted)
  )
    .then((index) => {
      emit_index_refreshed();

      return index;
    })
    .finally(() => {
      if (index_build_promise === promise) {
        index_build_promise = null;
      }
    });

  index_build_promise = promise;
  promise.catch((caught) =>
    ignore_error(
      "hooks/use_search/index_cache:start_background_rebuild",
      caught,
    ),
  );

  return promise;
}

export async function build_search_index(
  user_email: string,
  include_body: boolean,
  ttl_ms: number = INDEX_TTL_MS,
): Promise<CachedIndex> {
  if (cached_index && cached_index.user_email !== user_email) {
    cached_index = null;
    build_generation++;
    index_build_promise = null;
  }

  const body_compatible = (index: CachedIndex | null): index is CachedIndex =>
    !!index &&
    index.user_email === user_email &&
    (index.include_body || !include_body);

  if (
    body_compatible(cached_index) &&
    Date.now() - cached_index.built_at < ttl_ms
  ) {
    return cached_index;
  }

  if (body_compatible(cached_index)) {
    const stale = cached_index;

    void start_background_rebuild(user_email, include_body, stale);

    return stale;
  }

  if (index_build_promise) {
    return index_build_promise;
  }

  const reader = await open_snapshot_reader(user_email);

  if (index_build_promise) {
    return index_build_promise;
  }
  if (body_compatible(cached_index)) {
    return cached_index;
  }

  if (!reader || reader.meta.chunk_ids.length === 0) {
    return start_background_rebuild(user_email, include_body);
  }

  const meta = reader.meta;

  if (include_body && !meta.include_body) {
    return start_background_rebuild(user_email, include_body);
  }

  const index = empty_index(user_email, meta.include_body);
  let consumed = 0;

  reset_vocabulary();

  for (const chunk_id of meta.chunk_ids) {
    if (index.items.length >= MAX_RAM_INDEX_ITEMS) break;

    const chunk = await reader.read(chunk_id);

    consumed++;

    if (!chunk) continue;

    const entries = new Map<string, PersistedSearchEntry>();

    for (const entry of chunk.entries) {
      entries.set(entry.id, entry);
    }

    for (const item of chunk.items) {
      const entry = entries.get(item.id);

      if (!entry) continue;

      index.items.push(item);
      index.decrypted.set(item.id, {
        envelope: entry.envelope,
        metadata: entry.metadata,
        search_body_text: entry.search_body_text,
        meta_fp: entry.meta_fp,
        has_body: entry.has_body,
      });
      add_vocabulary_entry(entry.envelope, entry.search_body_text);
    }
  }

  if (index_build_promise) {
    return index_build_promise;
  }
  if (body_compatible(cached_index)) {
    return cached_index;
  }

  if (index.items.length === 0) {
    return start_background_rebuild(user_email, include_body);
  }

  index.meta = meta;
  index.built_at = meta.saved_at;
  index.total_indexed = meta.total;
  index.complete = meta.complete;
  index.disk_chunk_ids = meta.chunk_ids.slice(consumed);
  cached_index = index;

  if (!meta.complete || Date.now() - meta.saved_at >= ttl_ms) {
    void start_background_rebuild(user_email, include_body, index);
  }

  return index;
}
