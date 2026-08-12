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
import { useEffect, useState } from "react";
import { XMarkIcon, ArrowDownTrayIcon } from "@heroicons/react/24/outline";

import { use_i18n } from "@/lib/i18n/context";
import { ignore_error } from "@/lib/ignore_error";

import {
  is_desktop_runtime,
  get_last_notified_version,
  mark_version_notified,
  check_for_update,
  download_and_install_update,
  update_progress_percent,
  type DesktopUpdateInfo,
  type UpdateProgress,
} from "@/services/updates/updater";

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

export function UpdateBanner() {
  const { t } = use_i18n();
  const [info, set_info] = useState<DesktopUpdateInfo | null>(null);
  const [dismissed, set_dismissed] = useState(false);
  const [installing, set_installing] = useState(false);
  const [progress, set_progress] = useState<UpdateProgress | null>(null);

  useEffect(() => {
    if (!is_desktop_runtime()) return;
    let cancelled = false;
    const run = async () => {
      try {
        const result = await check_for_update();
        if (cancelled) return;
        if (result && get_last_notified_version() !== result.version) {
          set_info(result);
        }
      } catch (caught) {
        ignore_error("components/updates/update_banner:run", caught);
      }
    };
    run();
    const id = window.setInterval(run, CHECK_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  if (!info || dismissed) return null;

  const percent = update_progress_percent(progress);

  const handle_install = async () => {
    if (installing) return;
    set_installing(true);
    set_progress({ downloaded: 0, total: null });
    try {
      await download_and_install_update(set_progress);
    } catch {
      set_installing(false);
      set_progress(null);
    }
  };

  const handle_dismiss = () => {
    mark_version_notified(info.version);
    set_dismissed(true);
  };

  return (
    <div
      className="fixed bottom-4 right-4 z-[9999] max-w-sm rounded-xl border shadow-2xl p-3"
      style={{
        backgroundColor: "var(--bg-primary, #111)",
        borderColor: "var(--border-primary, #444)",
        color: "var(--text-primary, #fff)",
      }}
    >
      <div className="flex items-start gap-3">
        <ArrowDownTrayIcon className="w-5 h-5 mt-0.5 text-txt-primary flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-txt-primary">
            {t("settings.updates_banner_title", { version: info.version })}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <button
              className="h-7 px-3 rounded-lg bg-indigo-600 text-xs font-medium text-white transition-colors hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={installing}
              onClick={handle_install}
            >
              {!installing
                ? t("settings.updates_banner_action")
                : percent === null
                  ? t("settings.updates_downloading")
                  : t("settings.updates_installing", {
                      percent: String(percent),
                    })}
            </button>
            <button
              className="h-7 px-3 rounded-lg border border-edge-secondary bg-surf-tertiary text-xs font-medium text-txt-primary transition-colors hover:opacity-80"
              onClick={handle_dismiss}
            >
              {t("settings.updates_dismiss")}
            </button>
          </div>
          {installing && (
            <div
              aria-valuemax={100}
              aria-valuemin={0}
              aria-valuenow={percent ?? undefined}
              className="mt-2 h-1 w-full overflow-hidden rounded-full bg-surf-tertiary"
              role="progressbar"
            >
              <div
                className={`h-full rounded-full bg-indigo-600 ${
                  percent === null ? "w-1/3 animate-pulse" : "transition-[width]"
                }`}
                style={percent === null ? undefined : { width: `${percent}%` }}
              />
            </div>
          )}
        </div>
        <button
          aria-label="dismiss"
          className="p-1 text-txt-muted hover:text-txt-primary"
          onClick={handle_dismiss}
        >
          <XMarkIcon className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
