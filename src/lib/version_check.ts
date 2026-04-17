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

declare const __BUILD_HASH__: string;
declare const __APP_VERSION__: string;

interface VersionManifest {
  version: string;
  build: string;
  ts: number;
}

const CHECK_INTERVAL_MS = 5 * 60 * 1000;
const MANIFEST_URL = "/version.json";

const loaded_build =
  typeof __BUILD_HASH__ !== "undefined" ? __BUILD_HASH__ : "";
const loaded_version =
  typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "";

let is_flushing = false;
let last_checked_at = 0;

async function fetch_manifest(): Promise<VersionManifest | null> {
  try {
    const res = await fetch(`${MANIFEST_URL}?t=${Date.now()}`, {
      cache: "no-store",
      credentials: "omit",
      headers: { "cache-control": "no-cache" },
    });

    if (!res.ok) return null;

    return (await res.json()) as VersionManifest;
  } catch {
    return null;
  }
}

export async function hard_flush_and_reload(): Promise<void> {
  if (is_flushing) return;
  is_flushing = true;

  try {
    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();

      await Promise.all(
        registrations.map((r) => r.unregister().catch(() => false)),
      );
    }
  } catch {}

  try {
    if ("caches" in window) {
      const keys = await caches.keys();

      await Promise.all(keys.map((k) => caches.delete(k).catch(() => false)));
    }
  } catch {}

  const url = new URL(window.location.href);

  url.searchParams.set("_v", Date.now().toString(36));
  window.location.replace(url.toString());
}

async function check_once(): Promise<void> {
  const now = Date.now();

  if (now - last_checked_at < 10_000) return;
  last_checked_at = now;

  const manifest = await fetch_manifest();

  if (!manifest || !manifest.build) return;

  const aster_version_ref = window as unknown as {
    __aster_version?: Record<string, unknown>;
  };

  if (aster_version_ref.__aster_version) {
    aster_version_ref.__aster_version.manifest_ts = manifest.ts;
  }

  if (aster_version_ref.__aster_version) {
    aster_version_ref.__aster_version.update_available =
      !!loaded_build && manifest.build !== loaded_build;
  }
}

export function start_version_check(): void {
  if (typeof window === "undefined") return;
  if (!import.meta.env.PROD) return;

  (window as unknown as { __aster_version?: unknown }).__aster_version = {
    version: loaded_version,
    build: loaded_build,
    ts: Date.now(),
  };

  void check_once();

  setInterval(() => {
    void check_once();
  }, CHECK_INTERVAL_MS);

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      void check_once();
    }
  });

  window.addEventListener("focus", () => {
    void check_once();
  });

  window.addEventListener("online", () => {
    void check_once();
  });
}
