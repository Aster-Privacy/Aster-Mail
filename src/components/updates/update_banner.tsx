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
import { Button } from "@aster/ui";

import { use_i18n } from "@/lib/i18n/context";
import {
  is_desktop_runtime,
  get_auto_update_enabled,
  get_last_notified_version,
  mark_version_notified,
  check_for_update,
  download_and_install_update,
  type DesktopUpdateInfo,
} from "@/services/updates/updater";

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

export function UpdateBanner() {
  const { t } = use_i18n();
  const [info, set_info] = useState<DesktopUpdateInfo | null>(null);
  const [dismissed, set_dismissed] = useState(false);
  const [installing, set_installing] = useState(false);

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
      } catch {
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

  const handle_install = async () => {
    if (!get_auto_update_enabled() && installing) return;
    set_installing(true);
    try {
      await download_and_install_update();
    } catch {
      set_installing(false);
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
            <Button
              variant="primary"
              size="sm"
              disabled={installing}
              onClick={handle_install}
            >
              {installing
                ? t("settings.updates_installing", { percent: "" })
                : t("settings.updates_banner_action")}
            </Button>
            <Button variant="secondary" size="sm" onClick={handle_dismiss}>
              {t("settings.updates_dismiss")}
            </Button>
          </div>
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
