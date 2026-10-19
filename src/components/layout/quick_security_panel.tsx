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
import type {
  SecurityCriterion,
  SecurityCriterionId,
} from "@/lib/security_criteria";
import type { SettingsTarget } from "@/lib/settings_links";

import { useCallback, useMemo, useRef, useSyncExternalStore } from "react";
import {
  ArrowPathIcon,
  AtSymbolIcon,
  BellAlertIcon,
  ChevronRightIcon,
  ClipboardDocumentCheckIcon,
  ComputerDesktopIcon,
  DevicePhoneMobileIcon,
  DocumentMinusIcon,
  EnvelopeIcon,
  ExclamationTriangleIcon,
  EyeSlashIcon,
  FingerPrintIcon,
  KeyIcon,
  PhotoIcon,
  ShieldCheckIcon,
  ShieldExclamationIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { CheckCircleIcon } from "@heroicons/react/24/solid";
import { Badge, Button, Spinner, Tooltip } from "@aster/ui";

import {
  SECURITY_LOCK_COLOR,
  security_status_from_percent,
} from "@/components/settings/security/security_lock_icon";
import {
  build_security_criteria,
  security_percent,
} from "@/lib/security_criteria";
import { AsterSecurityMark } from "@/components/icons/aster_security_mark";
import {
  format_key_fingerprint,
  use_security_overview,
} from "@/hooks/use_security_overview";
import { use_recovery_status } from "@/hooks/use_recovery_status";
import {
  get_cached_aliases,
  subscribe_aliases,
} from "@/hooks/use_sidebar_aliases";
import { use_i18n } from "@/lib/i18n/context";
import { use_preferences } from "@/contexts/preferences_context";
import { use_escape_layer } from "@/lib/overlay_layer_stack";
import {
  open_settings_target,
  SECURITY_CENTER_TARGETS,
} from "@/lib/settings_links";
import { use_panel_inset } from "@/hooks/use_panel_inset";
import { use_panel_transition } from "@/components/layout/use_panel_transition";

interface QuickSecurityPanelProps {
  is_open: boolean;
  is_swapping: boolean;
  on_close: () => void;
}

type PanelIcon = ComponentType<{ className?: string }>;

const ALIAS_PREVIEW_LIMIT = 4;
const ROW_CLASS =
  "quick_settings_row flex w-full items-center gap-3 rounded-[10px] px-2 py-2.5 text-start";
const ROW_TITLE_CLASS =
  "block truncate text-[13px] leading-5 font-medium text-txt-primary";
const ROW_VALUE_CLASS =
  "flex-shrink-0 text-[13px] text-txt-secondary tabular-nums";
const CHEVRON_CLASS =
  "h-4 w-4 flex-shrink-0 text-[var(--icon-muted)] rtl:rotate-180";
const DONE_ICON_CLASS =
  "h-[18px] w-[18px] flex-shrink-0 text-[var(--icon-secondary)]";
const TRACK_COLOR = "color-mix(in srgb, var(--text-muted) 26%, transparent)";
const RING_SIZE = 64;
const RING_STROKE = 5;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

const CRITERION_ICONS: Record<SecurityCriterionId, PanelIcon> = {
  two_factor: ShieldCheckIcon,
  passkey: KeyIcon,
  recovery_codes: ClipboardDocumentCheckIcon,
  recovery_email: EnvelopeIcon,
  login_alerts: BellAlertIcon,
  tracking_pixels: EyeSlashIcon,
  remote_images: PhotoIcon,
  strip_exif: DocumentMinusIcon,
};

function SecurityScoreRing({
  color,
  label,
  percent,
}: {
  color: string;
  label: string;
  percent: number;
}) {
  const offset = RING_CIRCUMFERENCE * (1 - percent / 100);

  return (
    <div
      aria-label={label}
      aria-valuemax={100}
      aria-valuemin={0}
      aria-valuenow={percent}
      className="relative flex-shrink-0"
      role="progressbar"
      style={{ width: RING_SIZE, height: RING_SIZE }}
    >
      <svg
        aria-hidden="true"
        className="-rotate-90"
        height={RING_SIZE}
        viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
        width={RING_SIZE}
      >
        <circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          fill="none"
          r={RING_RADIUS}
          stroke={TRACK_COLOR}
          strokeWidth={RING_STROKE}
        />
        <circle
          className="transition-[stroke-dashoffset,stroke,opacity] duration-700 ease-out motion-reduce:transition-none"
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          fill="none"
          r={RING_RADIUS}
          stroke={color}
          strokeDasharray={RING_CIRCUMFERENCE}
          strokeDashoffset={offset}
          strokeLinecap="round"
          strokeWidth={RING_STROKE}
          style={{ opacity: percent > 0 ? 1 : 0 }}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[15px] font-semibold text-txt-primary tabular-nums">
        {percent}%
      </span>
    </div>
  );
}

function UsageBar({ count, max }: { count: number; max: number }) {
  const ratio = Math.min(1, max > 0 ? count / max : 0);

  return (
    <div
      aria-hidden="true"
      className="h-1 w-full overflow-hidden rounded-full"
      style={{ backgroundColor: TRACK_COLOR }}
    >
      <div
        className="h-full rounded-full bg-[var(--accent-color)] transition-[width] duration-500 motion-reduce:transition-none"
        style={{ width: `${Math.round(ratio * 100)}%` }}
      />
    </div>
  );
}

function SectionHeading({ label }: { label: string }) {
  return (
    <h3 className="mt-5 mb-1 truncate px-2 text-[13px] leading-5 font-semibold text-txt-primary">
      {label}
    </h3>
  );
}

export function QuickSecurityPanel({
  is_open,
  is_swapping,
  on_close,
}: QuickSecurityPanelProps) {
  const { t } = use_i18n();
  const { preferences } = use_preferences();
  const overview = use_security_overview(is_open);
  const recovery = use_recovery_status(is_open);
  const panel_ref = useRef<HTMLElement | null>(null);
  const cached_aliases = useSyncExternalStore(
    subscribe_aliases,
    get_cached_aliases,
  );

  const go_to_settings = useCallback(
    (target: SettingsTarget) => {
      open_settings_target(target);
      on_close();
    },
    [on_close],
  );
  const go_to_criterion = useCallback(
    (criterion: SecurityCriterion) => go_to_settings(criterion.target),
    [go_to_settings],
  );

  const { is_visible, is_closing } = use_panel_transition(is_open, is_swapping);

  use_escape_layer(is_open, on_close, "quick_security_panel", false);
  use_panel_inset(is_visible, panel_ref);

  const criteria = useMemo(
    () =>
      build_security_criteria({
        totp_enabled: overview.totp_enabled,
        passkey_registered: overview.passkey_registered,
        recovery_codes_saved: recovery.has_codes,
        recovery_email_verified: overview.recovery_email_verified,
        login_alerts_enabled: overview.login_alerts_enabled,
        block_tracking_pixels: preferences.block_tracking_pixels,
        block_remote_images: preferences.block_remote_images,
        strip_exif_on_compose: preferences.strip_exif_on_compose,
      }),
    [
      overview.totp_enabled,
      overview.passkey_registered,
      recovery.has_codes,
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
  const status_color = SECURITY_LOCK_COLOR[status];
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

  const open_security = useCallback(() => {
    go_to_settings(SECURITY_CENTER_TARGETS.overview);
  }, [go_to_settings]);

  return (
    <aside
      ref={panel_ref}
      aria-label={t("common.security_center")}
      className={`quick_security_panel absolute inset-0 flex-col overflow-hidden rounded-lg bg-surf-primary md:rounded-xl ${
        is_visible ? "flex" : "hidden"
      } ${is_closing ? "quick_panel_closing" : "z-10"}`}
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
        <div className="aster_scrollbar_thin flex-1 overflow-y-auto overscroll-contain px-3 pb-1">
          {overview.has_failed && (
            <button
              className="quick_settings_row mb-2 flex w-full items-center gap-2 rounded-[10px] px-2 py-2 text-start text-[12.5px] text-txt-secondary"
              type="button"
              onClick={overview.reload}
            >
              <ExclamationTriangleIcon className="h-4 w-4 flex-shrink-0 text-[var(--color-warning)]" />
              <span className="min-w-0 flex-1">
                {t("settings.failed_load_security_status")}
              </span>
              <ArrowPathIcon className="h-4 w-4 flex-shrink-0" />
            </button>
          )}
          <div className="px-2 pt-2">
            <div className="flex items-center gap-4">
              <SecurityScoreRing
                color={status_color}
                label={t("settings.security_center_protection_score")}
                percent={percent}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12px] leading-4 text-txt-muted">
                  {t("settings.security_center_protection_score")}
                </p>
                <p className="truncate text-[17px] leading-6 font-semibold text-txt-primary">
                  {t(`settings.account_protection_${status}`)}
                </p>
                <p className="text-[12.5px] leading-4 text-txt-secondary tabular-nums">
                  {t("settings.security_center_met_of_total", {
                    met: done.length,
                    total: criteria.length,
                  })}
                </p>
              </div>
            </div>
          </div>
          {pending.length > 0 ? (
            <>
              <SectionHeading
                label={t("settings.security_center_recommended")}
              />
              <ul>
                {pending.map((item) => {
                  const Icon = CRITERION_ICONS[item.id];

                  return (
                    <li key={item.id}>
                      <button
                        className={ROW_CLASS}
                        type="button"
                        onClick={() => go_to_criterion(item)}
                      >
                        <Icon
                          aria-hidden="true"
                          className="h-5 w-5 flex-shrink-0 text-[var(--accent-color)]"
                        />
                        <span className="min-w-0 flex-1">
                          <span
                            className={ROW_TITLE_CLASS}
                            title={t(item.label_key)}
                          >
                            {t(item.label_key)}
                          </span>
                        </span>
                        <span className="sr-only">{criterion_state(item)}</span>
                        <ChevronRightIcon className={CHEVRON_CLASS} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : (
            <div className="mt-5 flex items-center gap-3 px-2">
              <CheckCircleIcon
                aria-hidden="true"
                className="h-5 w-5 flex-shrink-0 text-[var(--color-success)]"
              />
              <p className="text-[13px] leading-5 text-txt-primary">
                {t("settings.security_center_all_clear")}
              </p>
            </div>
          )}
          <SectionHeading label={t("settings.security_center_account")} />
          <button
            className={ROW_CLASS}
            type="button"
            onClick={() => go_to_settings(SECURITY_CENTER_TARGETS.sessions)}
          >
            <ComputerDesktopIcon
              aria-hidden="true"
              className={DONE_ICON_CLASS}
            />
            <span className="min-w-0 flex-1">
              <span
                className={ROW_TITLE_CLASS}
                title={t("settings_search.active_sessions")}
              >
                {t("settings_search.active_sessions")}
              </span>
            </span>
            <span className={ROW_VALUE_CLASS}>{overview.session_count}</span>
            <ChevronRightIcon className={CHEVRON_CLASS} />
          </button>
          <button
            className={ROW_CLASS}
            type="button"
            onClick={() =>
              go_to_settings(SECURITY_CENTER_TARGETS.trusted_devices)
            }
          >
            <DevicePhoneMobileIcon
              aria-hidden="true"
              className={DONE_ICON_CLASS}
            />
            <span className="min-w-0 flex-1">
              <span
                className={ROW_TITLE_CLASS}
                title={t("settings.trusted_devices")}
              >
                {t("settings.trusted_devices")}
              </span>
            </span>
            <span className={ROW_VALUE_CLASS}>
              {overview.trusted_device_count}
            </span>
            <ChevronRightIcon className={CHEVRON_CLASS} />
          </button>
          <button
            className={ROW_CLASS}
            type="button"
            onClick={() => go_to_settings(SECURITY_CENTER_TARGETS.aliases)}
          >
            <AtSymbolIcon aria-hidden="true" className={DONE_ICON_CLASS} />
            <span className="min-w-0 flex-1">
              <span className={ROW_TITLE_CLASS} title={t("common.aliases")}>
                {t("common.aliases")}
              </span>
            </span>
            <span className={ROW_VALUE_CLASS}>{alias_value}</span>
            <ChevronRightIcon className={CHEVRON_CLASS} />
          </button>
          {(overview.alias_max > 0 || alias_preview.length > 0) && (
            <div className="-mt-1 mb-1 ps-[38px] pe-9">
              {overview.alias_max > 0 && (
                <UsageBar
                  count={overview.alias_count}
                  max={overview.alias_max}
                />
              )}
              {alias_preview.length > 0 && (
                <ul className={overview.alias_max > 0 ? "mt-2" : ""}>
                  {alias_preview.map((alias) => (
                    <li
                      key={alias.id}
                      className={`truncate text-[12px] leading-[18px] ${
                        alias.is_enabled
                          ? "text-txt-secondary"
                          : "text-txt-muted"
                      }`}
                    >
                      {alias.full_address}
                    </li>
                  ))}
                </ul>
              )}
              {alias_overflow > 0 && (
                <p className="text-[12px] leading-[18px] text-txt-muted">
                  {t("common.n_more", { count: alias_overflow })}
                </p>
              )}
            </div>
          )}
          <button
            className={ROW_CLASS}
            type="button"
            onClick={() => go_to_settings(SECURITY_CENTER_TARGETS.lockdown)}
          >
            <ShieldExclamationIcon
              aria-hidden="true"
              className={DONE_ICON_CLASS}
            />
            <span className="min-w-0 flex-1">
              <span
                className={ROW_TITLE_CLASS}
                title={t("settings.lockdown_title")}
              >
                {t("settings.lockdown_title")}
              </span>
            </span>
            <Badge color={overview.lockdown_enabled ? "green" : "gray"}>
              {state_label(overview.lockdown_enabled)}
            </Badge>
          </button>
          <button
            className={ROW_CLASS}
            type="button"
            onClick={() => go_to_settings(SECURITY_CENTER_TARGETS.vanguard)}
          >
            <AsterSecurityMark aria-hidden="true" className={DONE_ICON_CLASS} />
            <span className="min-w-0 flex-1">
              <span
                className={ROW_TITLE_CLASS}
                title={t("settings.vanguard_title")}
              >
                {t("settings.vanguard_title")}
              </span>
            </span>
            <Badge color={overview.vanguard_enabled ? "green" : "gray"}>
              {state_label(overview.vanguard_enabled)}
            </Badge>
          </button>
          <SectionHeading
            label={t("settings.security_center_encryption_title")}
          />
          {overview.key_fingerprint && (
            <button
              className={ROW_CLASS}
              type="button"
              onClick={() => go_to_settings(SECURITY_CENTER_TARGETS.encryption)}
            >
              <FingerPrintIcon aria-hidden="true" className={DONE_ICON_CLASS} />
              <span className="min-w-0 flex-1">
                <span
                  className={ROW_TITLE_CLASS}
                  title={t("settings.security_center_identity_key")}
                >
                  {t("settings.security_center_identity_key")}
                </span>
              </span>
              <span className="flex-shrink-0 font-mono text-[12px] tracking-wider text-txt-secondary">
                {format_key_fingerprint(overview.key_fingerprint)}
              </span>
              <ChevronRightIcon className={CHEVRON_CLASS} />
            </button>
          )}
          {done.length > 0 && (
            <>
              <SectionHeading label={t("settings.security_center_protected")} />
              <ul>
                {done.map((item) => {
                  const Icon = CRITERION_ICONS[item.id];

                  return (
                    <li key={item.id}>
                      <button
                        className={ROW_CLASS}
                        type="button"
                        onClick={() => go_to_criterion(item)}
                      >
                        <Icon aria-hidden="true" className={DONE_ICON_CLASS} />
                        <span className="min-w-0 flex-1">
                          <span
                            className={`${ROW_TITLE_CLASS} font-normal`}
                            title={t(item.label_key)}
                          >
                            {t(item.label_key)}
                          </span>
                        </span>
                        <span className="sr-only">{criterion_state(item)}</span>
                        <CheckCircleIcon
                          aria-hidden="true"
                          className="h-[18px] w-[18px] flex-shrink-0 text-[var(--color-success)]"
                        />
                      </button>
                    </li>
                  );
                })}
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
