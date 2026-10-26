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
import type { ActionToastButton } from "@/components/toast/action_toast";

import { useEffect, useRef } from "react";

import { show_action_toast } from "@/components/toast/action_toast";
import { show_toast } from "@/components/toast/simple_toast";
import { use_i18n } from "@/lib/i18n/context";
import { is_mac_platform } from "@/lib/utils";

export const DOWNLOAD_FINISHED_EVENT = "aster://download-finished";
export const DOWNLOAD_FAILED_EVENT = "aster://download-failed";

const DOWNLOAD_TOAST_MS = 10000;
const DOWNLOAD_ID_PATTERN = /^[0-9a-f-]{36}$/;

export interface DownloadFinishedPayload {
  id: string;
  file_name: string;
  can_open: boolean;
}

type Translate = ReturnType<typeof use_i18n>["t"];

let tauri_core: Promise<typeof import("@tauri-apps/api/core")> | null = null;

function load_tauri_core(): Promise<typeof import("@tauri-apps/api/core")> {
  if (!tauri_core) {
    tauri_core = import("@tauri-apps/api/core").catch((error: unknown) => {
      tauri_core = null;
      throw error;
    });
  }

  return tauri_core;
}

function is_desktop(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

async function run_download_command(
  command: "open_download" | "reveal_download",
  id: string,
): Promise<boolean> {
  try {
    const { invoke } = await load_tauri_core();

    await invoke(command, { id });

    return true;
  } catch {
    return false;
  }
}

async function notify_when_unfocused(title: string, body: string) {
  if (document.hasFocus()) return;

  try {
    const { isPermissionGranted } =
      await import("@tauri-apps/plugin-notification");

    if (!(await isPermissionGranted())) return;

    const { invoke } = await load_tauri_core();

    await invoke("show_mail_notification", { title, body, emailId: null });
  } catch {
    return;
  }
}

export function handle_download_finished(
  payload: DownloadFinishedPayload,
  t: Translate,
): void {
  if (!payload || !DOWNLOAD_ID_PATTERN.test(payload.id)) return;

  const file_name =
    typeof payload.file_name === "string" ? payload.file_name : "";
  const actions: ActionToastButton[] = [];

  if (payload.can_open === true) {
    actions.push({
      label: t("common.open_file"),
      on_press: () => {
        void run_download_command("open_download", payload.id).then((ok) => {
          if (!ok) show_toast(t("common.download_open_failed"), "error");
        });
      },
    });
  }

  actions.push({
    label: is_mac_platform()
      ? t("common.show_in_finder")
      : t("common.show_in_folder"),
    on_press: () => {
      void run_download_command("reveal_download", payload.id).then((ok) => {
        if (!ok) show_toast(t("common.download_reveal_failed"), "error");
      });
    },
  });

  show_action_toast({
    message: file_name
      ? t("common.downloaded_file", { file_name })
      : t("common.download_complete"),
    action_type: "download",
    email_ids: [],
    actions,
    sound: "done",
    duration_ms: DOWNLOAD_TOAST_MS,
  });

  void notify_when_unfocused(t("common.download_complete"), file_name);
}

export function DesktopDownloadNotifier(): null {
  const { t } = use_i18n();
  const t_ref = useRef(t);

  t_ref.current = t;

  useEffect(() => {
    if (!is_desktop()) return;

    let disposed = false;
    const unlisteners: Array<() => void> = [];

    void import("@tauri-apps/api/event")
      .then(async ({ listen }) => {
        const finished = await listen<DownloadFinishedPayload>(
          DOWNLOAD_FINISHED_EVENT,
          (event) => handle_download_finished(event.payload, t_ref.current),
        );
        const failed = await listen(DOWNLOAD_FAILED_EVENT, () =>
          show_toast(t_ref.current("common.download_failed"), "error"),
        );

        if (disposed) {
          finished();
          failed();

          return;
        }
        unlisteners.push(finished, failed);
      })
      .catch(() => undefined);

    return () => {
      disposed = true;
      unlisteners.forEach((unlisten) => unlisten());
    };
  }, []);

  return null;
}
