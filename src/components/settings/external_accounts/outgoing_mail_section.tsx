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

import {
  EnvelopeIcon,
  EyeIcon,
  EyeSlashIcon,
} from "@heroicons/react/24/outline";
import { Checkbox } from "@aster/ui";

import { Input } from "@/components/ui/input";

interface OutgoingMailSectionProps {
  editing_account: DecryptedExternalAccount | null;
  form_smtp_host: string;
  form_smtp_port: number;
  form_smtp_username: string;
  form_smtp_password: string;
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
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold flex items-center gap-2 text-txt-primary">
        <EnvelopeIcon className="w-4 h-4 text-txt-muted" />
        {t("settings.outgoing_mail_smtp")}
      </h3>
      <div className="flex items-center gap-2">
        <Checkbox
          checked={smtp_same_as_incoming}
          id="ext-account-smtp-same"
          onCheckedChange={(v) => handle_smtp_same_toggle(v === true)}
        />
        <label
          className="text-sm text-txt-primary"
          htmlFor="ext-account-smtp-same"
        >
          {t("settings.same_as_incoming")}
        </label>
      </div>
      {!smtp_same_as_incoming && (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label
                className="text-xs font-medium mb-1 block text-txt-muted"
                htmlFor="ext-account-smtp-host"
              >
                {t("settings.smtp_server_host")}
              </label>
              <Input
                autoComplete="off"
                className="w-full"
                id="ext-account-smtp-host"
                maxLength={253}
                placeholder="smtp.example.com"
                type="text"
                value={form_smtp_host}
                onChange={(e) => handle_smtp_host_change(e.target.value)}
              />
            </div>
            <div>
              <label
                className="text-xs font-medium mb-1 block text-txt-muted"
                htmlFor="ext-account-smtp-port"
              >
                {t("settings.port")}
              </label>
              <Input
                className="w-full"
                id="ext-account-smtp-port"
                max={65535}
                min={1}
                type="number"
                value={form_smtp_port}
                onChange={(e) => handle_smtp_port_change(e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                className="text-xs font-medium mb-1 block text-txt-muted"
                htmlFor="ext-account-smtp-username"
              >
                {t("settings.smtp_username")}
              </label>
              <Input
                autoComplete="username"
                className="w-full"
                id="ext-account-smtp-username"
                maxLength={254}
                placeholder="user@example.com"
                type="text"
                value={form_smtp_username}
                onChange={(e) => handle_smtp_username_change(e.target.value)}
              />
            </div>
            <div>
              <label
                className="text-xs font-medium mb-1 block text-txt-muted"
                htmlFor="ext-account-smtp-password"
              >
                {t("settings.smtp_password")}
              </label>
              <div className="relative">
                <Input
                  autoComplete="current-password"
                  className="w-full pr-10"
                  id="ext-account-smtp-password"
                  placeholder={
                    editing_account ? t("settings.re_enter_password") : ""
                  }
                  type={show_smtp_password ? "text" : "password"}
                  value={form_smtp_password}
                  onChange={(e) => handle_smtp_password_change(e.target.value)}
                />
                <button
                  aria-label={
                    show_smtp_password
                      ? t("settings.hide_smtp_password")
                      : t("settings.show_smtp_password")
                  }
                  className="absolute right-2 top-1/2 -translate-y-1/2"
                  type="button"
                  onClick={() => set_show_smtp_password(!show_smtp_password)}
                >
                  {show_smtp_password ? (
                    <EyeSlashIcon className="w-4 h-4 text-txt-muted" />
                  ) : (
                    <EyeIcon className="w-4 h-4 text-txt-muted" />
                  )}
                </button>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              checked={form_smtp_use_tls}
              id="ext-account-smtp-use-tls"
              onCheckedChange={(checked) =>
                set_form_smtp_use_tls(checked === true)
              }
            />
            <label
              className="text-sm text-txt-primary"
              htmlFor="ext-account-smtp-use-tls"
            >
              {t("settings.use_tls")}
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
