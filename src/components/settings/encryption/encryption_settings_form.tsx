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
// GNU Affero General Public License for more details.
//
// You should have received a copy of the AGPLv3
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
import type { UserPreferences } from "@/services/api/preferences";

import {
  ShieldCheckIcon,
  PlusIcon,
  XMarkIcon,
  ServerStackIcon,
  ArrowTopRightOnSquareIcon,
} from "@heroicons/react/24/outline";
import { Switch, Button, Badge } from "@aster/ui";

import { use_i18n } from "@/lib/i18n/context";
import { InfoPopover } from "@/components/ui/info_popover";
import { Spinner } from "@/components/ui/spinner";

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

const DEFAULT_KEYSERVERS = ["https://keys.openpgp.org", "https://keyserver.ubuntu.com"];

interface EncryptionSettingsFormProps {
  preferences: {
    auto_discover_keys: boolean;
    encrypt_emails: boolean;
    require_encryption: boolean;
    show_encryption_indicators: boolean;
    publish_to_wkd: boolean;
  };
  update_preference: <K extends keyof UserPreferences>(
    key: K,
    value: UserPreferences[K],
    immediate?: boolean,
  ) => void;
  handle_wkd_toggle: () => Promise<void>;
  handle_auto_discover_keys_toggle: () => Promise<void>;
  handle_encrypt_emails_toggle: () => Promise<void>;
  keyserver_urls: string[];
  keyserver_input: string;
  set_keyserver_input: (v: string) => void;
  is_saving_keyservers: boolean;
  handle_add_keyserver: () => void;
  handle_remove_keyserver: (url: string) => void;
  keyserver_published: boolean | null;
  is_publishing_keyserver: boolean;
  handle_publish_to_keyservers: () => Promise<void>;
}

export function EncryptionSettingsForm({
  preferences,
  update_preference,
  handle_wkd_toggle,
  handle_auto_discover_keys_toggle,
  handle_encrypt_emails_toggle,
  keyserver_urls,
  keyserver_input,
  set_keyserver_input,
  is_saving_keyservers,
  handle_add_keyserver,
  handle_remove_keyserver,
  keyserver_published,
  is_publishing_keyserver,
  handle_publish_to_keyservers,
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
        on_toggle={handle_auto_discover_keys_toggle}
        info={{ title: t("settings.info_auto_discover_keys_title"), description: t("settings.info_auto_discover_keys_description") }}
        title={t("settings.auto_discover_keys_title")}
      />
      <ToggleSetting
        description={t("settings.encrypt_by_default_description")}
        enabled={preferences.encrypt_emails}
        on_toggle={handle_encrypt_emails_toggle}
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

      <div className="mt-6 mb-4">
        <h3 className="text-base font-semibold text-txt-primary flex items-center gap-2">
          <ServerStackIcon className="w-[18px] h-[18px] text-txt-primary flex-shrink-0" />
          {t("settings.keyserver_urls_title")}
          <InfoPopover
            title={t("settings.info_keyservers_title")}
            description={t("settings.info_keyservers_description")}
          />
        </h3>
        <div className="mt-2 h-px bg-edge-secondary" />
      </div>

      <div className="flex items-center justify-between py-4 border-b border-b-edge-secondary">
        <div className="flex-1 pr-4">
          <p className="text-sm font-medium text-txt-primary flex items-center gap-2">
            {t("settings.keyserver_publication_status")}
            {keyserver_published === null ? null : keyserver_published ? (
              <Badge color="green">{t("settings.keyserver_status_published")}</Badge>
            ) : (
              <Badge color="gray">{t("settings.keyserver_status_not_published")}</Badge>
            )}
          </p>
          <p className="text-sm mt-0.5 text-txt-muted">
            {t("settings.keyserver_permanent_warning")}
          </p>
        </div>
        <Button
          disabled={is_publishing_keyserver}
          size="sm"
          variant="depth"
          onClick={handle_publish_to_keyservers}
        >
          {is_publishing_keyserver ? (
            <Spinner size="sm" />
          ) : keyserver_published ? (
            t("settings.keyserver_republish_btn")
          ) : (
            t("settings.keyserver_publish_btn")
          )}
        </Button>
      </div>

      <div className="divide-y divide-edge-secondary mt-1">
        {DEFAULT_KEYSERVERS.map((url) => (
          <div key={url} className="flex items-center gap-2 py-2.5">
            <span className="flex-1 text-sm font-mono text-txt-secondary truncate">{url}</span>
            <a
              aria-label={url}
              href={url}
              rel="noopener noreferrer"
              target="_blank"
              className="flex-shrink-0 text-txt-muted hover:text-txt-primary transition-colors"
            >
              <ArrowTopRightOnSquareIcon className="w-3.5 h-3.5" />
            </a>
          </div>
        ))}
        {keyserver_urls.map((url) => (
          <div key={url} className="flex items-center gap-2 py-2.5">
            <span className="flex-1 text-sm font-mono text-txt-primary truncate">{url}</span>
            <a
              aria-label={url}
              href={url}
              rel="noopener noreferrer"
              target="_blank"
              className="flex-shrink-0 text-txt-muted hover:text-txt-primary transition-colors"
            >
              <ArrowTopRightOnSquareIcon className="w-3.5 h-3.5" />
            </a>
            <button
              aria-label={t("settings.keyserver_remove")}
              className="flex-shrink-0 text-txt-muted hover:text-red-500 transition-colors"
              disabled={is_saving_keyservers}
              onClick={() => handle_remove_keyserver(url)}
            >
              <XMarkIcon className="w-4 h-4" />
            </button>
          </div>
        ))}
        <div className="flex items-center gap-2 pt-3 pb-2">
          <input
            className="flex-1 px-3 h-8 rounded-lg text-sm font-mono bg-transparent"
            disabled={is_saving_keyservers}
            placeholder={t("settings.keyserver_url_placeholder")}
            style={{ border: "1px solid var(--border-primary)", color: "var(--text-primary)", outline: "none" }}
            value={keyserver_input}
            onChange={(e) => set_keyserver_input(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handle_add_keyserver(); }}
          />
          <Button
            disabled={is_saving_keyservers || !keyserver_input.trim()}
            size="sm"
            variant="depth"
            onClick={handle_add_keyserver}
          >
            <PlusIcon className="w-3.5 h-3.5 mr-1" />
            {t("settings.keyserver_add")}
          </Button>
        </div>
      </div>
    </div>
  );
}
