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
  useSyncExternalStore,
} from "react";

import {
  get_index_download_snapshot,
  set_index_download_paused,
  subscribe_index_download,
  type IndexDownloadState,
} from "@/services/search/index_download_control";

import { build_search_index, cached_index, schedule_deep_index } from "./index_cache";
import { IndexingProgress } from "./types";
export let indexing_progress: IndexingProgress = {
  building: false,
  current: 0,
  total: 0,
};
export const indexing_listeners = new Set<() => void>();

export function emit_indexing(next: Partial<IndexingProgress>) {
  indexing_progress = { ...indexing_progress, ...next };
  indexing_listeners.forEach((cb) => cb());
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

  void build_search_index(user_email, include_body).catch(() => {});
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

