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
import type { UserPreferences } from "@/services/api/preferences";

import { ShieldCheckIcon } from "@heroicons/react/24/outline";
import { Switch } from "@aster/ui";

import { use_i18n } from "@/lib/i18n/context";
import { InfoPopover } from "@/components/ui/info_popover";

interface ToggleSettingProps {
  title: string;
  description: string;
  enabled: boolean;
  on_toggle: () => void;
  info?: { title: string; description: string };
}

function ToggleSetting({
  title,
  description,
  enabled,
  on_toggle,
  info,
}: ToggleSettingProps) {
  return (
    <div className="flex items-center justify-between py-4">
      <div className="flex-1 pr-4">
        <p className="text-sm font-medium text-txt-primary flex items-center gap-1.5">
          {title}
          {info && <InfoPopover description={info.description} title={info.title} />}
        </p>
        <p className="text-sm mt-0.5 text-txt-muted">{description}</p>
      </div>
      <Switch checked={enabled} onCheckedChange={on_toggle} />
    </div>
  );
}

interface EncryptionSettingsFormProps {
  preferences: {
    auto_discover_keys: boolean;
    encrypt_emails: boolean;
    require_encryption: boolean;
    show_encryption_indicators: boolean;
    publish_to_wkd: boolean;
    publish_to_keyservers: boolean;
  };
  update_preference: <K extends keyof UserPreferences>(
    key: K,
    value: UserPreferences[K],
    immediate?: boolean,
  ) => void;
  handle_wkd_toggle: () => Promise<void>;
  handle_keyserver_toggle: () => Promise<void>;
}

export function EncryptionSettingsForm({
  preferences,
  update_preference,
  handle_wkd_toggle,
  handle_keyserver_toggle,
}: EncryptionSettingsFormProps) {
  const { t } = use_i18n();

  return (
    <div>
      <div className="mb-4">
        <h3 className="text-base font-semibold text-txt-primary flex items-center gap-2">
          <ShieldCheckIcon className="w-[18px] h-[18px] text-txt-primary flex-shrink-0" />
          {t("settings.encryption_behavior")}
        </h3>
        <div className="mt-2 h-px bg-edge-secondary" />
      </div>
      <p className="text-sm mb-3 text-txt-muted">
        {t("settings.control_encryption_description")}
      </p>

      <ToggleSetting
        description={t("settings.auto_discover_keys_description")}
        enabled={preferences.auto_discover_keys}
        on_toggle={() =>
          update_preference(
            "auto_discover_keys",
            !preferences.auto_discover_keys,
            true,
          )
        }
        info={{ title: t("settings.info_auto_discover_keys_title"), description: t("settings.info_auto_discover_keys_description") }}
        title={t("settings.auto_discover_keys_title")}
      />
      <ToggleSetting
        description={t("settings.encrypt_by_default_description")}
        enabled={preferences.encrypt_emails}
        on_toggle={() =>
          update_preference("encrypt_emails", !preferences.encrypt_emails, true)
        }
        info={{ title: t("settings.info_encrypt_by_default_title"), description: t("settings.info_encrypt_by_default_description") }}
        title={t("settings.encrypt_by_default_title")}
      />
      <ToggleSetting
        description={t("settings.require_encryption_description")}
        enabled={preferences.require_encryption}
        info={{ title: t("settings.info_require_encryption_title"), description: t("settings.info_require_encryption_description") }}
        on_toggle={() =>
          update_preference(
            "require_encryption",
            !preferences.require_encryption,
            true,
          )
        }
        title={t("settings.require_encryption_title")}
      />
      <ToggleSetting
        description={t("settings.show_encryption_indicators_description")}
        enabled={preferences.show_encryption_indicators}
        on_toggle={() =>
          update_preference(
            "show_encryption_indicators",
            !preferences.show_encryption_indicators,
            true,
          )
        }
        title={t("settings.show_encryption_indicators_title")}
      />
      <ToggleSetting
        description={t("settings.publish_keys_wkd_description")}
        enabled={preferences.publish_to_wkd}
        info={{ title: t("settings.info_wkd_title"), description: t("settings.info_wkd_description") }}
        on_toggle={handle_wkd_toggle}
        title={t("settings.publish_keys_wkd_title")}
      />
      <ToggleSetting
        description={t("settings.publish_to_keyservers_description")}
        enabled={preferences.publish_to_keyservers}
        info={{ title: t("settings.info_keyservers_title"), description: t("settings.info_keyservers_description") }}
        on_toggle={handle_keyserver_toggle}
        title={t("settings.publish_to_keyservers_title")}
      />
    </div>
  );
}
