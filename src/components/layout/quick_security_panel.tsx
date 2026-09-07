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
import type { ComponentType } from "react";
import type { SecurityCriterion } from "@/lib/security_criteria";

import { useCallback, useMemo, useRef, useSyncExternalStore } from "react";
import {
  ArrowPathIcon,
  AtSymbolIcon,
  ChevronRightIcon,
  ComputerDesktopIcon,
  DevicePhoneMobileIcon,
  ExclamationTriangleIcon,
  FingerPrintIcon,
  ShieldExclamationIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { Button, Spinner, Tooltip } from "@aster/ui";

import { security_status_from_percent } from "@/components/settings/security/security_lock_icon";
import {
  build_security_criteria,
  security_percent,
} from "@/lib/security_criteria";
import { AsterSecurityMark } from "@/components/icons/aster_security_mark";
import {
  format_key_fingerprint,
  use_security_overview,
} from "@/hooks/use_security_overview";
import {
  get_cached_aliases,
  subscribe_aliases,
} from "@/hooks/use_sidebar_aliases";
import { use_i18n } from "@/lib/i18n/context";
import { use_preferences } from "@/contexts/preferences_context";
import { use_escape_layer } from "@/lib/overlay_layer_stack";
import { use_panel_inset } from "@/hooks/use_panel_inset";

interface QuickSecurityPanelProps {
  is_open: boolean;
  is_top_inset: boolean;
  on_close: () => void;
}

type PanelIcon = ComponentType<{ className?: string }>;

interface SecurityStat {
  id: string;
  label: string;
  value: string;
  icon: PanelIcon;
  section: string;
  anchor?: string;
}

const ALIAS_PREVIEW_LIMIT = 4;
const ROW_CLASS =
  "group flex w-full items-center gap-2.5 rounded-lg px-2 py-[9px] text-start hover:bg-surf-secondary";
const ROW_LABEL_CLASS =
  "min-w-0 flex-1 truncate text-[13.5px] leading-5 text-txt-primary";
const ROW_VALUE_CLASS =
  "flex-shrink-0 text-[12.5px] text-txt-secondary tabular-nums";
const CHEVRON_CLASS =
  "h-4 w-4 flex-shrink-0 text-[var(--icon-muted)] rtl:rotate-180";
const QUIET_CHEVRON_CLASS = `${CHEVRON_CLASS} opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100`;
const TRACK_COLOR = "color-mix(in srgb, var(--text-muted) 26%, transparent)";
const ICON_CLASS = "h-[18px] w-[18px] flex-shrink-0 text-[var(--icon-muted)]";

function navigate_to_settings(section: string, anchor?: string) {
  window.dispatchEvent(
    new CustomEvent("navigate-settings", {
      detail: anchor ? { section, anchor } : section,
    }),
  );
}

function SecurityScoreMeter({
  met,
  percent,
  total,
}: {
  met: number;
  percent: number;
  total: number;
}) {
  return (
    <div
      aria-valuemax={100}
      aria-valuemin={0}
      aria-valuenow={percent}
      className="mt-2.5 flex w-full gap-1"
      role="progressbar"
    >
      {Array.from({ length: total }, (_, index) => (
        <span
          key={index}
          className="h-1.5 flex-1 rounded-full transition-colors duration-500"
          style={{
            backgroundColor: index < met ? "var(--accent-color)" : TRACK_COLOR,
          }}
        />
      ))}
    </div>
  );
}

function PanelHeading({ label }: { label: string }) {
  return (
    <h3 className="mt-4 mb-1 px-2 text-[11px] font-medium tracking-wide text-txt-muted uppercase">
      {label}
    </h3>
  );
}

export function QuickSecurityPanel({
  is_open,
  is_top_inset,
  on_close,
}: QuickSecurityPanelProps) {
  const { t } = use_i18n();
  const { preferences } = use_preferences();
  const overview = use_security_overview(is_open);
  const panel_ref = useRef<HTMLElement | null>(null);
  const cached_aliases = useSyncExternalStore(
    subscribe_aliases,
    get_cached_aliases,
  );

  const go_to_settings = useCallback(
    (section: string, anchor?: string) => {
      navigate_to_settings(section, anchor);
      on_close();
    },
    [on_close],
  );
  const go_to_criterion = useCallback(
    (criterion: SecurityCriterion) =>
      go_to_settings(criterion.section, criterion.anchor),
    [go_to_settings],
  );

  use_escape_layer(is_open, on_close, "quick_security_panel", false);
  use_panel_inset(is_open, panel_ref);

  const criteria = useMemo(
    () =>
      build_security_criteria({
        totp_enabled: overview.totp_enabled,
        passkey_registered: overview.passkey_registered,
        recovery_email_verified: overview.recovery_email_verified,
        login_alerts_enabled: overview.login_alerts_enabled,
        block_tracking_pixels: preferences.block_tracking_pixels,
        block_remote_images: preferences.block_remote_images,
        strip_exif_on_compose: preferences.strip_exif_on_compose,
      }),
    [
      overview.totp_enabled,
      overview.passkey_registered,
      overview.recovery_email_verified,
      overview.login_alerts_enabled,
      preferences.block_tracking_pixels,
      preferences.block_remote_images,
      preferences.strip_exif_on_compose,
    ],
  );

  const alias_preview = useMemo(
    () =>
      [...cached_aliases]
        .sort((a, b) => {
          if (a.is_enabled !== b.is_enabled) return a.is_enabled ? -1 : 1;

          return a.full_address.localeCompare(b.full_address);
        })
        .slice(0, ALIAS_PREVIEW_LIMIT),
    [cached_aliases],
  );
  const alias_overflow = cached_aliases.length - alias_preview.length;

  const percent = security_percent(criteria);
  const status = security_status_from_percent(percent);
  const pending = criteria.filter((item) => !item.met);
  const done = criteria.filter((item) => item.met);
  const state_label = (value: boolean) =>
    value ? t("common.enabled") : t("common.disabled");
  const criterion_state = (item: SecurityCriterion) =>
    item.id === "recovery_email"
      ? item.met
        ? t("common.verified")
        : t("common.not_verified")
      : state_label(item.met);

  const alias_value = overview.alias_max
    ? `${overview.alias_count}/${overview.alias_max}`
    : String(overview.alias_count);

  const stats: SecurityStat[] = [
    {
      id: "sessions",
      label: t("settings_search.sessions"),
      value: String(overview.session_count),
      icon: ComputerDesktopIcon,
      section: "security",
      anchor: "sec-sessions",
    },
    {
      id: "trusted_devices",
      label: t("settings.trusted_devices"),
      value: String(overview.trusted_device_count),
      icon: DevicePhoneMobileIcon,
      section:
        overview.trusted_device_count > 0 ? "trusted_devices" : "security",
      anchor: overview.trusted_device_count > 0 ? undefined : "sec-devices",
    },
    {
      id: "aliases",
      label: t("common.aliases"),
      value: alias_value,
      icon: AtSymbolIcon,
      section: "aliases",
    },
    {
      id: "lockdown",
      label: t("settings.lockdown_title"),
      value: state_label(overview.lockdown_enabled),
      icon: ShieldExclamationIcon,
      section: "security",
      anchor: "sec-vanguard",
    },
  ].filter((stat) => stat.id !== "aliases" || alias_preview.length === 0);

  const open_security = useCallback(() => {
    go_to_settings("security");
  }, [go_to_settings]);

  return (
    <aside
      ref={panel_ref}
      aria-label={t("common.security_center")}
      className={`quick_security_panel me-1 mb-1 w-[min(320px,78vw)] flex-shrink-0 flex-col overflow-hidden rounded-lg bg-surf-primary md:me-2 md:mb-2 md:w-[clamp(272px,23vw,320px)] md:rounded-xl ${
        is_open ? "flex" : "hidden"
      } ${is_top_inset ? "mt-1 md:mt-2" : ""}`}
    >
      <div className="flex h-12 flex-shrink-0 items-center gap-2 ps-3 pe-2">
        <AsterSecurityMark className="h-[18px] w-[18px] flex-shrink-0 text-brand-primary" />
        <h2 className="flex-1 truncate text-[15px] font-medium text-txt-primary">
          {t("common.security_center")}
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
      {!overview.is_loaded ? (
        <div className="flex flex-1 items-center justify-center">
          <Spinner size="md" />
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-3 pb-1">
          {overview.has_failed && (
            <button
              className="mb-2 flex w-full items-center gap-2 rounded-lg bg-surf-secondary px-3 py-2 text-start text-[12.5px] text-txt-secondary hover:bg-surf-tertiary"
              type="button"
              onClick={overview.reload}
            >
              <ExclamationTriangleIcon className="h-4 w-4 flex-shrink-0 text-amber-500" />
              <span className="min-w-0 flex-1">
                {t("settings.failed_load_security_status")}
              </span>
              <ArrowPathIcon className="h-4 w-4 flex-shrink-0" />
            </button>
          )}
          <div className="px-2 pt-1">
            <p className="text-[11px] font-medium tracking-wide text-txt-muted uppercase">
              {t("settings.security_center_protection_score")}
            </p>
            <div className="mt-1 flex items-baseline gap-2">
              <p className="text-[28px] leading-8 font-semibold text-txt-primary tabular-nums">
                {percent}%
              </p>
              <p className="min-w-0 flex-1 truncate text-[13px] text-txt-secondary">
                {t(`settings.account_protection_${status}`)}
              </p>
              <p className="flex-shrink-0 text-[12px] text-txt-muted tabular-nums">
                {done.length}/{criteria.length}
              </p>
            </div>
            <SecurityScoreMeter
              met={done.length}
              percent={percent}
              total={criteria.length}
            />
            <p className="mt-2.5 text-[12.5px] leading-snug text-txt-secondary">
              {t(`settings.account_protection_hint_${status}`)}
            </p>
          </div>
          {pending.length > 0 ? (
            <>
              <PanelHeading label={t("settings.security_center_recommended")} />
              <ul>
                {pending.map((item) => (
                  <li key={item.id}>
                    <button
                      className={ROW_CLASS}
                      type="button"
                      onClick={() => go_to_criterion(item)}
                    >
                      <span className={ROW_LABEL_CLASS}>
                        {t(item.label_key)}
                      </span>
                      <span className={ROW_VALUE_CLASS}>
                        {criterion_state(item)}
                      </span>
                      <ChevronRightIcon className={CHEVRON_CLASS} />
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <div className="mt-3 px-2">
              <p className="text-[13.5px] leading-5 text-txt-secondary">
                {t("settings.security_center_all_clear")}
              </p>
            </div>
          )}
          <div className="my-2 h-px bg-edge-secondary" />
          {stats.map((stat) => (
            <button
              key={stat.id}
              className={ROW_CLASS}
              type="button"
              onClick={() => go_to_settings(stat.section, stat.anchor)}
            >
              <stat.icon className={ICON_CLASS} />
              <span className={ROW_LABEL_CLASS}>{stat.label}</span>
              <span className={ROW_VALUE_CLASS}>{stat.value}</span>
              <ChevronRightIcon className={CHEVRON_CLASS} />
            </button>
          ))}
          <button
            className={ROW_CLASS}
            type="button"
            onClick={() => go_to_settings("security", "sec-vanguard")}
          >
            <AsterSecurityMark className={ICON_CLASS} />
            <span className={ROW_LABEL_CLASS}>
              {t("settings.vanguard_title")}
            </span>
            <span className={ROW_VALUE_CLASS}>
              {state_label(overview.vanguard_enabled)}
            </span>
            <ChevronRightIcon className={CHEVRON_CLASS} />
          </button>
          <button
            className={ROW_CLASS}
            type="button"
            onClick={() => go_to_settings("encryption")}
          >
            <FingerPrintIcon className={ICON_CLASS} />
            <span className={ROW_LABEL_CLASS}>
              {t("settings.security_center_encryption_title")}
            </span>
            {overview.key_fingerprint && (
              <span className="flex-shrink-0 font-mono text-[11.5px] tracking-wide text-txt-secondary">
                {format_key_fingerprint(overview.key_fingerprint)}
              </span>
            )}
            <ChevronRightIcon className={CHEVRON_CLASS} />
          </button>
          {alias_preview.length > 0 && (
            <button
              className="w-full rounded-lg px-2 py-2 text-start hover:bg-surf-secondary"
              type="button"
              onClick={() => go_to_settings("aliases")}
            >
              <div className="flex items-center gap-2.5">
                <AtSymbolIcon className={ICON_CLASS} />
                <span className={ROW_LABEL_CLASS}>{t("common.aliases")}</span>
                <span className={ROW_VALUE_CLASS}>
                  {alias_overflow > 0
                    ? t("common.n_more", { count: alias_overflow })
                    : alias_value}
                </span>
                <ChevronRightIcon className={CHEVRON_CLASS} />
              </div>
              <ul
                className="mt-1.5 ms-[28px] space-y-1 border-s ps-2.5"
                style={{ borderColor: TRACK_COLOR }}
              >
                {alias_preview.map((alias) => (
                  <li
                    key={alias.id}
                    className={`truncate text-[12.5px] leading-4 ${
                      alias.is_enabled ? "text-txt-secondary" : "text-txt-muted"
                    }`}
                  >
                    {alias.full_address.split("@")[0]}
                    <span className="text-txt-muted">
                      @{alias.full_address.split("@").slice(1).join("@")}
                    </span>
                  </li>
                ))}
              </ul>
            </button>
          )}
          {done.length > 0 && (
            <>
              <PanelHeading label={t("settings.security_center_protected")} />
              <ul>
                {done.map((item) => (
                  <li key={item.id}>
                    <button
                      className={ROW_CLASS}
                      type="button"
                      onClick={() => go_to_criterion(item)}
                    >
                      <span className={`${ROW_LABEL_CLASS} text-txt-secondary`}>
                        {t(item.label_key)}
                      </span>
                      <span className={`${ROW_VALUE_CLASS} text-txt-muted`}>
                        {criterion_state(item)}
                      </span>
                      <ChevronRightIcon className={QUIET_CHEVRON_CLASS} />
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
      {overview.is_loaded && (
        <div className="flex-shrink-0 px-3 pt-2 pb-3">
          <Button
            className="w-full"
            size="sm"
            variant="secondary"
            onClick={open_security}
          >
            {t("settings.account_security_review_cta")}
          </Button>
        </div>
      )}
    </aside>
  );
}
