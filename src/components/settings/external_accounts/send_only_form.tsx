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
import type { DecryptedExternalAccount } from "@/services/api/external_accounts";
import type { TranslationFn } from "@/components/settings/external_accounts/form_types";
import type { TranslationKey } from "@/lib/i18n";

import { useEffect, useRef, useState } from "react";
import { PaperAirplaneIcon, UserCircleIcon } from "@heroicons/react/24/outline";
import {
  Button,
  IslandDivider,
  IslandSection,
  IslandSections,
  SettingToggleRow,
} from "@aster/ui";

import { Modal, ModalTitle } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import {
  create_send_only_account,
  get_connection_settings,
  update_send_only_account,
} from "@/services/api/external_accounts";
import {
  parse_external_limit_error,
  upgrade_resource_for,
  validate_send_only_draft,
  type SendOnlyFieldError,
} from "@/lib/external_account_modes";
import {
  FieldGroup,
  FormField,
  PasswordInput,
} from "@/components/settings/external_accounts/form_field";
import { show_plan_limit_upgrade } from "@/stores/upgrade_store";

const DEFAULT_LABEL_COLOR = "#3B82F6";
const DEFAULT_SMTP_PORT = 587;

const FIELD_ERROR_KEYS: Record<SendOnlyFieldError, TranslationKey> = {
  host: "settings.ext_v2_field_host_invalid",
  port: "settings.ext_v2_field_port_invalid",
  username: "settings.ext_v2_field_username_invalid",
  password: "settings.ext_v2_field_password_invalid",
  from_address: "settings.ext_v2_field_from_address_invalid",
  from_name: "settings.ext_v2_field_from_name_invalid",
};

interface SendOnlyFormProps {
  is_open: boolean;
  editing_account: DecryptedExternalAccount | null;
  on_close: () => void;
  on_saved: () => void;
  t: TranslationFn;
}

export function SendOnlyForm({
  is_open,
  editing_account,
  on_close,
  on_saved,
  t,
}: SendOnlyFormProps) {
  const [smtp_host, set_smtp_host] = useState("");
  const [smtp_port, set_smtp_port] = useState(DEFAULT_SMTP_PORT);
  const [smtp_username, set_smtp_username] = useState("");
  const [smtp_password, set_smtp_password] = useState("");
  const [show_password, set_show_password] = useState(false);
  const [use_tls, set_use_tls] = useState(true);
  const [from_address, set_from_address] = useState("");
  const [from_name, set_from_name] = useState("");
  const [has_stored_password, set_has_stored_password] = useState(false);
  const [error, set_error] = useState<string | null>(null);
  const [is_submitting, set_is_submitting] = useState(false);
  const [is_loading, set_is_loading] = useState(false);
  const request_ref = useRef(0);

  useEffect(() => {
    if (!is_open) return;

    request_ref.current += 1;
    const request_id = request_ref.current;

    set_error(null);
    set_smtp_password("");
    set_show_password(false);
    set_from_address(editing_account?.email ?? "");
    set_from_name(editing_account?.display_name ?? "");
    set_smtp_host("");
    set_smtp_port(DEFAULT_SMTP_PORT);
    set_smtp_username(editing_account?.email ?? "");
    set_use_tls(true);
    set_has_stored_password(false);
    set_is_loading(false);

    if (!editing_account) return;

    set_is_loading(true);
    void get_connection_settings(editing_account.account_token).then(
      (response) => {
        if (request_ref.current !== request_id) return;
        set_is_loading(false);

        if (!response.data) {
          set_error(
            response.error ?? t("common.something_went_wrong_try_again"),
          );

          return;
        }

        set_smtp_host(response.data.smtp_host);
        set_smtp_port(response.data.smtp_port || DEFAULT_SMTP_PORT);
        set_smtp_username(response.data.smtp_username);
        set_use_tls(response.data.use_tls);
        set_has_stored_password(response.data.has_smtp_password);
      },
      () => {
        if (request_ref.current !== request_id) return;
        set_is_loading(false);
        set_error(t("common.something_went_wrong_try_again"));
      },
    );
  }, [is_open, editing_account, t]);

  const handle_submit = async () => {
    if (is_submitting || is_loading) return;

    const field_error = validate_send_only_draft({
      smtp_host,
      smtp_port,
      smtp_username,
      smtp_password,
      from_address,
      from_name,
      password_required: !has_stored_password,
    });

    if (field_error) {
      set_error(t(FIELD_ERROR_KEYS[field_error]));

      return;
    }

    set_error(null);
    set_is_submitting(true);

    const credentials = {
      smtp_host: smtp_host.trim(),
      smtp_port,
      smtp_username: smtp_username.trim(),
      smtp_password,
      from_address: from_address.trim(),
      from_name: from_name.trim(),
      use_tls,
    };
    const label_name = editing_account?.label_name || from_address.trim();
    const label_color = editing_account?.label_color || DEFAULT_LABEL_COLOR;
    const response = editing_account
      ? await update_send_only_account(
          editing_account.account_token,
          credentials,
          label_name,
          label_color,
        )
      : await create_send_only_account(credentials, label_name, label_color);

    set_is_submitting(false);
    set_smtp_password("");

    if (response.data) {
      on_saved();

      return;
    }

    const limit_error = parse_external_limit_error(response);

    if (limit_error) {
      on_close();
      show_plan_limit_upgrade({
        resource: upgrade_resource_for(limit_error.cap_class),
      });

      return;
    }

    set_error(response.error ?? t("common.something_went_wrong_try_again"));
  };

  const busy = is_submitting || is_loading;

  return (
    <Modal
      close_on_overlay={false}
      is_open={is_open}
      on_close={() => {
        if (!is_submitting) on_close();
      }}
      show_close_button={false}
      size="lg"
    >
      <div className="px-6 pt-6 pb-4 border-b border-[var(--aster-floating-divider)]">
        <ModalTitle className="text-[15px]">
          {editing_account
            ? t("settings.ext_v2_send_only_edit_title")
            : t("settings.ext_v2_send_only_add_title")}
        </ModalTitle>
        <p className="text-[12px] mt-1 text-txt-muted">
          {t("settings.ext_v2_send_only_description")}
        </p>
      </div>
      <form
        className="px-6 pt-5 pb-6"
        onSubmit={(e) => {
          e.preventDefault();
          void handle_submit();
        }}
      >
        <IslandSections>
          <IslandSection
            icon={<UserCircleIcon />}
            title={t("settings.account_info")}
          >
            <FieldGroup>
              <FormField
                id="send-only-from-address"
                label={t("settings.ext_v2_from_address")}
                span={3}
              >
                <Input
                  autoCapitalize="none"
                  autoComplete="email"
                  autoCorrect="off"
                  className="aster_input_tonal w-full"
                  disabled={busy}
                  id="send-only-from-address"
                  maxLength={254}
                  size="md"
                  spellCheck={false}
                  type="email"
                  value={from_address}
                  onChange={(e) => set_from_address(e.target.value)}
                />
              </FormField>
              <FormField
                id="send-only-from-name"
                label={t("settings.ext_v2_from_name")}
                span={3}
              >
                <Input
                  autoComplete="name"
                  className="aster_input_tonal w-full"
                  disabled={busy}
                  id="send-only-from-name"
                  maxLength={128}
                  size="md"
                  type="text"
                  value={from_name}
                  onChange={(e) => set_from_name(e.target.value)}
                />
              </FormField>
            </FieldGroup>
          </IslandSection>
          <IslandSection
            description={t("settings.ext_v2_send_only_verify_note")}
            icon={<PaperAirplaneIcon />}
            title={t("settings.outgoing_mail_smtp")}
          >
            <FieldGroup>
              <FormField
                id="send-only-smtp-host"
                label={t("settings.smtp_server_host")}
                span={4}
              >
                <Input
                  autoCapitalize="none"
                  autoComplete="off"
                  autoCorrect="off"
                  className="aster_input_tonal w-full"
                  disabled={busy}
                  id="send-only-smtp-host"
                  maxLength={253}
                  placeholder={t("settings.smtp_host_placeholder")}
                  size="md"
                  spellCheck={false}
                  type="text"
                  value={smtp_host}
                  onChange={(e) => set_smtp_host(e.target.value)}
                />
              </FormField>
              <FormField
                id="send-only-smtp-port"
                label={t("settings.port")}
                span={2}
              >
                <Input
                  className="aster_input_tonal w-full"
                  disabled={busy}
                  id="send-only-smtp-port"
                  inputMode="numeric"
                  max={65535}
                  min={1}
                  size="md"
                  type="number"
                  value={smtp_port === 0 ? "" : smtp_port}
                  onChange={(e) => {
                    const parsed = Number.parseInt(e.target.value, 10);

                    set_smtp_port(Number.isFinite(parsed) ? parsed : 0);
                  }}
                />
              </FormField>
              <FormField
                id="send-only-smtp-username"
                label={t("settings.smtp_username")}
                span={3}
              >
                <Input
                  autoCapitalize="none"
                  autoComplete="username"
                  autoCorrect="off"
                  className="aster_input_tonal w-full"
                  disabled={busy}
                  id="send-only-smtp-username"
                  maxLength={255}
                  size="md"
                  spellCheck={false}
                  type="text"
                  value={smtp_username}
                  onChange={(e) => set_smtp_username(e.target.value)}
                />
              </FormField>
              <FormField
                hint={
                  has_stored_password ? (
                    <p>{t("settings.keep_saved_password")}</p>
                  ) : undefined
                }
                id="send-only-smtp-password"
                label={t("settings.smtp_password")}
                span={3}
              >
                <PasswordInput
                  auto_complete="new-password"
                  disabled={busy}
                  hide_label={t("settings.hide_smtp_password")}
                  id="send-only-smtp-password"
                  is_visible={show_password}
                  on_change={set_smtp_password}
                  on_toggle_visible={() => set_show_password(!show_password)}
                  show_label={t("settings.show_smtp_password")}
                  value={smtp_password}
                />
              </FormField>
            </FieldGroup>
            <IslandDivider />
            <SettingToggleRow
              checked={use_tls}
              description={t("settings.ext_v2_tls_description")}
              disabled={busy}
              label={t("settings.use_tls")}
              on_change={set_use_tls}
            />
          </IslandSection>
        </IslandSections>
        {error && (
          <p className="mt-4 text-[13px] text-red-500" role="alert">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-3 pt-5">
          <Button
            disabled={is_submitting}
            type="button"
            variant="outline"
            onClick={on_close}
          >
            {t("common.cancel")}
          </Button>
          <Button disabled={busy} type="submit" variant="depth">
            {is_submitting
              ? t("settings.ext_v2_send_only_verifying")
              : editing_account
                ? t("settings.update_account_button")
                : t("settings.save_account")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
