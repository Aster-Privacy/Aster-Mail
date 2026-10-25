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
import type { ComponentType, CSSProperties, SVGProps } from "react";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CheckIcon,
  DevicePhoneMobileIcon,
  LinkIcon,
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

interface WaitlistFeature {
  key: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  title: string;
  body: string;
}

const HERO_ICON_STYLE = {
  "--app-rail-icon-tint": 'url("/icons/calendar/calendar_tint_192.png")',
} as CSSProperties;

const ACCENT_SOFT =
  "bg-[color-mix(in_srgb,var(--accent-color)_12%,transparent)] text-[var(--accent-color)]";

function WaitlistBadge({ label, tip }: { label: string; tip: string }) {
  return (
    <Tooltip position="bottom" tip={tip}>
      <span
        className={`inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-[12px] font-medium ${ACCENT_SOFT}`}
      >
        <LockClosedIcon aria-hidden="true" className="h-3.5 w-3.5" />
        <span>{label}</span>
        <span className="sr-only">{tip}</span>
      </span>
    </Tooltip>
  );
}

export function QuickWaitlistPanel({
  is_open,
  is_swapping,
  on_close,
}: QuickWaitlistPanelProps) {
  const { t } = use_i18n();
  const panel_ref = useRef<HTMLElement | null>(null);
  const request_ref = useRef(0);
  const busy_ref = useRef(false);
  const [load, set_load] = useState<WaitlistLoad>({ kind: "loading" });
  const [is_busy, set_is_busy] = useState(false);
  const [has_action_failed, set_has_action_failed] = useState(false);
  const [reload_count, set_reload_count] = useState(0);

  const { is_visible, is_closing } = use_panel_transition(is_open, is_swapping);

  use_escape_layer(is_open, on_close, "quick_waitlist_panel", false);
  use_panel_inset(is_visible, panel_ref);

  useEffect(() => {
    if (!is_open) return;
    const request = ++request_ref.current;

    set_load({ kind: "loading" });
    set_has_action_failed(false);
    get_calendar_waitlist_status()
      .then((status) => {
        if (request === request_ref.current)
          set_load({ kind: "ready", status });
      })
      .catch(() => {
        if (request === request_ref.current) set_load({ kind: "failed" });
      });

    return () => {
      if (request === request_ref.current) request_ref.current += 1;
    };
  }, [is_open, reload_count]);

  const run_action = useCallback(
    async (action: () => Promise<CalendarWaitlistStatus>) => {
      if (busy_ref.current) return;
      busy_ref.current = true;
      const request = ++request_ref.current;

      set_is_busy(true);
      set_has_action_failed(false);
      try {
        const status = await action();

        if (request === request_ref.current)
          set_load({ kind: "ready", status });
      } catch {
        if (request === request_ref.current) set_has_action_failed(true);
      } finally {
        busy_ref.current = false;
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
  const retry = useCallback(() => {
    set_reload_count((count) => count + 1);
  }, []);

  const is_joined = load.kind === "ready" && load.status.joined;

  const features: WaitlistFeature[] = [
    {
      key: "encrypted",
      icon: LockClosedIcon,
      title: t("calendar.beta_waitlist_feature_encrypted"),
      body: t("calendar.beta_waitlist_feature_encrypted_body"),
    },
    {
      key: "devices",
      icon: DevicePhoneMobileIcon,
      title: t("calendar.beta_waitlist_feature_devices"),
      body: t("calendar.beta_waitlist_feature_devices_body"),
    },
    {
      key: "booking",
      icon: LinkIcon,
      title: t("calendar.beta_waitlist_feature_booking"),
      body: t("calendar.beta_waitlist_feature_booking_body"),
    },
  ];

  return (
    <aside
      ref={panel_ref}
      aria-label={t("calendar.beta_waitlist_title")}
      className={`quick_waitlist_panel absolute inset-0 flex-col overflow-hidden rounded-lg bg-surf-primary md:rounded-xl ${
        is_visible ? "flex" : "hidden"
      } ${is_closing ? "quick_panel_closing" : "z-10"}`}
    >
      <div className="flex h-12 flex-shrink-0 items-center gap-2 ps-4 pe-2">
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
        <div className="flex-1 overflow-y-auto px-5 pt-3 pb-6">
          <div className="mx-auto flex max-w-[320px] flex-col items-center text-center">
            <WaitlistBadge
              label={t("calendar.beta_waitlist_badge")}
              tip={t("calendar.beta_waitlist_privacy")}
            />
            <div className="relative mt-6">
              <span
                aria-hidden="true"
                className="app_rail_icon app_rail_icon_hero"
                style={HERO_ICON_STYLE}
              />
              {is_joined && (
                <span
                  aria-hidden="true"
                  className="absolute -end-1.5 -bottom-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-[var(--accent-color)] text-white ring-[3px] ring-[var(--bg-primary)]"
                >
                  <CheckIcon className="h-3.5 w-3.5" strokeWidth={2.5} />
                </span>
              )}
            </div>
            <p className="mt-2 text-[11px] text-txt-muted">
              {t("calendar.beta_waitlist_icon_note")}
            </p>
            <h3 className="mt-4 text-[17px] leading-6 font-semibold text-txt-primary">
              {is_joined
                ? t("calendar.beta_waitlist_joined")
                : t("calendar.beta_waitlist_heading")}
            </h3>
            <p className="mt-1.5 text-[13px] leading-[1.45] text-txt-secondary">
              {is_joined
                ? t("calendar.beta_waitlist_joined_body")
                : t("calendar.beta_waitlist_body")}
            </p>
            {(load.kind === "failed" || has_action_failed) && (
              <p className="mt-3 text-[12.5px] text-red-500" role="alert">
                {t("calendar.beta_waitlist_failed")}
              </p>
            )}
            <div className="mt-5 w-full">
              {load.kind === "failed" ? (
                <Button
                  className="w-full"
                  size="md"
                  variant="outline"
                  onClick={retry}
                >
                  {t("calendar.beta_waitlist_retry")}
                </Button>
              ) : is_joined ? (
                <Button
                  className="w-full"
                  disabled={is_busy}
                  size="md"
                  variant="outline"
                  onClick={leave}
                >
                  {t("calendar.beta_waitlist_leave")}
                </Button>
              ) : (
                <Button
                  className="w-full"
                  disabled={is_busy}
                  size="md"
                  variant="depth"
                  onClick={join}
                >
                  {t("calendar.beta_waitlist_apply")}
                </Button>
              )}
            </div>
          </div>
          <ul className="mx-auto mt-6 flex max-w-[320px] flex-col gap-0.5 rounded-[14px] bg-[color-mix(in_srgb,var(--text-primary)_4%,transparent)] p-1.5">
            {features.map((feature) => (
              <li
                key={feature.key}
                className="flex items-start gap-3 px-2 py-2"
              >
                <span
                  aria-hidden="true"
                  className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full ${ACCENT_SOFT}`}
                >
                  <feature.icon className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] leading-5 font-medium text-txt-primary">
                    {feature.title}
                  </span>
                  <span className="block text-[12px] leading-[1.4] text-txt-muted">
                    {feature.body}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </aside>
  );
}
