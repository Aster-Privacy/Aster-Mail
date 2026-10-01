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

import { useSyncExternalStore } from "react";

import {
  build_search_index,
  cached_index,
  schedule_deep_index,
} from "./index_cache";
import { PROGRESS_PUBLISH_INTERVAL_MS, advance_counts } from "./progress_math";
import { IndexingProgress } from "./types";

import {
  flush_index_download_checkpoint,
  get_index_download_snapshot,
  record_index_download_checkpoint,
  set_index_download_paused,
  subscribe_index_download,
  type IndexDownloadState,
} from "@/services/search/index_download_control";
import { ignore_error } from "@/lib/ignore_error";

export let indexing_progress: IndexingProgress = {
  building: false,
  current: 0,
  total: 0,
  session: 0,
};
export const indexing_listeners = new Set<() => void>();

const active_runs = new Set<number>();
let latest_progress: IndexingProgress = indexing_progress;
let next_run_id = 0;
let last_publish_ms = 0;
let publish_timer: ReturnType<typeof setTimeout> | null = null;

function publish_now(): void {
  if (publish_timer !== null) {
    clearTimeout(publish_timer);
    publish_timer = null;
  }

  if (indexing_progress === latest_progress) return;

  indexing_progress = latest_progress;
  last_publish_ms = Date.now();
  indexing_listeners.forEach((cb) => cb());
}

function publish_throttled(): void {
  const wait = PROGRESS_PUBLISH_INTERVAL_MS - (Date.now() - last_publish_ms);

  if (wait <= 0) {
    publish_now();

    return;
  }

  if (publish_timer !== null) return;

  publish_timer = setTimeout(() => {
    publish_timer = null;
    publish_now();
  }, wait);
}

export function begin_indexing_run(): number {
  const run_id = ++next_run_id;
  const starts_session = active_runs.size === 0;

  active_runs.add(run_id);
  latest_progress = starts_session
    ? {
        building: true,
        current: 0,
        total: 0,
        session: latest_progress.session + 1,
      }
    : { ...latest_progress, building: true };
  publish_now();

  return run_id;
}

export function report_indexing_counts(
  run_id: number,
  current: number,
  total: number,
): void {
  if (!active_runs.has(run_id)) return;

  const prev = { done: latest_progress.current, total: latest_progress.total };
  const next = advance_counts(prev, { done: current, total });

  if (next === prev) return;

  latest_progress = {
    ...latest_progress,
    current: next.done,
    total: next.total,
  };
  record_index_download_checkpoint(next.done, next.total);
  publish_throttled();
}

export function end_indexing_run(run_id: number, final_count?: number): void {
  if (!active_runs.delete(run_id)) return;

  if (final_count !== undefined && final_count >= 0) {
    latest_progress = {
      ...latest_progress,
      current: final_count,
      total: final_count,
    };
    record_index_download_checkpoint(final_count, final_count);
  }

  flush_index_download_checkpoint();
  latest_progress = { ...latest_progress, building: active_runs.size > 0 };
  publish_now();
}

export function reset_indexing_progress(): void {
  active_runs.clear();
  latest_progress = {
    building: false,
    current: 0,
    total: 0,
    session: latest_progress.session + 1,
  };
  publish_now();
}

export function subscribe_indexing(cb: () => void): () => void {
  indexing_listeners.add(cb);

  return () => {
    indexing_listeners.delete(cb);
  };
}

export function get_indexing_snapshot(): IndexingProgress {
  return indexing_progress;
}

export function use_indexing_progress(): IndexingProgress {
  return useSyncExternalStore(
    subscribe_indexing,
    get_indexing_snapshot,
    get_indexing_snapshot,
  );
}

export function use_index_download_state(): IndexDownloadState {
  return useSyncExternalStore(
    subscribe_index_download,
    get_index_download_snapshot,
    get_index_download_snapshot,
  );
}

export function pause_index_download(): void {
  set_index_download_paused(true);
}

export function resume_index_download(
  user_email: string,
  include_body: boolean,
): void {
  set_index_download_paused(false);

  if (
    cached_index &&
    cached_index.user_email === user_email &&
    cached_index.meta &&
    !cached_index.meta.complete
  ) {
    schedule_deep_index(
      user_email,
      cached_index.include_body || include_body,
      cached_index.meta,
    );

    return;
  }

  void build_search_index(user_email, include_body).catch((caught) =>
    ignore_error("hooks/use_search/progress:resume_index_download", caught),
  );
}

export const index_refresh_listeners = new Set<() => void>();

export function emit_index_refreshed(): void {
  index_refresh_listeners.forEach((cb) => cb());
}

export function subscribe_index_refresh(cb: () => void): () => void {
  index_refresh_listeners.add(cb);

  return () => {
    index_refresh_listeners.delete(cb);
  };
}
