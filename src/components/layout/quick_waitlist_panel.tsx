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
import type { CalendarWaitlistStatus } from "@/services/api/calendar_waitlist";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CalendarDaysIcon,
  CheckCircleIcon,
  LockClosedIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { Button, Spinner, Tooltip } from "@aster/ui";

import {
  get_calendar_waitlist_status,
  join_calendar_waitlist,
  leave_calendar_waitlist,
} from "@/services/api/calendar_waitlist";
import { use_i18n } from "@/lib/i18n/context";
import { use_escape_layer } from "@/lib/overlay_layer_stack";
import { use_panel_inset } from "@/hooks/use_panel_inset";
import { use_panel_transition } from "@/components/layout/use_panel_transition";

interface QuickWaitlistPanelProps {
  is_open: boolean;
  is_swapping: boolean;
  on_close: () => void;
}

type WaitlistLoad =
  | { kind: "loading" }
  | { kind: "ready"; status: CalendarWaitlistStatus }
  | { kind: "failed" };

export function QuickWaitlistPanel({
  is_open,
  is_swapping,
  on_close,
}: QuickWaitlistPanelProps) {
  const { t } = use_i18n();
  const panel_ref = useRef<HTMLElement | null>(null);
  const [load, set_load] = useState<WaitlistLoad>({ kind: "loading" });
  const [is_busy, set_is_busy] = useState(false);
  const [has_action_failed, set_has_action_failed] = useState(false);

  const { is_visible, is_closing } = use_panel_transition(is_open, is_swapping);

  use_escape_layer(is_open, on_close, "quick_waitlist_panel", false);
  use_panel_inset(is_visible, panel_ref);

  useEffect(() => {
    if (!is_open) return;
    let is_current = true;

    set_load({ kind: "loading" });
    get_calendar_waitlist_status()
      .then((status) => {
        if (is_current) set_load({ kind: "ready", status });
      })
      .catch(() => {
        if (is_current) set_load({ kind: "failed" });
      });

    return () => {
      is_current = false;
    };
  }, [is_open]);

  const run_action = useCallback(
    async (action: () => Promise<CalendarWaitlistStatus>) => {
      set_is_busy(true);
      set_has_action_failed(false);
      try {
        const status = await action();

        set_load({ kind: "ready", status });
      } catch {
        set_has_action_failed(true);
      } finally {
        set_is_busy(false);
      }
    },
    [],
  );

  const join = useCallback(
    () => run_action(join_calendar_waitlist),
    [run_action],
  );
  const leave = useCallback(
    () => run_action(leave_calendar_waitlist),
    [run_action],
  );

  const is_joined = load.kind === "ready" && load.status.joined;

  return (
    <aside
      ref={panel_ref}
      aria-label={t("calendar.beta_waitlist_title")}
      className={`quick_waitlist_panel absolute inset-0 flex-col overflow-hidden rounded-lg bg-surf-primary md:rounded-xl ${
        is_visible ? "flex" : "hidden"
      } ${is_closing ? "quick_panel_closing" : "z-10"}`}
    >
      <div className="flex h-12 flex-shrink-0 items-center gap-2 ps-3 pe-2">
        <CalendarDaysIcon className="h-[18px] w-[18px] flex-shrink-0 text-brand-primary" />
        <h2 className="flex-1 truncate text-[15px] font-medium text-txt-primary">
          {t("calendar.beta_waitlist_title")}
        </h2>
        <Tooltip position="bottom" tip={t("common.close")}>
          <Button
            aria-label={t("common.close")}
            className="h-8 w-8 flex-shrink-0 text-[var(--icon-muted)]"
            size="icon"
            variant="ghost"
            onClick={on_close}
          >
            <XMarkIcon className="h-4 w-4" />
          </Button>
        </Tooltip>
      </div>
      {load.kind === "loading" ? (
        <div className="flex flex-1 items-center justify-center">
          <Spinner size="md" />
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-5 pt-2 pb-4">
          {is_joined ? (
            <div className="flex flex-col items-start gap-2">
              <CheckCircleIcon className="h-8 w-8 text-brand-primary" />
              <p className="text-[15px] font-medium text-txt-primary">
                {t("calendar.beta_waitlist_joined")}
              </p>
              <p className="text-[13px] leading-snug text-txt-secondary">
                {t("calendar.beta_waitlist_joined_body")}
              </p>
            </div>
          ) : (
            <p className="text-[13.5px] leading-snug text-txt-secondary">
              {t("calendar.beta_waitlist_body")}
            </p>
          )}
          {(load.kind === "failed" || has_action_failed) && (
            <p className="mt-3 text-[12.5px] text-red-500" role="alert">
              {t("calendar.beta_waitlist_failed")}
            </p>
          )}
          <div className="mt-4">
            {is_joined ? (
              <Button
                disabled={is_busy}
                size="md"
                variant="outline"
                onClick={leave}
              >
                {t("calendar.beta_waitlist_leave")}
              </Button>
            ) : (
              <Button
                disabled={is_busy}
                size="md"
                variant="depth"
                onClick={join}
              >
                {t("calendar.beta_waitlist_apply")}
              </Button>
            )}
          </div>
          <div className="mt-5 flex items-start gap-2 text-[12px] leading-snug text-txt-muted">
            <LockClosedIcon className="mt-px h-3.5 w-3.5 flex-shrink-0" />
            <span>{t("calendar.beta_waitlist_privacy")}</span>
          </div>
        </div>
      )}
    </aside>
  );
}
