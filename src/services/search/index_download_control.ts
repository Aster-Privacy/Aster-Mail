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

export interface IndexDownloadState {
  paused: boolean;
  done: number;
  total: number;
}

const STORAGE_KEY = "aster_search_index_download_v1";

function default_state(): IndexDownloadState {
  return { paused: false, done: 0, total: 0 };
}

function read_persisted_state(): IndexDownloadState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);

    if (!raw) return default_state();

    const parsed = JSON.parse(raw) as Partial<IndexDownloadState>;

    return {
      paused: !!parsed.paused,
      done: typeof parsed.done === "number" ? parsed.done : 0,
      total: typeof parsed.total === "number" ? parsed.total : 0,
    };
  } catch {
    return default_state();
  }
}

let download_state: IndexDownloadState = read_persisted_state();
const download_listeners = new Set<() => void>();

function persist_state(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(download_state));
  } catch {
    return;
  }
}

function emit_download_state(next: Partial<IndexDownloadState>): void {
  download_state = { ...download_state, ...next };
  persist_state();
  download_listeners.forEach((cb) => cb());
}

export function is_index_download_paused(): boolean {
  return download_state.paused;
}

export function set_index_download_paused(paused: boolean): void {
  emit_download_state({ paused });
}

export function record_index_download_checkpoint(
  done: number,
  total: number,
): void {
  emit_download_state({ done, total: Math.max(total, done) });
}

export function reset_index_download_state(): void {
  emit_download_state(default_state());
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    return;
  }
}

export function subscribe_index_download(cb: () => void): () => void {
  download_listeners.add(cb);

  return () => {
    download_listeners.delete(cb);
  };
}

export function get_index_download_snapshot(): IndexDownloadState {
  return download_state;
}
