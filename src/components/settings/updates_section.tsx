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
import { useEffect, useState, useCallback } from "react";
import { ArrowPathIcon, ArrowDownTrayIcon } from "@heroicons/react/24/outline";
import { Switch, Button } from "@aster/ui";

import { use_i18n } from "@/lib/i18n/context";
import {
  is_desktop_runtime,
  get_auto_update_enabled,
  set_auto_update_enabled,
  get_last_check_iso,
  check_for_update,
  download_and_install_update,
  type DesktopUpdateInfo,
} from "@/services/updates/updater";

declare const __APP_VERSION__: string;
const APP_VERSION =
  typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "dev";

function format_relative(iso: string | null): string | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diff_min = Math.max(1, Math.round((now - then) / 60_000));
  if (diff_min < 60) return `${diff_min}m ago`;
  const diff_hr = Math.round(diff_min / 60);
  if (diff_hr < 24) return `${diff_hr}h ago`;
  const diff_day = Math.round(diff_hr / 24);
  return `${diff_day}d ago`;
}

export function UpdatesSection() {
  const { t } = use_i18n();
  const supported = is_desktop_runtime();
  const [auto, set_auto] = useState<boolean>(() => get_auto_update_enabled());
  const [last_check, set_last_check] = useState<string | null>(() =>
    get_last_check_iso(),
  );
  const [checking, set_checking] = useState(false);
  const [installing, set_installing] = useState(false);
  const [progress, set_progress] = useState<number | null>(null);
  const [available, set_available] = useState<DesktopUpdateInfo | null>(null);
  const [status_msg, set_status_msg] = useState<string | null>(null);

  const handle_auto = (v: boolean) => {
    set_auto(v);
    set_auto_update_enabled(v);
  };

  const handle_check = useCallback(async () => {
    if (!supported || checking) return;
    set_checking(true);
    set_status_msg(null);
    try {
      const info = await check_for_update();
      set_last_check(get_last_check_iso());
      if (info) {
        set_available(info);
      } else {
        set_available(null);
        set_status_msg(t("settings.updates_up_to_date"));
      }
    } catch (err) {
      set_status_msg(String((err as Error)?.message ?? err));
    } finally {
      set_checking(false);
    }
  }, [supported, checking, t]);

  const handle_install = useCallback(async () => {
    if (!supported || installing) return;
    set_installing(true);
    set_progress(0);
    try {
      await download_and_install_update((p) => {
        if (p.total && p.total > 0) {
          set_progress(Math.min(100, Math.round((p.downloaded / p.total) * 100)));
        }
      });
    } catch (err) {
      set_status_msg(String((err as Error)?.message ?? err));
      set_installing(false);
      set_progress(null);
    }
  }, [supported, installing]);

  useEffect(() => {
    if (supported && auto) {
      handle_check();
    }
  }, [supported, auto, handle_check]);

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-4">
          <h3 className="text-base font-semibold text-txt-primary flex items-center gap-2">
            <ArrowDownTrayIcon className="w-[18px] h-[18px] text-txt-primary flex-shrink-0" />
            {t("settings.updates")}
          </h3>
          <div className="mt-2 h-px bg-edge-secondary" />
        </div>
        <p className="text-sm mb-4 text-txt-muted">
          {t("settings.updates_description")}
        </p>
      </div>

      <div className="rounded-xl border border-edge-secondary p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-txt-primary">
              {t("settings.updates_current_version", { version: APP_VERSION })}
            </p>
            <p className="text-xs mt-0.5 text-txt-muted">
              {last_check
                ? t("settings.updates_last_checked", {
                    when: format_relative(last_check) || "",
                  })
                : t("settings.updates_never_checked")}
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            disabled={!supported || checking || installing}
            onClick={handle_check}
          >
            <ArrowPathIcon
              className={`w-4 h-4 mr-1.5 ${checking ? "animate-spin" : ""}`}
            />
            {checking
              ? t("settings.updates_checking")
              : t("settings.updates_check_now")}
          </Button>
        </div>

        {!supported && (
          <p className="text-xs text-txt-muted">
            {t("settings.updates_unsupported")}
          </p>
        )}

        {available && (
          <div className="rounded-lg bg-surf-secondary p-3 space-y-2">
            <p className="text-sm font-medium text-txt-primary">
              {t("settings.updates_available", { version: available.version })}
            </p>
            {available.notes && (
              <details className="text-xs text-txt-muted">
                <summary className="cursor-pointer">
                  {t("settings.updates_release_notes")}
                </summary>
                <pre className="mt-2 whitespace-pre-wrap font-sans">
                  {available.notes}
                </pre>
              </details>
            )}
            <Button
              variant="primary"
              size="sm"
              disabled={installing}
              onClick={handle_install}
            >
              {installing
                ? t("settings.updates_installing", {
                    percent: String(progress ?? 0),
                  })
                : t("settings.updates_install_and_restart")}
            </Button>
          </div>
        )}

        {status_msg && !available && (
          <p className="text-xs text-txt-muted">{status_msg}</p>
        )}
      </div>

      <div className="rounded-xl border border-edge-secondary p-4">
        <div className="flex items-center justify-between">
          <div className="flex-1 pr-4">
            <p className="text-sm font-medium text-txt-primary">
              {t("settings.updates_auto_label")}
            </p>
            <p className="text-sm mt-0.5 text-txt-muted">
              {t("settings.updates_auto_description")}
            </p>
          </div>
          <Switch checked={auto} onCheckedChange={handle_auto} />
        </div>
      </div>
    </div>
  );
}
