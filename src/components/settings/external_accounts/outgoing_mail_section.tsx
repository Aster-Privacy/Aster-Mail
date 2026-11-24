//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
import type { DecryptedExternalAccount } from "@/services/api/external_accounts";
import type { TranslationFn } from "@/components/settings/external_accounts/form_types";

import { PaperAirplaneIcon } from "@heroicons/react/24/outline";
import { IslandDivider, IslandSection, SettingToggleRow } from "@aster/ui";

import { Input } from "@/components/ui/input";
import {
  FieldGroup,
  FormField,
  PasswordInput,
} from "@/components/settings/external_accounts/form_field";

interface OutgoingMailSectionProps {
  editing_account: DecryptedExternalAccount | null;
  form_smtp_host: string;
  form_smtp_port: number;
  form_smtp_username: string;
  form_smtp_password: string;
  has_stored_smtp_password: boolean;
  show_smtp_password: boolean;
  set_show_smtp_password: (value: boolean) => void;
  form_smtp_use_tls: boolean;
  set_form_smtp_use_tls: (value: boolean) => void;
  smtp_same_as_incoming: boolean;
  handle_smtp_host_change: (value: string) => void;
  handle_smtp_port_change: (value: string) => void;
  handle_smtp_username_change: (value: string) => void;
  handle_smtp_password_change: (value: string) => void;
  handle_smtp_same_toggle: (checked: boolean) => void;
  t: TranslationFn;
}

export function OutgoingMailSection({
  editing_account,
  form_smtp_host,
  form_smtp_port,
  form_smtp_username,
  form_smtp_password,
  has_stored_smtp_password,
  show_smtp_password,
  set_show_smtp_password,
  form_smtp_use_tls,
  set_form_smtp_use_tls,
  smtp_same_as_incoming,
  handle_smtp_host_change,
  handle_smtp_port_change,
  handle_smtp_username_change,
  handle_smtp_password_change,
  handle_smtp_same_toggle,
  t,
}: OutgoingMailSectionProps) {
  const password_hint = has_stored_smtp_password ? (
    <p>{t("settings.keep_saved_password")}</p>
  ) : editing_account ? (
    <p>{t("settings.re_enter_password")}</p>
  ) : undefined;

  return (
    <IslandSection
      icon={<PaperAirplaneIcon />}
      title={t("settings.outgoing_mail_smtp")}
    >
      <SettingToggleRow
        checked={smtp_same_as_incoming}
        description={t("settings.ext_v2_smtp_same_description")}
        label={t("settings.same_as_incoming")}
        on_change={handle_smtp_same_toggle}
      />
      {!smtp_same_as_incoming && (
        <>
          <IslandDivider />
          <FieldGroup>
            <FormField
              id="ext-account-smtp-host"
              label={t("settings.smtp_server_host")}
              span={4}
            >
              <Input
                autoCapitalize="none"
                autoComplete="off"
                autoCorrect="off"
                className="aster_input_tonal w-full"
                id="ext-account-smtp-host"
                maxLength={253}
                placeholder={t("settings.smtp_host_placeholder")}
                size="md"
                spellCheck={false}
                type="text"
                value={form_smtp_host}
                onChange={(e) => handle_smtp_host_change(e.target.value)}
              />
            </FormField>
            <FormField
              id="ext-account-smtp-port"
              label={t("settings.port")}
              span={2}
            >
              <Input
                className="aster_input_tonal w-full"
                id="ext-account-smtp-port"
                inputMode="numeric"
                max={65535}
                min={0}
                size="md"
                type="number"
                value={form_smtp_port === 0 ? "" : form_smtp_port}
                onChange={(e) => handle_smtp_port_change(e.target.value)}
              />
            </FormField>
            <FormField
              id="ext-account-smtp-username"
              label={t("settings.smtp_username")}
              span={3}
            >
              <Input
                autoCapitalize="none"
                autoComplete="username"
                autoCorrect="off"
                className="aster_input_tonal w-full"
                id="ext-account-smtp-username"
                maxLength={254}
                placeholder={t("settings.username_placeholder")}
                size="md"
                spellCheck={false}
                type="text"
                value={form_smtp_username}
                onChange={(e) => handle_smtp_username_change(e.target.value)}
              />
            </FormField>
            <FormField
              hint={password_hint}
              id="ext-account-smtp-password"
              label={t("settings.smtp_password")}
              span={3}
            >
              <PasswordInput
                hide_label={t("settings.hide_smtp_password")}
                id="ext-account-smtp-password"
                is_visible={show_smtp_password}
                on_change={handle_smtp_password_change}
                on_toggle_visible={() =>
                  set_show_smtp_password(!show_smtp_password)
                }
                show_label={t("settings.show_smtp_password")}
                value={form_smtp_password}
              />
            </FormField>
          </FieldGroup>
          <IslandDivider />
          <SettingToggleRow
            checked={form_smtp_use_tls}
            description={t("settings.ext_v2_tls_description")}
            label={t("settings.use_tls")}
            on_change={set_form_smtp_use_tls}
          />
        </>
      )}
    </IslandSection>
  );
}
