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
const LINK_ACTIVATED_EVENT = "aster://link-activated";
const ASTER_PATH_ALLOWLIST = /^(?:settings(?:\/[a-z0-9_-]{1,32})?)$/i;

function is_desktop(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export function dispatch_activated_link(raw_url: string): void {
  if (!raw_url) return;

  if (raw_url.startsWith("aster:")) {
    const path = raw_url.slice("aster:".length);

    if (ASTER_PATH_ALLOWLIST.test(path)) {
      window.dispatchEvent(
        new CustomEvent("aster-internal-link", { detail: { path } }),
      );
    }

    return;
  }

  window.dispatchEvent(
    new CustomEvent("aster-external-link", { detail: { url: raw_url } }),
  );
}

export async function start_desktop_link_bridge(): Promise<void> {
  if (!is_desktop()) return;
  try {
    const { listen } = await import("@tauri-apps/api/event");

    await listen<string>(LINK_ACTIVATED_EVENT, (event) => {
      dispatch_activated_link(event.payload);
    });
  } catch {
    if (import.meta.env.DEV) {
      console.error("desktop link bridge unavailable");
    }
  }
}
