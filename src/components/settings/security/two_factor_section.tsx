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
import type { LoginEventEntry } from "@/services/api/auth";
import type { IslandRowToggle } from "@aster/ui";

import { useId, useState } from "react";
import {
  KeyIcon,
  ArrowPathIcon,
  FingerPrintIcon,
  ShieldCheckIcon,
  ComputerDesktopIcon,
  LinkIcon,
} from "@heroicons/react/24/outline";
import { Button, IslandRow, IslandSection } from "@aster/ui";

import { use_i18n } from "@/lib/i18n/context";
import {
  SESSION_TIMEOUT_OPTIONS,
  KEY_ROTATION_OPTIONS,
  KEY_HISTORY_OPTIONS,
} from "@/components/settings/hooks/use_security";
import { InfoPopover } from "@/components/ui/info_popover";
import { label_toggle_children } from "@/lib/labeled_control";
import { TotpInlineSetup } from "@/components/settings/security/totp_inline_setup";
import { ActionRecommendedBadge } from "@/components/settings/security/recommendation_box";
import { LoadFailedNotice } from "@/components/settings/load_failed_notice";
import { format_relative_time_short } from "@/utils/date_utils";

interface SecuritySettingProps {
  title: React.ReactNode;
  description: string;
  action?: React.ReactNode;
  toggle?: IslandRowToggle;
  info?: { title: string; description: string };
}

function SecuritySetting({
  title,
  description,
  action,
  toggle,
  info,
}: SecuritySettingProps) {
  const label_id = useId();

  return (
    <IslandRow
      description={description}
      label={
        <span
          className="inline-flex flex-wrap items-center gap-1.5"
          id={label_id}
        >
          {title}
          {info && (
            <InfoPopover description={info.description} title={info.title} />
          )}
        </span>
      }
      layout={toggle ? "inline" : "stacked"}
      toggle={toggle}
      trailing={action ? label_toggle_children(action, label_id) : undefined}
    />
  );
}

interface OptionButtonProps {
  is_selected: boolean;
  label: string;
  on_click: () => void;
}

function OptionButton({ is_selected, label, on_click }: OptionButtonProps) {
  return (
    <button
      aria-pressed={is_selected}
      className="aster_segmented_option"
      type="button"
      onClick={on_click}
    >
      {label}
    </button>
  );
}

interface TwoStepVerificationGroupProps {
  totp_enabled: boolean;
  totp_status_failed?: boolean;
  on_totp_status_retry?: () => void;
  totp_backup_codes_remaining: number | undefined;
  on_two_factor_toggle: () => void;
  on_regenerate_backup_codes?: () => void;
  show_inline_setup: boolean;
  on_inline_setup_success: () => void;
}

export function TwoStepVerificationGroup({
  totp_enabled,
  totp_status_failed = false,
  on_totp_status_retry,
  totp_backup_codes_remaining,
  on_two_factor_toggle,
  on_regenerate_backup_codes,
  show_inline_setup,
  on_inline_setup_success,
}: TwoStepVerificationGroupProps) {
  const { t } = use_i18n();

  return (
    <>
      <IslandRow
        description={
          totp_status_failed
            ? undefined
            : totp_enabled
              ? t("settings.two_step_verification_enabled_description")
              : t("settings.two_step_verification_description")
        }
        label={
          <span className="inline-flex flex-wrap items-center gap-1.5">
            {t("settings.two_step_verification")}
            {!totp_enabled && !totp_status_failed && (
              <ActionRecommendedBadge
                tip={t("settings.two_step_verification_recommendation")}
              />
            )}
          </span>
        }
      />

      {totp_status_failed ? (
        <div className="px-4 pb-4">
          <LoadFailedNotice on_retry={() => on_totp_status_retry?.()} />
        </div>
      ) : totp_enabled ? (
        <IslandRow
          label={t("settings.authenticator_app")}
          toggle={{
            checked: totp_enabled,
            on_change: () => on_two_factor_toggle(),
            size: "lg",
            aria_label: t("settings.authenticator_app"),
          }}
        />
      ) : (
        <IslandRow
          label={t("settings.authenticator_app")}
          layout="stacked"
          trailing={
            <Button variant="outline" onClick={on_two_factor_toggle}>
              {show_inline_setup ? t("common.cancel") : t("settings.setup_2fa")}
            </Button>
          }
        />
      )}

      {show_inline_setup && !totp_status_failed && (
        <div className="px-4 pb-4">
          <TotpInlineSetup on_success={on_inline_setup_success} />
        </div>
      )}

      {totp_enabled && on_regenerate_backup_codes && (
        <SecuritySetting
          action={
            <Button variant="outline" onClick={on_regenerate_backup_codes}>
              {t("settings.regenerate_backup_codes")}
            </Button>
          }
          description={t("settings.regenerate_backup_codes_description", {
            count: totp_backup_codes_remaining ?? 0,
          })}
          title={t("settings.backup_codes")}
        />
      )}
    </>
  );
}

const SIGN_IN_PREVIEW_COUNT = 10;

interface LoginAlertsSessionsGroupProps {
  session_timeout_enabled: boolean;
  session_timeout_minutes: number;
  on_timeout_toggle: () => void;
  on_timeout_change: (minutes: number) => void;
  timeout_description: string;
  login_alerts_enabled: boolean;
  login_alerts_loaded: boolean;
  login_alerts_failed: boolean;
  on_login_alerts_toggle: () => void;
  on_reload_login_alerts: () => void;
  login_events: LoginEventEntry[];
  login_events_loading: boolean;
  login_events_failed: boolean;
  on_reload_login_events: () => void;
}

export function LoginAlertsSessionsGroup({
  session_timeout_enabled,
  session_timeout_minutes,
  on_timeout_toggle,
  on_timeout_change,
  timeout_description,
  login_alerts_enabled,
  login_alerts_loaded,
  login_alerts_failed,
  on_login_alerts_toggle,
  on_reload_login_alerts,
  login_events,
  login_events_loading,
  login_events_failed,
  on_reload_login_events,
}: LoginAlertsSessionsGroupProps) {
  const { t } = use_i18n();
  const [show_all_sign_ins, set_show_all_sign_ins] = useState(false);
  const visible_login_events = show_all_sign_ins
    ? login_events
    : login_events.slice(0, SIGN_IN_PREVIEW_COUNT);

  return (
    <>
      <IslandSection
        icon={<ShieldCheckIcon />}
        title={t("settings.login_alerts_sessions_title")}
      >
        <SecuritySetting
          description={timeout_description}
          title={t("settings.session_timeout")}
          toggle={{
            checked: session_timeout_enabled,
            on_change: () => on_timeout_toggle(),
            size: "lg",
          }}
        />
        {session_timeout_enabled && (
          <div className="px-4 pb-4">
            <p className="text-sm font-medium mb-3 text-txt-primary">
              {t("settings.timeout_duration")}
            </p>
            <div className="aster_segmented grid-flow-row grid-cols-2 sm:grid-cols-4">
              {SESSION_TIMEOUT_OPTIONS.map((option) => (
                <OptionButton
                  key={option.value}
                  is_selected={session_timeout_minutes === option.value}
                  label={t(option.label_key)}
                  on_click={() => on_timeout_change(option.value)}
                />
              ))}
            </div>
            <p className="text-xs mt-3 text-txt-muted">
              {t("settings.timeout_logout_description")}
            </p>
          </div>
        )}
        <SecuritySetting
          action={
            login_alerts_failed && !login_alerts_loaded ? (
              <button
                className="text-xs font-medium text-brand hover:underline"
                type="button"
                onClick={on_reload_login_alerts}
              >
                {t("common.retry")}
              </button>
            ) : undefined
          }
          description={
            login_alerts_failed && !login_alerts_loaded
              ? t("common.something_went_wrong_try_again")
              : t("settings.login_alerts_description")
          }
          title={
            <>
              {t("settings.login_alerts")}
              {login_alerts_loaded && !login_alerts_enabled && (
                <ActionRecommendedBadge
                  tip={t("settings.login_alerts_off_recommendation")}
                />
              )}
            </>
          }
          toggle={
            login_alerts_failed && !login_alerts_loaded
              ? undefined
              : {
                  checked: login_alerts_enabled,
                  on_change: () => on_login_alerts_toggle(),
                  disabled: !login_alerts_loaded,
                  size: "lg",
                }
          }
        />
      </IslandSection>

      <IslandSection
        bare={login_events_loading}
        footer={
          !login_events_loading &&
          login_events.length > SIGN_IN_PREVIEW_COUNT ? (
            <button
              className="text-xs font-medium text-brand hover:underline"
              type="button"
              onClick={() => set_show_all_sign_ins((prev) => !prev)}
            >
              {show_all_sign_ins
                ? t("common.show_less")
                : t("common.show_more")}
            </button>
          ) : undefined
        }
        icon={<ComputerDesktopIcon />}
        title={t("settings.recent_sign_ins")}
      >
        {login_events_loading ? (
          <p className="px-1 text-xs text-txt-muted">{t("common.loading")}</p>
        ) : login_events_failed && login_events.length === 0 ? (
          <div className="px-4 py-6 text-center">
            <p className="text-xs text-txt-muted">
              {t("common.something_went_wrong_try_again")}
            </p>
            <button
              className="mt-2 text-xs font-medium text-brand hover:underline"
              type="button"
              onClick={on_reload_login_events}
            >
              {t("common.retry")}
            </button>
          </div>
        ) : login_events.length === 0 ? (
          <div className="px-4 py-6 text-center">
            <ComputerDesktopIcon className="w-6 h-6 text-txt-muted mx-auto mb-2" />
            <p className="text-xs text-txt-muted">
              {t("settings.no_sign_in_history")}
            </p>
          </div>
        ) : (
          visible_login_events.map((event) => (
            <IslandRow
              key={event.id}
              description={event.location || undefined}
              label={
                <span className="block truncate">
                  {event.device_type} - {event.browser}
                </span>
              }
              trailing={
                <span className="aster_island_row_value shrink-0 max-w-none">
                  {format_relative_time_short(event.created_at, t)}
                </span>
              }
            />
          ))
        )}
      </IslandSection>
    </>
  );
}

interface ExternalLinkWarningsGroupProps {
  external_link_warning_dismissed: boolean;
  on_external_link_toggle: () => void;
}

export function ExternalLinkWarningsGroup({
  external_link_warning_dismissed,
  on_external_link_toggle,
}: ExternalLinkWarningsGroupProps) {
  const { t } = use_i18n();

  return (
    <IslandSection
      icon={<LinkIcon />}
      title={t("settings.external_link_warnings")}
    >
      <SecuritySetting
        description={
          external_link_warning_dismissed
            ? t("settings.external_link_warning_disabled")
            : t("settings.external_link_warning_enabled")
        }
        info={{
          title: t("settings.info_external_link_warnings_title"),
          description: t("settings.info_external_link_warnings_description"),
        }}
        title={t("settings.external_link_warnings")}
        toggle={{
          checked: !external_link_warning_dismissed,
          on_change: () => on_external_link_toggle(),
          size: "lg",
        }}
      />
    </IslandSection>
  );
}

interface ForwardSecrecyGroupProps {
  forward_secrecy_enabled: boolean;
  forward_secrecy_working?: boolean;
  on_forward_secrecy_toggle: () => void;
  key_rotation_hours: number;
  on_key_rotation_change: (hours: number) => void;
  key_history_limit: number;
  on_key_history_change: (limit: number) => void;
  key_age_hours: number | null;
  key_fingerprint: string | null;
  on_rotate_keys_now: () => void;
}

export function ForwardSecrecyGroup({
  forward_secrecy_enabled,
  forward_secrecy_working = false,
  on_forward_secrecy_toggle,
  key_rotation_hours,
  on_key_rotation_change,
  key_history_limit,
  on_key_history_change,
  key_age_hours,
  key_fingerprint,
  on_rotate_keys_now,
}: ForwardSecrecyGroupProps) {
  const { t } = use_i18n();

  return (
    <IslandSection
      icon={<FingerPrintIcon />}
      title={t("settings.forward_secrecy")}
    >
      <SecuritySetting
        description={
          forward_secrecy_enabled
            ? t("settings.forward_secrecy_enabled_description").replace(
                "{{frequency}}",
                t(
                  KEY_ROTATION_OPTIONS.find(
                    (o) => o.value === key_rotation_hours,
                  )?.label_key || "settings.weekly",
                ).toLowerCase(),
              )
            : t("settings.forward_secrecy_disabled_description")
        }
        info={{
          title: t("settings.info_forward_secrecy_title"),
          description: t("settings.info_forward_secrecy_description"),
        }}
        title={t("settings.forward_secrecy")}
        toggle={{
          checked: forward_secrecy_enabled,
          on_change: () => on_forward_secrecy_toggle(),
          disabled: forward_secrecy_working,
          size: "lg",
        }}
      />
      {forward_secrecy_enabled && (
        <>
        <div className="mx-4 h-px bg-[var(--aster-island-divider)]" />
        <div className="px-4 pt-4 pb-4 space-y-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <FingerPrintIcon className="w-4 h-4 text-txt-muted" />
              <span className="text-[13px] font-medium text-txt-muted">
                {t("settings.current_key_status")}
              </span>
            </div>
            <div className="flex justify-between items-center text-[13px]">
              <span className="text-txt-secondary">{t("settings.age")}</span>
              <span className="text-txt-primary">
                {key_age_hours !== null
                  ? key_age_hours < 24
                    ? t("settings.hours", { count: key_age_hours })
                    : t("settings.days", {
                        count: Math.floor(key_age_hours / 24),
                      })
                  : "—"}
              </span>
            </div>
            <div className="flex justify-between items-center text-[13px] mt-1.5">
              <span className="text-txt-secondary">
                {t("settings.fingerprint")}
              </span>
              <span className="font-mono text-txt-primary min-w-0 break-all text-end ms-4">
                {key_fingerprint || "—"}
              </span>
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2 mb-3">
              <ArrowPathIcon className="w-4 h-4 text-txt-muted" />
              <span className="text-sm font-medium text-txt-primary flex items-center gap-1.5">
                {t("settings.key_rotation_interval")}
                <InfoPopover
                  description={t(
                    "settings.info_key_rotation_interval_description",
                  )}
                  title={t("settings.info_key_rotation_interval_title")}
                />
              </span>
            </div>
            <div className="aster_segmented grid-flow-row grid-cols-2 sm:grid-cols-4">
              {KEY_ROTATION_OPTIONS.map((option) => (
                <OptionButton
                  key={option.value}
                  is_selected={key_rotation_hours === option.value}
                  label={t(option.label_key)}
                  on_click={() => on_key_rotation_change(option.value)}
                />
              ))}
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2 mb-3">
              <KeyIcon className="w-4 h-4 text-txt-muted" />
              <span className="text-sm font-medium text-txt-primary flex items-center gap-1.5">
                {t("settings.key_history_limit")}
                <InfoPopover
                  description={t("settings.info_key_history_limit_description")}
                  title={t("settings.info_key_history_limit_title")}
                />
              </span>
            </div>
            <div className="aster_segmented grid-flow-row grid-cols-2 sm:grid-cols-4">
              {KEY_HISTORY_OPTIONS.map((option) => (
                <OptionButton
                  key={option.value}
                  is_selected={key_history_limit === option.value}
                  label={t(option.label_key)}
                  on_click={() => on_key_history_change(option.value)}
                />
              ))}
            </div>
            <p className="text-xs mt-2 text-txt-muted">
              {t("settings.key_history_description")}
            </p>
          </div>
          <div>
            <Button size="md" variant="secondary" onClick={on_rotate_keys_now}>
              <ArrowPathIcon className="w-4 h-4 me-2" />
              {t("settings.rotate_keys_now")}
            </Button>
            <p className="text-xs mt-2 text-txt-muted">
              {t("settings.rotate_keys_description")}
            </p>
          </div>
        </div>
        </>
      )}
    </IslandSection>
  );
}
