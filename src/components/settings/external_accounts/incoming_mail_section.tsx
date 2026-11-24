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

import { InboxArrowDownIcon } from "@heroicons/react/24/outline";
import { IslandDivider, IslandSection, SettingToggleRow } from "@aster/ui";

import { Input } from "@/components/ui/input";
import { next_radio_index } from "@/lib/radiogroup_navigation";
import {
  FieldGroup,
  FormField,
  PasswordInput,
} from "@/components/settings/external_accounts/form_field";

interface ProtocolCardProps {
  is_active: boolean;
  title: string;
  description: string;
  on_click: () => void;
}

function ProtocolCard({
  is_active,
  title,
  description,
  on_click,
}: ProtocolCardProps) {
  const handle_keydown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const group = event.currentTarget.parentElement;

    if (!group) return;

    const radios = Array.from(
      group.querySelectorAll<HTMLButtonElement>("[role='radio']"),
    );
    const current = radios.indexOf(event.currentTarget);

    if (current < 0) return;

    const is_rtl = document.documentElement.getAttribute("dir") === "rtl";
    const next = next_radio_index(event["key"], current, radios.length, is_rtl);

    if (next === null) return;

    event.preventDefault();
    radios[next].focus();
    radios[next].click();
  };

  return (
    <button
      aria-checked={is_active}
      className={`flex items-start gap-3 rounded-[var(--aster-radius-field,10px)] px-3.5 py-3 text-start transition-[background-color,box-shadow] duration-150 outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)]/50 ${
        is_active
          ? "bg-[color-mix(in_srgb,var(--accent-color)_10%,transparent)] shadow-[inset_0_0_0_1.5px_var(--accent-color)]"
          : "bg-[var(--aster-field-bg)] hover:bg-[var(--aster-field-hover)]"
      }`}
      role="radio"
      tabIndex={is_active ? 0 : -1}
      type="button"
      onClick={on_click}
      onKeyDown={handle_keydown}
    >
      <span
        aria-hidden="true"
        className={`mt-0.5 grid place-items-center w-4 h-4 shrink-0 rounded-full transition-colors ${
          is_active
            ? "bg-[var(--accent-color)]"
            : "shadow-[inset_0_0_0_1.5px_var(--text-muted)]"
        }`}
      >
        {is_active && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
      </span>
      <span className="min-w-0 flex flex-col gap-0.5">
        <span className="text-sm font-semibold leading-5 text-txt-primary">
          {title}
        </span>
        <span className="text-xs leading-[17px] text-txt-muted">
          {description}
        </span>
      </span>
    </button>
  );
}

interface IncomingMailSectionProps {
  editing_account: DecryptedExternalAccount | null;
  form_protocol: "imap" | "pop3";
  form_host: string;
  form_port: number;
  form_username: string;
  form_password: string;
  has_stored_password: boolean;
  form_use_tls: boolean;
  set_form_use_tls: (value: boolean) => void;
  show_password: boolean;
  set_show_password: (value: boolean) => void;
  handle_protocol_change: (protocol: "imap" | "pop3") => void;
  handle_host_change: (value: string) => void;
  handle_port_change: (value: string) => void;
  handle_username_change: (value: string) => void;
  handle_password_change: (value: string) => void;
  app_password_url?: string;
  t: TranslationFn;
}

export function IncomingMailSection({
  editing_account,
  form_protocol,
  form_host,
  form_port,
  form_username,
  form_password,
  has_stored_password,
  form_use_tls,
  set_form_use_tls,
  show_password,
  set_show_password,
  handle_protocol_change,
  handle_host_change,
  handle_port_change,
  handle_username_change,
  handle_password_change,
  app_password_url,
  t,
}: IncomingMailSectionProps) {
  const show_app_password_hint = !!app_password_url && !editing_account;
  const password_hint =
    has_stored_password || editing_account || show_app_password_hint ? (
      <>
        {has_stored_password ? (
          <p>{t("settings.keep_saved_password")}</p>
        ) : editing_account ? (
          <p>{t("settings.re_enter_password")}</p>
        ) : null}
        {show_app_password_hint && (
          <p>
            {t("settings.app_password_required")}{" "}
            <a
              className="font-medium text-[var(--accent-color)] hover:underline"
              href={app_password_url}
              rel="noreferrer noopener"
              target="_blank"
            >
              {t("settings.app_password_create_link")}
            </a>
          </p>
        )}
      </>
    ) : undefined;

  return (
    <IslandSection
      icon={<InboxArrowDownIcon />}
      title={t("settings.incoming_mail")}
    >
      <FieldGroup>
        <FormField
          label={t("settings.protocol")}
          label_id="ext-account-protocol-label"
        >
          <div
            aria-labelledby="ext-account-protocol-label"
            className="grid grid-cols-1 sm:grid-cols-2 gap-2"
            role="radiogroup"
          >
            <ProtocolCard
              description={t("settings.protocol_desc_imap")}
              is_active={form_protocol === "imap"}
              on_click={() => handle_protocol_change("imap")}
              title="IMAP"
            />
            <ProtocolCard
              description={t("settings.protocol_desc_pop3")}
              is_active={form_protocol === "pop3"}
              on_click={() => handle_protocol_change("pop3")}
              title="POP3"
            />
          </div>
        </FormField>
        <FormField
          id="ext-account-host"
          label={t("settings.server_host")}
          span={4}
        >
          <Input
            autoCapitalize="none"
            autoComplete="off"
            autoCorrect="off"
            className="aster_input_tonal w-full"
            id="ext-account-host"
            maxLength={253}
            placeholder={
              form_protocol === "imap" ? "imap.example.com" : "pop.example.com"
            }
            size="md"
            spellCheck={false}
            type="text"
            value={form_host}
            onChange={(e) => handle_host_change(e.target.value)}
          />
        </FormField>
        <FormField id="ext-account-port" label={t("settings.port")} span={2}>
          <Input
            className="aster_input_tonal w-full"
            id="ext-account-port"
            inputMode="numeric"
            max={65535}
            min={0}
            size="md"
            type="number"
            value={form_port === 0 ? "" : form_port}
            onChange={(e) => handle_port_change(e.target.value)}
          />
        </FormField>
        <FormField
          id="ext-account-username"
          label={t("settings.username")}
          span={3}
        >
          <Input
            autoCapitalize="none"
            autoComplete="username"
            autoCorrect="off"
            className="aster_input_tonal w-full"
            id="ext-account-username"
            maxLength={254}
            placeholder={t("settings.username_placeholder")}
            size="md"
            spellCheck={false}
            type="text"
            value={form_username}
            onChange={(e) => handle_username_change(e.target.value)}
          />
        </FormField>
        <FormField
          hint={password_hint}
          id="ext-account-password"
          label={t("settings.password")}
          span={3}
        >
          <PasswordInput
            hide_label={t("settings.hide_password_toggle")}
            id="ext-account-password"
            is_visible={show_password}
            on_change={handle_password_change}
            on_toggle_visible={() => set_show_password(!show_password)}
            show_label={t("settings.show_password_toggle")}
            value={form_password}
          />
        </FormField>
      </FieldGroup>
      <IslandDivider />
      <SettingToggleRow
        checked={form_use_tls}
        description={t("settings.ext_v2_tls_description")}
        label={t("settings.use_tls")}
        on_change={set_form_use_tls}
      />
    </IslandSection>
  );
}
