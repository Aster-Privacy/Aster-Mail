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
import {
  KeyIcon,
  ArrowPathIcon,
  FingerPrintIcon,
  ShieldCheckIcon,
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

interface SecuritySettingProps {
  title: string;
  description: string;
  action: React.ReactNode;
  info?: { title: string; description: string };
}

function SecuritySetting({ title, description, action, info }: SecuritySettingProps) {
  return (
    <div className="flex items-center justify-between py-4">
      <div className="flex-1 pr-4">
        <p className="text-sm font-medium text-txt-primary flex items-center gap-1.5">
          {title}
          {info && <InfoPopover description={info.description} title={info.title} />}
        </p>
        <p className="text-sm mt-0.5 text-txt-muted">{description}</p>
      </div>
      <div className="flex-shrink-0">{action}</div>
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
      className={`px-3 py-2 text-xs rounded-lg border transition-colors ${
        is_selected
          ? "bg-brand border-brand text-white"
          : "bg-surf-secondary border-edge-secondary text-txt-secondary"
      }`}
      type="button"
      onClick={on_click}
    >
      {label}
    </button>
  );
}

interface TwoFactorSectionProps {
  totp_enabled: boolean;
  totp_backup_codes_remaining: number | undefined;
  on_two_factor_toggle: () => void;
  session_timeout_enabled: boolean;
  session_timeout_minutes: number;
  on_timeout_toggle: () => void;
  on_timeout_change: (minutes: number) => void;
  timeout_description: string;
  login_alerts_enabled: boolean;
  on_login_alerts_toggle: () => void;
  external_link_warning_dismissed: boolean;
  on_external_link_toggle: () => void;
  forward_secrecy_enabled: boolean;
  on_forward_secrecy_toggle: () => void;
  key_rotation_hours: number;
  on_key_rotation_change: (hours: number) => void;
  key_history_limit: number;
  on_key_history_change: (limit: number) => void;
  key_age_hours: number | null;
  key_fingerprint: string | null;
  on_rotate_keys_now: () => void;
}

export function TwoFactorSection({
  totp_enabled,
  totp_backup_codes_remaining,
  on_two_factor_toggle,
  session_timeout_enabled,
  session_timeout_minutes,
  on_timeout_toggle,
  on_timeout_change,
  timeout_description,
  login_alerts_enabled,
  on_login_alerts_toggle,
  external_link_warning_dismissed,
  on_external_link_toggle,
  forward_secrecy_enabled,
  on_forward_secrecy_toggle,
  key_rotation_hours,
  on_key_rotation_change,
  key_history_limit,
  on_key_history_change,
  key_age_hours,
  key_fingerprint,
  on_rotate_keys_now,
}: TwoFactorSectionProps) {
  const { t } = use_i18n();

  return (
    <div>
      <div className="mb-4">
        <h3 className="text-base font-semibold text-txt-primary flex items-center gap-2">
          <ShieldCheckIcon className="w-[18px] h-[18px] text-txt-primary flex-shrink-0" />
          {t("settings.security_settings")}
        </h3>
        <div className="mt-2 h-px bg-edge-secondary" />
      </div>

      <SecuritySetting
        action={
          <Switch
            checked={totp_enabled}
            onCheckedChange={on_two_factor_toggle}
          />
        }
        description={
          totp_enabled
            ? t("settings.two_fa_enabled").replace(
                "{{count}}",
                String(totp_backup_codes_remaining),
              )
            : t("settings.two_fa_add_security")
        }
        title={t("settings.two_factor_auth")}
      />

      <SecuritySetting
        action={
          <Switch
            checked={session_timeout_enabled}
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
          <Switch
            checked={login_alerts_enabled}
            onCheckedChange={on_login_alerts_toggle}
          />
        }
        description={t("settings.login_alerts_description")}
        title={t("settings.login_alerts")}
      />
      <SecuritySetting
        action={
          <Switch
            checked={!external_link_warning_dismissed}
            onCheckedChange={on_external_link_toggle}
          />
        }
        description={
          external_link_warning_dismissed
            ? t("settings.external_link_warning_disabled")
            : t("settings.external_link_warning_enabled")
        }
        info={{ title: t("settings.info_external_link_warnings_title"), description: t("settings.info_external_link_warnings_description") }}
        title={t("settings.external_link_warnings")}
      />
      <SecuritySetting
        action={
          <Switch
            checked={forward_secrecy_enabled}
            onCheckedChange={on_forward_secrecy_toggle}
          />
        }
        info={{ title: t("settings.info_forward_secrecy_title"), description: t("settings.info_forward_secrecy_description") }}
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
                    ? t("settings.hours").replace(
                        "{{count}}",
                        String(key_age_hours),
                      )
                    : t("settings.days").replace(
                        "{{count}}",
                        String(Math.floor(key_age_hours / 24)),
                      )
                  : "\u2014"}
              </span>
            </div>
            <div className="flex justify-between items-center text-xs mt-1">
              <span className="text-txt-secondary">
                {t("settings.fingerprint")}
              </span>
              <span className="font-mono text-txt-primary">
                {key_fingerprint || "\u2014"}
              </span>
            </div>
          </div>
          <div>
            <div className="flex items-center gap-3 mb-3">
              <ArrowPathIcon className="w-4 h-4 text-txt-muted" />
              <span className="text-sm font-medium text-txt-primary flex items-center gap-1.5">
                {t("settings.key_rotation_interval")}
                <InfoPopover description={t("settings.info_key_rotation_interval_description")} title={t("settings.info_key_rotation_interval_title")} />
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
                <InfoPopover description={t("settings.info_key_history_limit_description")} title={t("settings.info_key_history_limit_title")} />
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
              <ArrowPathIcon className="w-4 h-4 mr-2" />
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
