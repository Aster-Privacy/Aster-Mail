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
import type { KeyserverPublicationState } from "@/services/api/keys";

import {
  ShieldCheckIcon,
  PlusIcon,
  XMarkIcon,
  ServerStackIcon,
  ArrowTopRightOnSquareIcon,
  CheckCircleIcon,
  ClockIcon,
  ExclamationCircleIcon,
  MinusCircleIcon,
} from "@heroicons/react/24/outline";
import { Button, IslandRow, IslandSection } from "@aster/ui";

import { use_i18n } from "@/lib/i18n/context";
import { InfoPopover } from "@/components/ui/info_popover";
import { ButtonSpinner } from "@/components/ui/spinner";
import { is_composing } from "@/utils/ime";

interface ToggleSettingProps {
  title: string;
  description: string;
  enabled: boolean;
  on_toggle: () => void;
  info?: { title: string; description: string };
}

function status_text(
  Icon: typeof CheckCircleIcon,
  color: string,
  label: string,
) {
  return (
    <span
      className="inline-flex items-center gap-1 text-[12px] font-semibold"
      style={{ color }}
    >
      <Icon aria-hidden="true" className="h-[15px] w-[15px]" />
      {label}
    </span>
  );
}

function ToggleSetting({
  title,
  description,
  enabled,
  on_toggle,
  info,
}: ToggleSettingProps) {
  return (
    <IslandRow
      description={description}
      label={
        <span className="inline-flex flex-wrap items-center gap-1.5">
          {title}
          {info && (
            <InfoPopover description={info.description} title={info.title} />
          )}
        </span>
      }
      toggle={{
        checked: enabled,
        on_change: () => on_toggle(),
        size: "lg",
        aria_label: title,
      }}
    />
  );
}

export const DEFAULT_KEYSERVERS = ["https://keys.openpgp.org"];

interface EncryptionSettingsFormProps {
  preferences: {
    auto_discover_keys: boolean;
    encrypt_emails: boolean;
    require_encryption: boolean;
    obscure_subject_when_encrypted: boolean;
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
  handle_require_encryption_toggle: () => Promise<void>;
  keyserver_urls: string[];
  keyserver_input: string;
  set_keyserver_input: (v: string) => void;
  is_saving_keyservers: boolean;
  handle_add_keyserver: () => void;
  handle_remove_keyserver: (url: string) => void;
  keyserver_published: boolean | null;
  keyserver_state: KeyserverPublicationState | null;
  keyserver_error: string | null;
  is_publishing_keyserver: boolean;
  handle_publish_to_keyservers: () => Promise<void>;
}

export function EncryptionSettingsForm({
  preferences,
  update_preference,
  handle_wkd_toggle,
  handle_auto_discover_keys_toggle,
  handle_encrypt_emails_toggle,
  handle_require_encryption_toggle,
  keyserver_urls,
  keyserver_input,
  set_keyserver_input,
  is_saving_keyservers,
  handle_add_keyserver,
  handle_remove_keyserver,
  keyserver_published,
  keyserver_state,
  keyserver_error,
  is_publishing_keyserver,
  handle_publish_to_keyservers,
}: EncryptionSettingsFormProps) {
  const { t } = use_i18n();

  const keyserver_badge = () => {
    if (keyserver_published === null) return null;
    if (
      keyserver_state === "published" ||
      (keyserver_published && !keyserver_state)
    ) {
      return status_text(
        CheckCircleIcon,
        "var(--color-success)",
        t("settings.keyserver_status_published"),
      );
    }
    if (keyserver_state === "failed") {
      return status_text(
        ExclamationCircleIcon,
        "var(--color-danger)",
        t("settings.keyserver_status_failed"),
      );
    }
    if (keyserver_state === "awaiting_verification") {
      return status_text(
        ClockIcon,
        "var(--color-warning)",
        t("settings.keyserver_status_awaiting"),
      );
    }

    return status_text(
      MinusCircleIcon,
      "var(--text-muted)",
      t("settings.keyserver_status_not_published"),
    );
  };

  const keyserver_hint = () => {
    if (keyserver_state === "awaiting_verification") {
      return t("settings.keyserver_awaiting_hint");
    }
    if (keyserver_state === "failed") {
      return keyserver_error
        ? `${t("settings.keyserver_failed_hint")} (${keyserver_error})`
        : t("settings.keyserver_failed_hint");
    }

    return t("settings.keyserver_permanent_warning");
  };

  return (
    <>
      <IslandSection
        description={t("settings.control_encryption_description")}
        icon={<ShieldCheckIcon />}
        title={t("settings.encryption_behavior")}
      >
        <ToggleSetting
          description={t("settings.auto_discover_keys_description")}
          enabled={preferences.auto_discover_keys}
          info={{
            title: t("settings.info_auto_discover_keys_title"),
            description: t("settings.info_auto_discover_keys_description"),
          }}
          on_toggle={handle_auto_discover_keys_toggle}
          title={t("settings.auto_discover_keys_title")}
        />
        <ToggleSetting
          description={t("settings.encrypt_by_default_description")}
          enabled={preferences.encrypt_emails}
          info={{
            title: t("settings.info_encrypt_by_default_title"),
            description: t("settings.info_encrypt_by_default_description"),
          }}
          on_toggle={handle_encrypt_emails_toggle}
          title={t("settings.encrypt_by_default_title")}
        />
        <ToggleSetting
          description={t("settings.obscure_subject_description")}
          enabled={preferences.obscure_subject_when_encrypted}
          info={{
            title: t("settings.info_obscure_subject_title"),
            description: t("settings.info_obscure_subject_description"),
          }}
          on_toggle={() =>
            update_preference(
              "obscure_subject_when_encrypted",
              !preferences.obscure_subject_when_encrypted,
              true,
            )
          }
          title={t("settings.obscure_subject_title")}
        />
        <ToggleSetting
          description={t("settings.require_encryption_description")}
          enabled={preferences.require_encryption}
          info={{
            title: t("settings.info_require_encryption_title"),
            description: t("settings.info_require_encryption_description"),
          }}
          on_toggle={handle_require_encryption_toggle}
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
          info={{
            title: t("settings.info_wkd_title"),
            description: t("settings.info_wkd_description"),
          }}
          on_toggle={handle_wkd_toggle}
          title={t("settings.publish_keys_wkd_title")}
        />
      </IslandSection>

      <IslandSection
        icon={<ServerStackIcon />}
        title={
          <span className="inline-flex items-center gap-1.5">
            {t("settings.keyserver_urls_title")}
            <InfoPopover
              description={t("settings.info_keyservers_description")}
              title={t("settings.info_keyservers_title")}
            />
          </span>
        }
      >
        <IslandRow
          description={keyserver_hint()}
          label={
            <span className="inline-flex flex-wrap items-center gap-2">
              {t("settings.keyserver_publication_status")}
              {keyserver_badge()}
            </span>
          }
          layout="stacked"
          trailing={
            <Button
              disabled={is_publishing_keyserver}
              variant="depth"
              onClick={handle_publish_to_keyservers}
            >
              {keyserver_published
                ? t("settings.keyserver_republish_btn")
                : t("settings.keyserver_publish_btn")}
              {is_publishing_keyserver && <ButtonSpinner />}
            </Button>
          }
        />

        {DEFAULT_KEYSERVERS.map((url) => (
          <IslandRow
            key={url}
            label={
              <span className="block text-sm font-mono text-txt-secondary truncate">
                {url}
              </span>
            }
            trailing={
              <a
                aria-label={url}
                className="flex-shrink-0 text-txt-muted hover:text-txt-primary transition-colors"
                href={url}
                rel="noopener noreferrer"
                target="_blank"
              >
                <ArrowTopRightOnSquareIcon className="w-3.5 h-3.5" />
              </a>
            }
          />
        ))}
        {keyserver_urls.map((url) => (
          <IslandRow
            key={url}
            label={
              <span className="block text-sm font-mono text-txt-primary truncate">
                {url}
              </span>
            }
            trailing={
              <>
                <a
                  aria-label={url}
                  className="flex-shrink-0 text-txt-muted hover:text-txt-primary transition-colors"
                  href={url}
                  rel="noopener noreferrer"
                  target="_blank"
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
              </>
            }
          />
        ))}
        <div className="flex items-center gap-2 px-4 pt-2 pb-4">
          <input
            className="flex-1 min-w-0 px-3 h-8 rounded-[var(--aster-radius-control)] text-sm font-mono bg-transparent"
            disabled={is_saving_keyservers}
            placeholder={t("settings.keyserver_url_placeholder")}
            style={{
              border: "1px solid var(--border-primary)",
              color: "var(--text-primary)",
              outline: "none",
            }}
            value={keyserver_input}
            onChange={(e) => set_keyserver_input(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !is_composing(e)) handle_add_keyserver();
            }}
          />
          <Button
            disabled={is_saving_keyservers || !keyserver_input.trim()}
            size="sm"
            variant="depth"
            onClick={handle_add_keyserver}
          >
            <PlusIcon className="w-3.5 h-3.5 me-1" />
            {t("settings.keyserver_add")}
          </Button>
        </div>
      </IslandSection>
    </>
  );
}
