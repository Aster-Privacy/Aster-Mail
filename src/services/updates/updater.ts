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

export interface DesktopUpdateInfo {
  version: string;
  current_version: string;
  notes?: string;
  date?: string;
}

export interface UpdateProgress {
  downloaded: number;
  total: number | null;
}

const AUTO_UPDATE_KEY = "aster_desktop_auto_update";
const LAST_CHECK_KEY = "aster_desktop_last_check";
const LAST_NOTIFIED_VERSION_KEY = "aster_desktop_last_notified_version";

export function is_desktop_runtime(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as unknown as { __TAURI_INTERNALS__?: unknown };
  return Boolean(w.__TAURI_INTERNALS__);
}

export function get_auto_update_enabled(): boolean {
  try {
    const v = localStorage.getItem(AUTO_UPDATE_KEY);
    return v === null ? true : v === "true";
  } catch {
    return true;
  }
}

export function set_auto_update_enabled(enabled: boolean): void {
  try {
    localStorage.setItem(AUTO_UPDATE_KEY, enabled ? "true" : "false");
  } catch {
    // Storage unavailable, default behavior persists for session.
  }
}

export function get_last_check_iso(): string | null {
  try {
    return localStorage.getItem(LAST_CHECK_KEY);
  } catch {
    return null;
  }
}

function record_check_now(): void {
  try {
    localStorage.setItem(LAST_CHECK_KEY, new Date().toISOString());
  } catch {
    // Storage unavailable.
  }
}

export function get_last_notified_version(): string | null {
  try {
    return localStorage.getItem(LAST_NOTIFIED_VERSION_KEY);
  } catch {
    return null;
  }
}

export function mark_version_notified(version: string): void {
  try {
    localStorage.setItem(LAST_NOTIFIED_VERSION_KEY, version);
  } catch {
    // Storage unavailable.
  }
}

interface TauriUpdate {
  version: string;
  currentVersion: string;
  body?: string;
  date?: string;
  download: (
    on_event?: (event: {
      event: "Started" | "Progress" | "Finished";
      data?: { contentLength?: number; chunkLength?: number };
    }) => void,
  ) => Promise<void>;
  install: () => Promise<void>;
  downloadAndInstall: (
    on_event?: (event: {
      event: "Started" | "Progress" | "Finished";
      data?: { contentLength?: number; chunkLength?: number };
    }) => void,
  ) => Promise<void>;
}

async function load_updater_api(): Promise<{
  check: () => Promise<TauriUpdate | null>;
}> {
  const mod = await import("@tauri-apps/plugin-updater");
  return { check: mod.check as () => Promise<TauriUpdate | null> };
}

async function load_process_api(): Promise<{ relaunch: () => Promise<void> }> {
  const mod = await import("@tauri-apps/plugin-process");
  return { relaunch: mod.relaunch as () => Promise<void> };
}

export async function check_for_update(): Promise<DesktopUpdateInfo | null> {
  if (!is_desktop_runtime()) return null;
  const { check } = await load_updater_api();
  record_check_now();
  const result = await check();
  if (!result) return null;
  return {
    version: result.version,
    current_version: result.currentVersion,
    notes: result.body,
    date: result.date,
  };
}

export async function download_and_install_update(
  on_progress?: (p: UpdateProgress) => void,
): Promise<void> {
  if (!is_desktop_runtime()) {
    throw new Error("updates_not_supported");
  }
  const { check } = await load_updater_api();
  const update = await check();
  if (!update) return;
  let downloaded = 0;
  let total: number | null = null;
  await update.downloadAndInstall((event) => {
    if (event.event === "Started") {
      total = event.data?.contentLength ?? null;
      downloaded = 0;
      on_progress?.({ downloaded, total });
    } else if (event.event === "Progress") {
      downloaded += event.data?.chunkLength ?? 0;
      on_progress?.({ downloaded, total });
    } else if (event.event === "Finished") {
      on_progress?.({ downloaded: total ?? downloaded, total });
    }
  });
  const { relaunch } = await load_process_api();
  await relaunch();
}
