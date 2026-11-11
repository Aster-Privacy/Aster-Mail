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
  INDEX_PAGE_LIMIT,
  RECONCILE_INTERVAL_MS,
  RECONCILE_RETRY_MS,
  PURGE_FLUSH_MS,
} from "./constants";
import { build_search_haystack } from "./matching";
import { run_index_pipeline } from "./pipeline";
import {
  begin_indexing_run,
  emit_index_refreshed,
  end_indexing_run,
  report_indexing_counts,
  reset_indexing_progress,
} from "./progress";
import { CachedIndex, ChunkSpan } from "./types";

import { list_encrypted_mail_items, type MailItem } from "@/services/api/mail";

import { ignore_error } from "@/lib/ignore_error";
import { drop_sender_verification } from "@/services/crypto/sender_verification";
import {
  queue_vocabulary_entry,
  reset_vocabulary,
} from "@/services/search/vocabulary";
import {
  clear_search_snapshots,
  close_arrival_watch,
  forget_purged_ids,
  has_index_storage_headroom,
  note_purged_ids,
  note_purged_scope,
  open_arrival_watch,
  purge_snapshot_entries,
  stamp_snapshot_verified,
  open_snapshot_reader,
  open_snapshot_writer,
  same_snapshot,
  SNAPSHOT_CHUNK_SIZE,
  type PersistableEntry,
  type PersistedSearchEntry,
  type ReusableChunk,
  type SearchSnapshotClearScope,
  type SnapshotMeta,
  type SnapshotWriter,
  type WrittenChunk,
} from "@/services/search_index_store";
import {
  is_index_download_paused,
  reset_index_download_state,
} from "@/services/search/index_download_control";
import { clear_folded_patterns } from "@/utils/search_fold";
import {
  fetch_mailbox_index_total,
  settle_within,
} from "@/services/search/index_total";
const PARTIAL_PUBLISH_MS = 750;
const SNAPSHOT_RESTAMP_MS = INDEX_TTL_MS / 2;
const TOTAL_WAIT_MS = 1500;

let partial_ready_resolve: (() => void) | null = null;
let partial_ready_promise: Promise<void> | null = null;

let announced_index: CachedIndex | null = null;

function partial_ready(): Promise<void> {
  if (!partial_ready_promise) {
    partial_ready_promise = new Promise<void>((resolve) => {
      partial_ready_resolve = resolve;
    });
  }

  return partial_ready_promise;
}

function signal_partial_ready(): void {
  const resolve = partial_ready_resolve;

  partial_ready_resolve = null;
  partial_ready_promise = null;
  resolve?.();
}

export let cached_index: CachedIndex | null = null;
export let index_build_promise: Promise<CachedIndex> | null = null;
export let build_generation = 0;
export let deep_index_active = false;
const building_indexes = new Set<CachedIndex>();
const counted_hot_drops = new WeakMap<CachedIndex, Set<string>>();
let account_generation = 0;
let deep_index_generation = -1;

export function is_deep_index_running(): boolean {
  return deep_index_active && deep_index_generation === build_generation;
}

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
  counted_hot_drops.delete(index);
}

function spans_from_layout(layout: WrittenChunk[]): ChunkSpan[] {
  const spans: ChunkSpan[] = [];
  let start = 0;

  for (const chunk of layout) {
    spans.push({ id: chunk.id, start, count: chunk.count });
    start += chunk.count;
  }

  return spans;
}

export function stored_hot_chunks(
  index: CachedIndex | null,
): ReusableChunk[] | undefined {
  const chunk_ids = index?.meta?.chunk_ids;

  if (!index || !chunk_ids || !index.chunk_layout?.length) return undefined;

  const chunks: ReusableChunk[] = [];
  let start = 0;

  for (const span of index.chunk_layout) {
    if (span.id !== chunk_ids[chunks.length] || span.start !== start) break;

    const items = index.items.slice(span.start, span.start + span.count);
    const entries: PersistableEntry[] = [];

    for (const item of items) {
      const entry = index.decrypted.get(item.id);

      if (!entry) break;
      entries.push(entry);
    }

    if (items.length !== span.count || entries.length !== span.count) break;

    chunks.push({ id: span.id, items, entries });
    start += span.count;
  }

  return chunks.length > 0 ? chunks : undefined;
}

export async function build_index_full(
  user_email: string,
  include_body: boolean,
  stale?: CachedIndex | null,
): Promise<CachedIndex> {
  const my_gen = build_generation;

  if (is_index_download_paused()) {
    if (cached_index && cached_index.user_email === user_email) {
      return cached_index;
    }

    return empty_index(user_email, include_body);
  }

  const index = empty_index(user_email, include_body);

  building_indexes.add(index);

  const prior_index = stale ?? null;
  const prior = prior_index?.decrypted;
  const reusable =
    index_is_body_compatible(prior_index, user_email, include_body) &&
    prior_index.decrypted.size > 0;
  const counted = !(reusable && prior_index?.complete);
  const floor =
    counted && reusable
      ? Math.min(prior_index?.total_indexed ?? 0, MAX_RAM_INDEX_ITEMS)
      : 0;
  const run_id = counted ? begin_indexing_run() : undefined;
  const total_request = counted
    ? fetch_mailbox_index_total(MAX_INDEX_ITEMS)
    : Promise.resolve(0);

  if (run_id !== undefined) {
    void total_request.then((total) => {
      report_indexing_counts(run_id, floor, total);
    });
  }
  reset_vocabulary();

  let last_publish_ms = 0;

  const publish_partial = () => {
    if (my_gen !== build_generation) return;
    if (index.items.length === 0) return;

    const now = Date.now();

    if (now - last_publish_ms < PARTIAL_PUBLISH_MS) return;

    last_publish_ms = now;
    if (
      cached_index &&
      cached_index !== index &&
      serves_better_than_partial(cached_index, index)
    ) {
      return;
    }

    index.total_indexed = reusable
      ? Math.max(index.items.length, prior_index?.total_indexed ?? 0)
      : index.items.length;
    cached_index = index;
    signal_partial_ready();
    emit_index_refreshed();
  };

  const stored_chunks = reusable ? stored_hot_chunks(prior_index) : undefined;
  const is_current = () => my_gen === build_generation;
  let unfinished_writer: SnapshotWriter | null = null;

  try {
    const [writer] = await Promise.all([
      open_snapshot_writer(
        user_email,
        stored_chunks ? prior_index?.meta : undefined,
        stored_chunks,
        is_current,
      ),
      settle_within(total_request, TOTAL_WAIT_MS),
    ]);

    unfinished_writer = writer;

    if (my_gen !== build_generation) {
      throw new Error("search_index_cancelled");
    }

    const result = await run_index_pipeline({
      user_email,
      include_body,
      prior,
      my_gen,
      max_items: MAX_RAM_INDEX_ITEMS,
      hot: index,
      writer,
      progress_run: run_id,
      pausable: true,
      on_page: publish_partial,
    });

    index.built_at = Date.now();
    index.total_indexed = index.items.length;
    index.complete = !result.paused && !result.next_cursor;

    if (writer) {
      if (my_gen !== build_generation) {
        throw new Error("search_index_cancelled");
      }

      const exhausted = writer.storage_exhausted();

      unfinished_writer = null;

      const meta = await writer.finish({
        next_cursor: exhausted ? undefined : result.next_cursor,
        complete: exhausted || result.paused ? false : !result.next_cursor,
        include_body,
        restamp_after_ms: SNAPSHOT_RESTAMP_MS,
        is_current,
      });

      if (meta) {
        apply_meta(index, meta);
        index.chunk_layout = spans_from_layout(writer.layout());
      }
    }

    if (my_gen !== build_generation) {
      throw new Error("search_index_cancelled");
    }

    cached_index = index;

    if (index.meta && !index.meta.complete && !is_index_download_paused()) {
      schedule_deep_index(user_email, include_body, index.meta);
    }

    if (run_id !== undefined) {
      announced_index = index;
      emit_index_refreshed();
      end_indexing_run(
        run_id,
        index.complete ? index.total_indexed : undefined,
      );
    }

    return index;
  } catch (error) {
    if (cached_index === index) cached_index = null;
    index.items.length = 0;
    index.decrypted.clear();
    if (run_id !== undefined) end_indexing_run(run_id);
    await unfinished_writer
      ?.discard()
      .catch((caught) =>
        ignore_error("hooks/use_search/index_cache:build_index_full", caught),
      );
    throw error;
  } finally {
    building_indexes.delete(index);
  }
}

export function serves_better_than_partial(
  current: CachedIndex,
  partial: CachedIndex,
): boolean {
  if (current.user_email !== partial.user_email) return false;
  if (current.complete) return true;

  return (
    (current.include_body || !partial.include_body) &&
    current.items.length >= partial.items.length
  );
}

export async function build_index_front_refresh(
  user_email: string,
  include_body: boolean,
  stale: CachedIndex,
  adopted_from_disk = false,
): Promise<CachedIndex> {
  if (is_index_download_paused()) return stale;

  const my_gen = build_generation;
  const prior = stale.decrypted;
  const base = stale.meta as SnapshotMeta;
  const index = empty_index(user_email, include_body);

  building_indexes.add(index);

  try {
    const reader = await open_snapshot_reader(user_email);
    const keep_ids = base.chunk_ids.slice(front_chunk_count(stale));
    const boundary_chunk = reader ? await reader.read(keep_ids[0]) : null;
    const boundary_id = boundary_chunk?.items[0]?.id;

    if (my_gen !== build_generation) {
      throw new Error("search_index_cancelled");
    }

    if (reader && !same_snapshot(reader.meta, base) && !adopted_from_disk) {
      const on_disk = await hydrate_snapshot_index(user_email);

      if (my_gen !== build_generation) {
        throw new Error("search_index_cancelled");
      }

      if (on_disk && can_refresh_front(on_disk, include_body)) {
        return build_index_front_refresh(
          user_email,
          include_body,
          on_disk,
          true,
        );
      }

      return build_index_full(user_email, include_body, on_disk ?? stale);
    }

    if (!boundary_id || !reader || !same_snapshot(reader.meta, base)) {
      return build_index_full(user_email, include_body, stale);
    }

    const result = await run_index_pipeline({
      user_email,
      include_body,
      prior,
      my_gen,
      stop_at_id: boundary_id,
      max_items: MAX_RAM_INDEX_ITEMS + 1,
      hot: index,
      writer: null,
      pausable: true,
    });

    if (result.paused) {
      index.items.length = 0;
      index.decrypted.clear();

      return stale;
    }

    if (!result.reached_boundary || result.processed > MAX_RAM_INDEX_ITEMS) {
      index.items.length = 0;
      index.decrypted.clear();

      return build_index_full(user_email, include_body, stale);
    }

    index.built_at = Date.now();
    index.total_indexed = Math.max(index.items.length, base.total);
    index.complete = base.complete;
    index.disk_chunk_ids = keep_ids;
    index.meta = base;

    const stored_chunks = stored_hot_chunks(stale);
    const unchanged =
      !stored_chunks &&
      result.fresh_count === 0 &&
      index.items.length === prior.size;
    const writer = unchanged
      ? null
      : await open_snapshot_writer(
          user_email,
          base,
          stored_chunks,
          () => my_gen === build_generation,
        );

    if (writer) {
      await writer.add_page(index.items, index.decrypted);

      if (writer.storage_exhausted() || my_gen !== build_generation) {
        await writer.discard();
      } else {
        const meta = await writer.finish({
          next_cursor: base.next_cursor,
          complete: base.complete,
          include_body,
          keep_chunk_ids: keep_ids,
          kept_total: Math.max(base.total - stale.items.length, 0),
          restamp_after_ms: SNAPSHOT_RESTAMP_MS,
          is_current: () => my_gen === build_generation,
        });

        if (meta) {
          apply_meta(index, meta);
          index.chunk_layout = spans_from_layout(writer.layout());
        } else if (writer.lost_kept_chunks()) {
          index.items.length = 0;
          index.decrypted.clear();

          return build_index_full(user_email, include_body, stale);
        }
      }
    }

    if (my_gen !== build_generation) {
      throw new Error("search_index_cancelled");
    }

    cached_index = index;

    if (index.meta && !index.meta.complete) {
      schedule_deep_index(user_email, include_body, index.meta);
    }

    return index;
  } catch (error) {
    index.items.length = 0;
    index.decrypted.clear();
    throw error;
  } finally {
    building_indexes.delete(index);
  }
}

export function schedule_deep_index(
  user_email: string,
  include_body: boolean,
  base: SnapshotMeta,
): void {
  if (is_deep_index_running()) return;
  if (is_index_download_paused()) return;
  if (base.complete || !base.next_cursor) return;
  if (base.total >= MAX_INDEX_ITEMS) return;

  const my_gen = build_generation;
  const run_id = begin_indexing_run();

  deep_index_active = true;
  deep_index_generation = my_gen;
  void run_deep_index(user_email, include_body, base, run_id).finally(() => {
    if (deep_index_generation === my_gen) {
      deep_index_active = false;
    }
  });
}

export async function run_deep_index(
  user_email: string,
  include_body: boolean,
  base: SnapshotMeta,
  run_id: number,
): Promise<void> {
  const my_gen = build_generation;
  let meta = base;
  let unfinished_writer: SnapshotWriter | null = null;

  try {
    while (
      !meta.complete &&
      meta.next_cursor &&
      meta.total < MAX_INDEX_ITEMS &&
      my_gen === build_generation &&
      !is_index_download_paused()
    ) {
      const segment_base = meta.total;
      const total_request = fetch_mailbox_index_total(MAX_INDEX_ITEMS);

      void total_request.then((total) => {
        report_indexing_counts(run_id, segment_base, total);
      });

      await Promise.all([
        new Promise<void>((r) => setTimeout(r, DEEP_SEGMENT_PAUSE_MS)),
        settle_within(total_request, DEEP_SEGMENT_PAUSE_MS),
      ]);

      if (my_gen !== build_generation) return;
      if (is_index_download_paused()) return;
      if (!(await has_index_storage_headroom())) return;

      const writer = await open_snapshot_writer(
        user_email,
        meta,
        undefined,
        () => my_gen === build_generation,
      );

      if (!writer) return;

      unfinished_writer = writer;

      const result = await run_index_pipeline({
        user_email,
        include_body,
        my_gen,
        start_cursor: meta.next_cursor,
        max_items: Math.min(DEEP_SEGMENT_ITEMS, MAX_INDEX_ITEMS - meta.total),
        hot: null,
        writer,
        progress_run: run_id,
        pausable: true,
        progress_base: meta.total,
      });

      const exhausted = writer.storage_exhausted();

      unfinished_writer = null;

      const next = await writer.finish({
        next_cursor: exhausted ? undefined : result.next_cursor,
        complete: exhausted || result.paused ? false : !result.next_cursor,
        include_body,
        keep_chunk_ids: meta.chunk_ids,
        kept_total: meta.total,
        keep_first: true,
        is_current: () => my_gen === build_generation,
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
  } catch (caught) {
    ignore_error("hooks/use_search/index_cache:run_deep_index", caught);
    await unfinished_writer
      ?.discard()
      .catch((discard_error) =>
        ignore_error(
          "hooks/use_search/index_cache:run_deep_index",
          discard_error,
        ),
      );
  } finally {
    end_indexing_run(
      run_id,
      meta.complete && my_gen === build_generation ? meta.total : undefined,
    );
  }
}

export function reset_index_cache(): void {
  cached_index = null;
  build_generation++;
  index_build_promise = null;
  reset_vocabulary();
  clear_folded_patterns();
}

export function clear_search_index(
  snapshots: SearchSnapshotClearScope = "all",
  options: { account_changed?: boolean } = {},
): Promise<void> {
  if (options.account_changed) {
    account_generation++;
    forget_purged_ids();
  }
  cached_index = null;
  build_generation++;
  index_build_promise = null;
  reset_vocabulary();
  clear_folded_patterns();
  reset_index_download_state();
  reset_indexing_progress();
  reset_index_purge_state();

  return clear_search_snapshots(snapshots);
}

export type PurgedMailScope = "trash" | "spam";

export interface SearchIndexPurge {
  ids?: string[];
  scope?: PurgedMailScope;
}

const pending_purge_ids = new Set<string>();
const pending_purge_scopes = new Set<PurgedMailScope>();
let purge_timer: ReturnType<typeof setTimeout> | null = null;
let purge_flush: Promise<void> = Promise.resolve();
let reconcile_promise: Promise<number> | null = null;
let reconcile_attempted_at = 0;

function in_purged_scope(
  item: MailItem,
  scopes: Set<PurgedMailScope>,
): boolean {
  return (
    (scopes.has("trash") && !!item.is_trashed) ||
    (scopes.has("spam") && !!item.is_spam)
  );
}

function drop_index_entries(
  index: CachedIndex,
  should_drop: (item: MailItem) => boolean,
  already_counted?: Set<string>,
): string[] {
  if (index.items.length === 0) return [];

  const dropped: string[] = [];
  const kept: MailItem[] = [];

  for (const item of index.items) {
    if (should_drop(item)) {
      dropped.push(item.id);
    } else {
      kept.push(item);
    }
  }

  if (dropped.length === 0) return dropped;

  index.items.length = 0;
  for (const item of kept) index.items.push(item);
  for (const id of dropped) index.decrypted.delete(id);

  const uncounted = already_counted
    ? dropped.filter((id) => !already_counted.has(id)).length
    : dropped.length;

  index.chunk_layout = undefined;
  index.total_indexed = Math.max(
    index.items.length,
    index.total_indexed - uncounted,
  );

  return dropped;
}

function drop_hot_entries(
  should_drop: (item: MailItem) => boolean,
  already_counted?: Set<string>,
): string[] {
  const index = cached_index;

  return index ? drop_index_entries(index, should_drop, already_counted) : [];
}

function drop_building_entries(should_drop: (item: MailItem) => boolean): void {
  for (const index of building_indexes) {
    if (index === cached_index) continue;

    note_purged_ids(drop_index_entries(index, should_drop));
  }
}

function remember_hot_drops(ids: string[]): void {
  const index = cached_index;

  if (!index || ids.length === 0) return;

  let counted = counted_hot_drops.get(index);

  if (!counted) {
    counted = new Set<string>();
    counted_hot_drops.set(index, counted);
  }

  for (const id of ids) counted.add(id);
}

function settle_disk_purge(removed: string[], hot_removed: string[]): void {
  const index = cached_index;

  if (!index?.meta || removed.length === 0) return;

  const earlier = counted_hot_drops.get(index);
  const counted = new Set(hot_removed);
  let uncounted = 0;

  for (const id of removed) {
    if (!counted.has(id) && !earlier?.has(id)) uncounted += 1;
    earlier?.delete(id);
  }

  index.meta.total = Math.max(0, index.meta.total - removed.length);
  index.total_indexed = Math.max(
    index.items.length,
    index.total_indexed - uncounted,
  );
}

async function flush_pending_purge(): Promise<void> {
  const ids = new Set(pending_purge_ids);
  const scopes = new Set(pending_purge_scopes);

  pending_purge_ids.clear();
  pending_purge_scopes.clear();

  if (ids.size === 0 && scopes.size === 0) return;

  const should_drop = (item: MailItem): boolean =>
    ids.has(item.id) || in_purged_scope(item, scopes);
  const hot_removed = drop_hot_entries(should_drop);
  const removed = await purge_snapshot_entries(
    should_drop,
    scopes.size === 0 ? { expected: ids.size, ids } : {},
  );

  note_purged_ids(removed);
  settle_disk_purge(removed, hot_removed);

  const late = drop_hot_entries(should_drop, new Set(removed));

  if (removed.length > 0 || hot_removed.length > 0 || late.length > 0) {
    emit_index_refreshed();
  }
}

export function purge_search_index(purge: SearchIndexPurge): Promise<void> {
  const ids = (purge.ids ?? []).filter((id) => !!id);

  if (ids.length === 0 && !purge.scope) return purge_flush;

  for (const id of ids) pending_purge_ids.add(id);
  if (purge.scope) pending_purge_scopes.add(purge.scope);

  note_purged_ids(ids);
  if (purge.scope) note_purged_scope(purge.scope);

  const scopes = new Set<PurgedMailScope>(purge.scope ? [purge.scope] : []);
  const wanted = new Set(ids);
  const should_drop = (item: MailItem): boolean =>
    wanted.has(item.id) || in_purged_scope(item, scopes);
  const dropped = drop_hot_entries(should_drop);

  remember_hot_drops(dropped);
  note_purged_ids(dropped);
  drop_building_entries(should_drop);
  if (dropped.length > 0) emit_index_refreshed();
  if (purge.scope) reconcile_attempted_at = 0;

  if (purge_timer) return purge_flush;

  purge_flush = new Promise<void>((resolve) => {
    purge_timer = setTimeout(() => {
      purge_timer = null;
      void flush_pending_purge()
        .catch((caught) =>
          ignore_error("hooks/use_search/index_cache:purge", caught),
        )
        .finally(resolve);
    }, PURGE_FLUSH_MS);
  });

  return purge_flush;
}

async function list_live_mail_ids(my_gen: number): Promise<Set<string> | null> {
  const live = new Set<string>();
  let cursor: string | undefined;

  do {
    if (is_index_download_paused()) return null;

    const response = await list_encrypted_mail_items({
      cursor,
      limit: INDEX_PAGE_LIMIT,
      include_envelope: false,
    });

    if (my_gen !== build_generation) return null;
    if (response.error || !response.data) return null;

    const page = response.data.items ?? [];

    for (const item of page) live.add(item.id);

    cursor = page.length > 0 ? response.data.next_cursor : undefined;
  } while (cursor && live.size < MAX_INDEX_ITEMS);

  if (cursor) return null;

  const head = await list_encrypted_mail_items({
    limit: INDEX_PAGE_LIMIT,
    include_envelope: false,
  });

  if (my_gen !== build_generation) return null;
  if (head.error || !head.data) return null;

  for (const item of head.data.items ?? []) live.add(item.id);

  return live;
}

export function reconcile_search_index(user_email: string): Promise<number> {
  if (reconcile_promise) return reconcile_promise;

  const my_gen = build_generation;
  const started_at = Date.now();

  reconcile_attempted_at = started_at;

  const arrivals = open_arrival_watch();
  const run: Promise<number> = (async (): Promise<number> => {
    const live = await list_live_mail_ids(my_gen);

    if (!live || my_gen !== build_generation) return 0;
    if (cached_index && cached_index.user_email !== user_email) return 0;

    const should_drop = (item: MailItem): boolean =>
      !live.has(item.id) && !arrivals.has(item.id);
    const hot_removed = drop_hot_entries(should_drop);
    const removed = await purge_snapshot_entries(should_drop);

    if (my_gen !== build_generation) return removed.length;

    settle_disk_purge(removed, hot_removed);

    if (await stamp_snapshot_verified(started_at)) {
      if (cached_index?.meta) cached_index.meta.verified_at = started_at;
    }

    if (removed.length > 0 || hot_removed.length > 0) emit_index_refreshed();

    return Math.max(removed.length, hot_removed.length);
  })()
    .catch((caught): number => {
      ignore_error("hooks/use_search/index_cache:reconcile", caught);

      return 0;
    })
    .finally(() => {
      close_arrival_watch(arrivals);
      if (reconcile_promise === run) reconcile_promise = null;
    });

  reconcile_promise = run;

  return run;
}

export function is_index_reconcile_due(
  index: CachedIndex,
  now: number = Date.now(),
): boolean {
  if (!index.meta || index.items.length === 0) return false;
  if (now - (index.meta.verified_at ?? 0) < RECONCILE_INTERVAL_MS) return false;

  return now - reconcile_attempted_at >= RECONCILE_RETRY_MS;
}

function schedule_index_reconcile(index: CachedIndex): void {
  if (reconcile_promise || is_index_download_paused()) return;
  if (!is_index_reconcile_due(index)) return;

  void reconcile_search_index(index.user_email);
}

export function reset_index_purge_state(): void {
  if (purge_timer) clearTimeout(purge_timer);
  purge_timer = null;
  pending_purge_ids.clear();
  pending_purge_scopes.clear();
  reconcile_attempted_at = 0;
}

export function mark_search_index_stale(): void {
  if (cached_index) {
    cached_index.built_at = 0;
  }
}

export interface IndexedFlagPatch {
  is_read?: boolean;
  is_starred?: boolean;
  is_trashed?: boolean;
  is_spam?: boolean;
  is_archived?: boolean;
}

export function patch_indexed_flags(
  ids: string[],
  patch: IndexedFlagPatch,
): void {
  if (!cached_index || ids.length === 0) return;

  const wanted = new Set(ids);

  for (const item of cached_index.items) {
    if (!wanted.has(item.id)) continue;

    if (patch.is_trashed !== undefined) item.is_trashed = patch.is_trashed;
    if (patch.is_spam !== undefined) item.is_spam = patch.is_spam;
    if (patch.is_archived !== undefined) item.is_archived = patch.is_archived;
    if (patch.is_read !== undefined) item.is_read = patch.is_read;
    if (patch.is_starred !== undefined) item.is_starred = patch.is_starred;

    const entry = cached_index.decrypted.get(item.id);

    if (entry?.metadata) {
      entry.metadata = {
        ...entry.metadata,
        ...(patch.is_read !== undefined ? { is_read: patch.is_read } : {}),
        ...(patch.is_starred !== undefined
          ? { is_starred: patch.is_starred }
          : {}),
        ...(patch.is_trashed !== undefined
          ? { is_trashed: patch.is_trashed }
          : {}),
        ...(patch.is_spam !== undefined ? { is_spam: patch.is_spam } : {}),
        ...(patch.is_archived !== undefined
          ? { is_archived: patch.is_archived }
          : {}),
      };
    }
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

  if (is_deep_index_running()) {
    const running_for = stale ?? null;

    if (index_is_body_compatible(running_for, user_email, include_body)) {
      return Promise.resolve(running_for);
    }

    build_generation++;
  }

  const promise = (
    stale && can_refresh_front(stale, include_body)
      ? build_index_front_refresh(user_email, include_body, stale)
      : build_index_full(user_email, include_body, stale)
  )
    .then((index) => {
      if (announced_index !== index) emit_index_refreshed();
      announced_index = null;
      schedule_index_reconcile(index);

      return index;
    })
    .finally(() => {
      if (index_build_promise === promise) {
        index_build_promise = null;
      }

      signal_partial_ready();
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

function can_refresh_front(index: CachedIndex, include_body: boolean): boolean {
  return (
    index.items.length > 0 &&
    !!index.meta &&
    index.meta.chunk_ids.length > front_chunk_count(index) &&
    (index.meta.include_body || !include_body)
  );
}

function index_is_body_compatible(
  index: CachedIndex | null,
  user_email: string,
  include_body: boolean,
): index is CachedIndex {
  return (
    !!index &&
    index.user_email === user_email &&
    (index.include_body || !include_body)
  );
}

function drop_index_for_other_user(user_email: string): void {
  if (cached_index && cached_index.user_email !== user_email) {
    cached_index = null;
    account_generation++;
    build_generation++;
    index_build_promise = null;
    reset_indexing_progress();
  }
}

export async function hydrate_snapshot_index(
  user_email: string,
): Promise<CachedIndex | null> {
  const my_gen = build_generation;
  const reader = await open_snapshot_reader(user_email);

  if (my_gen !== build_generation) return null;
  if (!reader || reader.meta.chunk_ids.length === 0) return null;

  const meta = reader.meta;
  const index = empty_index(user_email, meta.include_body);
  const layout: ChunkSpan[] = [];
  let layout_intact = true;
  let consumed = 0;

  reset_vocabulary();

  for (const chunk_id of meta.chunk_ids) {
    if (index.items.length >= MAX_RAM_INDEX_ITEMS) break;

    const chunk = await reader.read(chunk_id);

    if (my_gen !== build_generation) return null;

    consumed++;

    if (!chunk) {
      layout_intact = false;
      continue;
    }

    const start = index.items.length;

    const entries = new Map<string, PersistedSearchEntry>();

    for (const entry of chunk.entries) {
      entries.set(entry.id, entry);
    }

    for (const item of chunk.items) {
      const entry = entries.get(item.id);

      if (!entry) continue;

      drop_sender_verification(entry.envelope);
      index.items.push(item);
      index.decrypted.set(item.id, {
        envelope: entry.envelope,
        metadata: entry.metadata,
        search_body_text: entry.search_body_text,
        meta_fp: entry.meta_fp,
        has_body: entry.has_body,
        haystack: entry.envelope
          ? build_search_haystack(entry.envelope)
          : undefined,
      });
      queue_vocabulary_entry(entry.envelope, entry.search_body_text);
    }

    const count = index.items.length - start;

    if (count !== chunk.items.length) layout_intact = false;
    if (layout_intact) layout.push({ id: chunk_id, start, count });
  }

  if (index.items.length === 0) return null;

  index.chunk_layout = layout;

  index.meta = meta;
  index.built_at = meta.saved_at;
  index.total_indexed = meta.total;
  index.complete = meta.complete;
  index.disk_chunk_ids = meta.chunk_ids.slice(consumed);

  return index;
}

export async function acquire_search_index(
  user_email: string,
  include_body: boolean,
  ttl_ms: number = INDEX_TTL_MS,
): Promise<CachedIndex> {
  drop_index_for_other_user(user_email);

  const usable = cached_index;

  if (usable && usable.user_email === user_email) {
    const fresh =
      index_is_body_compatible(usable, user_email, include_body) &&
      usable.complete &&
      Date.now() - usable.built_at < ttl_ms;

    if (!fresh) void start_background_rebuild(user_email, include_body, usable);

    return usable;
  }

  const my_gen = build_generation;
  const my_account_gen = account_generation;
  const loaded = await hydrate_snapshot_index(user_email);

  if (my_account_gen !== account_generation) {
    return empty_index(user_email, include_body);
  }

  const hydrated = my_gen === build_generation ? loaded : null;

  if (cached_index && cached_index.user_email === user_email) {
    return cached_index;
  }

  if (!hydrated) {
    const ready = partial_ready();
    const build = start_background_rebuild(user_email, include_body);

    let build_failure: unknown = null;

    await Promise.race([
      ready,
      build.catch((caught) => {
        build_failure = caught ?? new Error("search_fetch_failed:unknown");
      }),
    ]);

    if (cached_index && cached_index.user_email === user_email) {
      return cached_index;
    }

    if (build_failure) throw build_failure;

    return empty_index(user_email, include_body);
  }

  cached_index = hydrated;

  void start_background_rebuild(user_email, include_body, hydrated);

  return hydrated;
}

export async function build_search_index(
  user_email: string,
  include_body: boolean,
  ttl_ms: number = INDEX_TTL_MS,
): Promise<CachedIndex> {
  drop_index_for_other_user(user_email);

  const body_compatible = (index: CachedIndex | null): index is CachedIndex =>
    index_is_body_compatible(index, user_email, include_body);

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

  const my_gen = build_generation;
  const my_account_gen = account_generation;
  const loaded = await hydrate_snapshot_index(user_email);

  if (my_account_gen !== account_generation) {
    return empty_index(user_email, include_body);
  }

  const hydrated = my_gen === build_generation ? loaded : null;

  if (index_build_promise) {
    return index_build_promise;
  }
  if (body_compatible(cached_index)) {
    return cached_index;
  }

  if (!hydrated || (include_body && !hydrated.include_body)) {
    return start_background_rebuild(user_email, include_body, hydrated);
  }

  cached_index = hydrated;

  void start_background_rebuild(user_email, include_body, hydrated);

  return hydrated;
}
