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
import { get_active_translations } from "@/lib/i18n/translations";

function is_tauri(): boolean {
  return "__TAURI_INTERNALS__" in window;
}

export async function update_tray_badge(unread_count: number): Promise<void> {
  if (!is_tauri()) return;

  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const tooltip =
      unread_count > 0
        ? `Aster Mail - ${get_active_translations().mail.tab_unread_count.replace(
            "{{count}}",
            String(unread_count),
          )}`
        : "Aster Mail";

    await invoke("set_tray_tooltip", { tooltip });
    const count = Math.max(0, Math.floor(unread_count));

    try {
      localStorage.setItem("aster_last_unread_badge", String(count));
    } catch {
      void 0;
    }
    await invoke("set_unread_badge", { count });
  } catch {
    return;
  }
}

const CLOSE_TO_TRAY_KEY = "aster_close_to_tray";

export function get_close_to_tray(): boolean {
  try {
    return localStorage.getItem(CLOSE_TO_TRAY_KEY) !== "false";
  } catch {
    return true;
  }
}

export async function set_close_to_tray(enabled: boolean): Promise<boolean> {
  const previous = get_close_to_tray();

  try {
    localStorage.setItem(CLOSE_TO_TRAY_KEY, enabled ? "true" : "false");
  } catch {
    void 0;
  }

  if (!is_tauri()) return true;

  try {
    const { invoke } = await import("@tauri-apps/api/core");

    await invoke("set_close_to_tray", { enabled });

    return true;
  } catch {
    try {
      localStorage.setItem(CLOSE_TO_TRAY_KEY, previous ? "true" : "false");
    } catch {
      void 0;
    }

    return false;
  }
}

export async function sync_close_to_tray(): Promise<void> {
  await set_close_to_tray(get_close_to_tray());
}

export async function sync_tray_labels(): Promise<void> {
  if (!is_tauri()) return;

  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const common = get_active_translations().common;

    await invoke("set_tray_labels", {
      labels: {
        show: common.tray_show,
        quit: common.tray_quit,
        troubleshooting: common.tray_troubleshooting,
        compat_on: common.tray_compat_on,
        compat_off: common.tray_compat_off,
        display_reset: common.tray_display_reset,
      },
    });
  } catch {
    return;
  }
}
