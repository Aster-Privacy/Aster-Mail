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
import type { TranslationKey } from "@/lib/i18n/types";

import { useEffect, useState, useCallback, useRef } from "react";
import { ArrowPathIcon, ArrowDownTrayIcon } from "@heroicons/react/24/outline";
import { CheckCircleIcon } from "@heroicons/react/20/solid";
import {
  Button,
  Island,
  IslandSection,
  IslandSections,
  SettingToggleRow,
} from "@aster/ui";

import { Spinner } from "@/components/ui/spinner";
import { UpdateCard } from "@/components/updates/update_card";
import { use_update_installer } from "@/components/updates/use_update_installer";
import { use_i18n } from "@/lib/i18n/context";
import {
  is_desktop_runtime,
  get_auto_update_enabled,
  set_auto_update_enabled,
  get_last_check_iso,
  check_for_update,
  type DesktopUpdateInfo,
} from "@/services/updates/updater";
import { format_relative_time_short } from "@/utils/date_utils";

declare const __APP_VERSION__: string;
const APP_VERSION =
  typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "dev";

function format_relative(
  iso: string | null,
  t: (key: TranslationKey, params?: Record<string, string | number>) => string,
): string | null {
  if (!iso) return null;

  return format_relative_time_short(iso, t);
}

export function UpdatesSection() {
  const { t } = use_i18n();
  const supported = is_desktop_runtime();
  const [auto, set_auto] = useState<boolean>(() => get_auto_update_enabled());
  const [last_check, set_last_check] = useState<string | null>(() =>
    get_last_check_iso(),
  );
  const [checking, set_checking] = useState(false);
  const is_checking_ref = useRef(false);
  const { state: install_state, start: start_install } = use_update_installer();
  const installing =
    install_state.phase !== "idle" && install_state.phase !== "failed";
  const [available, set_available] = useState<DesktopUpdateInfo | null>(null);
  const [status_msg, set_status_msg] = useState<string | null>(null);
  const [error_msg, set_error_msg] = useState<string | null>(null);

  const handle_auto = (v: boolean) => {
    set_auto(v);
    set_auto_update_enabled(v);
  };

  const handle_check = useCallback(async () => {
    if (!supported || is_checking_ref.current) return;
    is_checking_ref.current = true;
    set_checking(true);
    set_status_msg(null);
    set_error_msg(null);
    try {
      const info = await check_for_update();

      set_last_check(get_last_check_iso());
      if (info) {
        set_available(info);
      } else {
        set_available(null);
        set_status_msg(t("settings.updates_up_to_date"));
      }
    } catch {
      set_error_msg(t("settings.updates_check_failed"));
    } finally {
      is_checking_ref.current = false;
      set_checking(false);
    }
  }, [supported, t]);

  const handle_install = useCallback(() => {
    if (!supported) return;
    set_error_msg(null);
    void start_install();
  }, [supported, start_install]);

  useEffect(() => {
    if (supported && auto) {
      handle_check();
    }
  }, [supported, auto, handle_check]);

  return (
    <IslandSections>
      <IslandSection
        bare
        description={t("settings.updates_description")}
        icon={<ArrowDownTrayIcon />}
        title={t("settings.updates")}
      >
        <Island className="space-y-3" padding="md">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-txt-primary">
                {t("settings.updates_current_version", {
                  version: APP_VERSION,
                })}
              </p>
              <p className="text-xs mt-0.5 text-txt-muted">
                {last_check
                  ? t("settings.updates_last_checked", {
                      when: format_relative(last_check, t) || "",
                    })
                  : t("settings.updates_never_checked")}
              </p>
            </div>
            <Button
              disabled={!supported || checking || installing}
              variant="secondary"
              onClick={handle_check}
            >
              {checking ? (
                <Spinner className="me-1.5" size="xs" />
              ) : (
                <ArrowPathIcon className="w-4 h-4 me-1.5" />
              )}
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
            <Island padding="md" tone="accent">
              <UpdateCard
                install={install_state}
                notes={available.notes}
                on_install={handle_install}
                variant="inline"
                version={available.version}
              />
            </Island>
          )}

          {error_msg && <p className="text-xs text-red-500">{error_msg}</p>}

          {status_msg && !available && (
            <p className="flex items-center gap-1.5 text-xs text-txt-muted">
              <CheckCircleIcon className="h-4 w-4 text-brand" />
              {status_msg}
            </p>
          )}
        </Island>

        <Island>
          <SettingToggleRow
            checked={auto}
            description={t("settings.updates_auto_description")}
            label={t("settings.updates_auto_label")}
            on_change={handle_auto}
          />
        </Island>
      </IslandSection>
    </IslandSections>
  );
}
