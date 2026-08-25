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

import { useId, useState } from "react";
import {
  KeyIcon,
  ArrowPathIcon,
  FingerPrintIcon,
  ShieldCheckIcon,
  ComputerDesktopIcon,
  LinkIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";
import { Switch } from "@aster/ui";

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
  action: React.ReactNode;
  info?: { title: string; description: string };
}

function SecuritySetting({
  title,
  description,
  action,
  info,
}: SecuritySettingProps) {
  const label_id = useId();

  return (
    <div className="flex items-center justify-between py-4">
      <div className="flex-1 pe-4">
        <p
          className="text-sm font-medium text-txt-primary flex items-center gap-1.5"
          id={label_id}
        >
          {title}
          {info && (
            <InfoPopover description={info.description} title={info.title} />
          )}
        </p>
        <p className="text-sm mt-0.5 text-txt-muted">{description}</p>
      </div>
      <div className="flex-shrink-0">
        {label_toggle_children(action, label_id)}
      </div>
    </div>
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
      className={`px-3 py-2 text-xs rounded-[14px] border transition-colors ${
        is_selected
          ? "bg-brand border-brand text-[var(--accent-fg,#ffffff)]"
          : "bg-surf-secondary border-edge-secondary text-txt-secondary"
      }`}
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
    <div>
      <p className="text-sm font-medium text-txt-primary flex items-center gap-1.5">
        {t("settings.two_step_verification")}
        {!totp_enabled && !totp_status_failed && (
          <ActionRecommendedBadge
            tip={t("settings.two_step_verification_recommendation")}
          />
        )}
      </p>
      {!totp_status_failed && (
        <p className="text-sm mt-0.5 text-txt-muted">
          {totp_enabled
            ? t("settings.two_step_verification_enabled_description")
            : t("settings.two_step_verification_description")}
        </p>
      )}

      {totp_status_failed ? (
        <div className="py-3">
          <LoadFailedNotice on_retry={() => on_totp_status_retry?.()} />
        </div>
      ) : (
        <div className="flex items-center justify-between py-3">
          <p className="text-sm text-txt-primary">
            {t("settings.authenticator_app")}
          </p>
          {totp_enabled ? (
            <Switch
              aria-label={t("settings.authenticator_app")}
              checked={totp_enabled}
              size="lg"
              onCheckedChange={on_two_factor_toggle}
            />
          ) : (
            <Button variant="outline" onClick={on_two_factor_toggle}>
              {show_inline_setup ? t("common.cancel") : t("settings.setup_2fa")}
            </Button>
          )}
        </div>
      )}

      {show_inline_setup && !totp_status_failed && (
        <TotpInlineSetup on_success={on_inline_setup_success} />
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
    </div>
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
    <div>
      <div className="mb-4">
        <h3 className="text-base font-semibold text-txt-primary flex items-center gap-2">
          <ShieldCheckIcon className="w-[18px] h-[18px] text-txt-primary flex-shrink-0" />
          {t("settings.login_alerts_sessions_title")}
        </h3>
        <div className="mt-2 h-px bg-edge-secondary" />
      </div>

      <SecuritySetting
        action={
          <Switch
            checked={session_timeout_enabled}
            size="lg"
            onCheckedChange={on_timeout_toggle}
          />
        }
        description={timeout_description}
        title={t("settings.session_timeout")}
      />
      {session_timeout_enabled && (
        <div className="pb-4">
          <p className="text-sm font-medium mb-3 text-txt-primary">
            {t("settings.timeout_duration")}
          </p>
          <div className="grid grid-cols-4 gap-2">
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
              className="text-xs font-medium text-accent-primary hover:underline"
              type="button"
              onClick={on_reload_login_alerts}
            >
              {t("common.retry")}
            </button>
          ) : (
            <Switch
              checked={login_alerts_enabled}
              disabled={!login_alerts_loaded}
              size="lg"
              onCheckedChange={on_login_alerts_toggle}
            />
          )
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
      />
      <div className="pb-4">
        <div className="flex items-center gap-2 mb-2">
          <ComputerDesktopIcon className="w-4 h-4 text-txt-muted" />
          <span className="text-xs font-medium text-txt-muted">
            {t("settings.recent_sign_ins")}
          </span>
        </div>
        {login_events_loading ? (
          <p className="text-xs text-txt-muted">{t("common.loading")}</p>
        ) : login_events_failed && login_events.length === 0 ? (
          <div className="py-4 text-center">
            <p className="text-xs text-txt-muted">
              {t("common.something_went_wrong_try_again")}
            </p>
            <button
              className="mt-2 text-xs font-medium text-accent-primary hover:underline"
              type="button"
              onClick={on_reload_login_events}
            >
              {t("common.retry")}
            </button>
          </div>
        ) : login_events.length === 0 ? (
          <div className="py-4 text-center">
            <ComputerDesktopIcon className="w-6 h-6 text-txt-muted mx-auto mb-2" />
            <p className="text-xs text-txt-muted">
              {t("settings.no_sign_in_history")}
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {visible_login_events.map((event) => (
              <div
                key={event.id}
                className="flex items-center justify-between py-2 border-b border-edge-secondary last:border-0"
              >
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs font-medium text-txt-primary">
                    {event.device_type} - {event.browser}
                  </span>
                  {event.location && (
                    <span className="text-xs text-txt-muted">
                      {event.location}
                    </span>
                  )}
                </div>
                <span className="text-xs text-txt-muted ms-4 shrink-0">
                  {format_relative_time_short(event.created_at, t)}
                </span>
              </div>
            ))}
            {login_events.length > SIGN_IN_PREVIEW_COUNT && (
              <button
                className="mt-1 text-xs font-medium text-accent-primary hover:underline"
                type="button"
                onClick={() => set_show_all_sign_ins((prev) => !prev)}
              >
                {show_all_sign_ins
                  ? t("common.show_less")
                  : t("common.show_more")}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
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
    <div>
      <div className="mb-4">
        <h3 className="text-base font-semibold text-txt-primary flex items-center gap-2">
          <LinkIcon className="w-[18px] h-[18px] text-txt-primary flex-shrink-0" />
          {t("settings.external_link_warnings")}
        </h3>
        <div className="mt-2 h-px bg-edge-secondary" />
      </div>
      <SecuritySetting
        action={
          <Switch
            checked={!external_link_warning_dismissed}
            size="lg"
            onCheckedChange={on_external_link_toggle}
          />
        }
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
      />
    </div>
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
    <div>
      <div className="mb-4">
        <h3 className="text-base font-semibold text-txt-primary flex items-center gap-2">
          <FingerPrintIcon className="w-[18px] h-[18px] text-txt-primary flex-shrink-0" />
          {t("settings.forward_secrecy")}
        </h3>
        <div className="mt-2 h-px bg-edge-secondary" />
      </div>
      <SecuritySetting
        action={
          <Switch
            checked={forward_secrecy_enabled}
            disabled={forward_secrecy_working}
            size="lg"
            onCheckedChange={on_forward_secrecy_toggle}
          />
        }
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
      />
      {forward_secrecy_enabled && (
        <div className="pb-4 space-y-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <FingerPrintIcon className="w-4 h-4 text-txt-muted" />
              <span className="text-xs font-medium text-txt-muted">
                {t("settings.current_key_status")}
              </span>
            </div>
            <div className="flex justify-between items-center text-xs">
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
            <div className="flex justify-between items-center text-xs mt-1">
              <span className="text-txt-secondary">
                {t("settings.fingerprint")}
              </span>
              <span className="font-mono text-txt-primary">
                {key_fingerprint || "—"}
              </span>
            </div>
          </div>
          <div>
            <div className="flex items-center gap-3 mb-3">
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
            <div className="grid grid-cols-4 gap-2">
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
            <div className="flex items-center gap-3 mb-3">
              <KeyIcon className="w-4 h-4 text-txt-muted" />
              <span className="text-sm font-medium text-txt-primary flex items-center gap-1.5">
                {t("settings.key_history_limit")}
                <InfoPopover
                  description={t("settings.info_key_history_limit_description")}
                  title={t("settings.info_key_history_limit_title")}
                />
              </span>
            </div>
            <div className="grid grid-cols-4 gap-2">
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
          <div className="pt-2">
            <Button size="md" variant="outline" onClick={on_rotate_keys_now}>
              <ArrowPathIcon className="w-4 h-4 me-2" />
              {t("settings.rotate_keys_now")}
            </Button>
            <p className="text-xs mt-2 text-txt-muted">
              {t("settings.rotate_keys_description")}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
