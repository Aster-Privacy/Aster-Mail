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
  ArrowDownTrayIcon,
  ArrowPathIcon,
  BellIcon,
  ClockIcon,
  DevicePhoneMobileIcon,
  EnvelopeIcon,
  LinkIcon,
  LockClosedIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { CheckIcon } from "@heroicons/react/24/solid";
import { Badge, Button, Spinner, Tooltip } from "@aster/ui";

import {
  get_calendar_waitlist_status,
  join_calendar_waitlist,
  leave_calendar_waitlist,
} from "@/services/api/calendar_waitlist";
import { use_i18n } from "@/lib/i18n/context";
import { use_escape_layer } from "@/lib/overlay_layer_stack";
import { use_panel_inset } from "@/hooks/use_panel_inset";
import { use_panel_transition } from "@/components/layout/use_panel_transition";
import { EncryptionInfoDropdown } from "@/components/common/encryption_info_dropdown";
import { InfoPopover } from "@/components/ui/info_popover";

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
  const [celebration, set_celebration] = useState(0);

  const { is_visible, is_closing } = use_panel_transition(is_open, is_swapping);

  use_escape_layer(is_open, on_close, "quick_waitlist_panel", false);
  use_panel_inset(is_visible, panel_ref);

  useEffect(() => {
    if (!is_open) return;
    const request = ++request_ref.current;

    set_load({ kind: "loading" });
    set_has_action_failed(false);
    set_celebration(0);
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

        if (request === request_ref.current) {
          set_load({ kind: "ready", status });
          set_celebration((count) => (status.joined ? count + 1 : 0));
        }
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
    {
      key: "invites",
      icon: EnvelopeIcon,
      title: t("calendar.beta_waitlist_feature_invites"),
      body: t("calendar.beta_waitlist_feature_invites_body"),
    },
    {
      key: "reminders",
      icon: BellIcon,
      title: t("calendar.beta_waitlist_feature_reminders"),
      body: t("calendar.beta_waitlist_feature_reminders_body"),
    },
    {
      key: "recurring",
      icon: ArrowPathIcon,
      title: t("calendar.beta_waitlist_feature_recurring"),
      body: t("calendar.beta_waitlist_feature_recurring_body"),
    },
    {
      key: "import",
      icon: ArrowDownTrayIcon,
      title: t("calendar.beta_waitlist_feature_import"),
      body: t("calendar.beta_waitlist_feature_import_body"),
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
      <div className="flex h-12 flex-shrink-0 items-center gap-1 ps-4 pe-2">
        <span className="flex min-w-0 flex-1 items-center gap-1.5">
          <h2 className="truncate text-[15px] font-medium text-txt-primary">
            {t("calendar.beta_waitlist_title")}
          </h2>
          <Badge className="flex-shrink-0" color="blue">
            {t("calendar.beta_waitlist_tag")}
          </Badge>
          <InfoPopover
            description={t("calendar.beta_waitlist_info_body")}
            title={t("calendar.beta_waitlist_info_title")}
          />
        </span>
        <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center">
          <EncryptionInfoDropdown
            e2e_verified
            description_key="calendar.beta_waitlist_privacy"
            has_pq_protection={false}
            is_external={false}
            size={15}
          />
        </span>
        <Tooltip position="bottom" tip={t("common.close")}>
          <Button
            aria-label={t("common.close")}
            className="h-8 w-8 flex-shrink-0 text-txt-secondary"
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
        <div className="flex-1 overflow-y-auto px-5 pt-6 pb-6">
          <div className="mx-auto flex max-w-[320px] flex-col items-center text-center">
            <span aria-hidden="true" className="waitlist_hero">
              <span
                key={celebration}
                className={`waitlist_hero_card${
                  is_joined ? " waitlist_hero_card_joined" : ""
                }${is_joined && celebration > 0 ? " waitlist_hero_card_flip" : ""}`}
                data-testid="waitlist_hero"
              >
                <span
                  className="waitlist_hero_face app_rail_icon app_rail_icon_hero"
                  style={HERO_ICON_STYLE}
                />
                <span className="waitlist_hero_face waitlist_hero_face_back">
                  <CheckIcon className="h-7 w-7" />
                </span>
              </span>
            </span>
            <p
              className={`mt-2 text-[11px] text-txt-muted ${
                is_joined ? "invisible" : ""
              }`}
            >
              {t("calendar.beta_waitlist_icon_note")}
            </p>
            <h3 className="mt-5 text-[17px] leading-6 font-semibold text-txt-primary">
              {is_joined
                ? t("calendar.beta_waitlist_joined")
                : t("calendar.beta_waitlist_heading")}
            </h3>
            <p className="mt-1.5 text-[13px] leading-[1.45] text-txt-secondary">
              {is_joined
                ? t("calendar.beta_waitlist_joined_body")
                : t("calendar.beta_waitlist_body")}
            </p>
            <p className="mt-3 flex items-center gap-1.5 text-[12.5px] text-txt-muted">
              <ClockIcon aria-hidden="true" className="h-4 w-4 flex-shrink-0" />
              {t("calendar.beta_waitlist_start")}
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
          <section className="mx-auto mt-8 max-w-[320px]">
            <h4 className="aster_island_section_title px-3 pb-1">
              {t("calendar.beta_waitlist_features_title")}
            </h4>
            <ul className="flex flex-col">
              {features.map((feature) => (
                <li key={feature.key} className="aster_island_row items-start">
                  <span aria-hidden="true" className="aster_island_row_icon">
                    <feature.icon />
                  </span>
                  <span className="aster_island_row_text">
                    <span className="aster_island_row_label">
                      {feature.title}
                    </span>
                    <span className="aster_island_row_description">
                      {feature.body}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </aside>
  );
}
