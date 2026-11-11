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
import { public_web_url } from "@/lib/public_origin";

const REPEAT_OPEN_WINDOW_MS = 1000;

let last_opened_url = "";
let last_opened_at = 0;

function is_repeat_open(url: string): boolean {
  const now = Date.now();

  if (url === last_opened_url && now - last_opened_at < REPEAT_OPEN_WINDOW_MS) {
    return true;
  }

  last_opened_url = url;
  last_opened_at = now;

  return false;
}

export function reset_open_external_state(): void {
  last_opened_url = "";
  last_opened_at = 0;
}

export function open_external(url: string, features?: string): Window | null {
  let normalized: string;

  try {
    const candidate = url.startsWith("//") ? `https:${url}` : url;
    const parsed = new URL(public_web_url(candidate));

    if (!["http:", "https:", "mailto:"].includes(parsed.protocol)) {
      return null;
    }
    normalized = parsed.href;
  } catch {
    return null;
  }

  const is_desktop =
    typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

  if (is_desktop) {
    if (is_repeat_open(normalized)) return null;

    void (async () => {
      try {
        const { invoke } = await import("@tauri-apps/api/core");

        await invoke("open_external_url", { url: normalized });
      } catch {
        try {
          const { open } = await import("@tauri-apps/plugin-shell");

          await open(normalized);
        } catch {
          window.open(normalized, "_blank", "noopener,noreferrer");
        }
      }
    })();

    return null;
  }

  const base = "noopener,noreferrer";
  const combined = features ? `${base},${features}` : base;

  return window.open(normalized, "_blank", combined);
}
