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
  ServerStackIcon,
  EyeIcon,
  EyeSlashIcon,
} from "@heroicons/react/24/outline";
import { Checkbox } from "@aster/ui";

import { Input } from "@/components/ui/input";
import { render_toggle_button } from "@/components/settings/external_accounts/toggle_button";

interface IncomingMailSectionProps {
  editing_account: DecryptedExternalAccount | null;
  form_protocol: "imap" | "pop3";
  form_host: string;
  form_port: number;
  form_username: string;
  form_password: string;
  form_use_tls: boolean;
  set_form_use_tls: (value: boolean) => void;
  show_password: boolean;
  set_show_password: (value: boolean) => void;
  handle_protocol_change: (protocol: "imap" | "pop3") => void;
  handle_host_change: (value: string) => void;
  handle_port_change: (value: string) => void;
  handle_username_change: (value: string) => void;
  handle_password_change: (value: string) => void;
  t: TranslationFn;
}

export function IncomingMailSection({
  editing_account,
  form_protocol,
  form_host,
  form_port,
  form_username,
  form_password,
  form_use_tls,
  set_form_use_tls,
  show_password,
  set_show_password,
  handle_protocol_change,
  handle_host_change,
  handle_port_change,
  handle_username_change,
  handle_password_change,
  t,
}: IncomingMailSectionProps) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold flex items-center gap-2 text-txt-primary">
        <ServerStackIcon className="w-4 h-4 text-txt-muted" />
        {t("settings.incoming_mail")}
      </h3>
      <div>
        <label
          className="text-xs font-medium mb-1 block text-txt-muted"
          id="ext-account-protocol-label"
        >
          {t("settings.protocol")}
        </label>
        <div
          aria-labelledby="ext-account-protocol-label"
          className="inline-flex p-1 rounded-lg bg-surf-secondary"
          role="radiogroup"
        >
          {render_toggle_button(
            form_protocol === "imap",
            "IMAP",
            () => handle_protocol_change("imap"),
            "protocol-imap",
          )}
          {render_toggle_button(
            form_protocol === "pop3",
            "POP3",
            () => handle_protocol_change("pop3"),
            "protocol-pop3",
          )}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2">
          <label
            className="text-xs font-medium mb-1 block text-txt-muted"
            htmlFor="ext-account-host"
          >
            {t("settings.server_host")}
          </label>
          <Input
            autoComplete="off"
            className="w-full"
            id="ext-account-host"
            maxLength={253}
            placeholder={
              form_protocol === "imap" ? "imap.example.com" : "pop.example.com"
            }
            type="text"
            value={form_host}
            onChange={(e) => handle_host_change(e.target.value)}
          />
        </div>
        <div>
          <label
            className="text-xs font-medium mb-1 block text-txt-muted"
            htmlFor="ext-account-port"
          >
            {t("settings.port")}
          </label>
          <Input
            className="w-full"
            id="ext-account-port"
            max={65535}
            min={1}
            type="number"
            value={form_port}
            onChange={(e) => handle_port_change(e.target.value)}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label
            className="text-xs font-medium mb-1 block text-txt-muted"
            htmlFor="ext-account-username"
          >
            {t("settings.username")}
          </label>
          <Input
            autoComplete="username"
            className="w-full"
            id="ext-account-username"
            maxLength={254}
            placeholder={t("settings.username_placeholder")}
            type="text"
            value={form_username}
            onChange={(e) => handle_username_change(e.target.value)}
          />
        </div>
        <div>
          <label
            className="text-xs font-medium mb-1 block text-txt-muted"
            htmlFor="ext-account-password"
          >
            {t("settings.password")}
          </label>
          <div className="relative">
            <Input
              autoComplete="current-password"
              className="w-full pr-10"
              id="ext-account-password"
              placeholder={
                editing_account ? t("settings.re_enter_password") : ""
              }
              type={show_password ? "text" : "password"}
              value={form_password}
              onChange={(e) => handle_password_change(e.target.value)}
            />
            <button
              aria-label={
                show_password
                  ? t("settings.hide_password_toggle")
                  : t("settings.show_password_toggle")
              }
              className="absolute right-2 top-1/2 -translate-y-1/2"
              type="button"
              onClick={() => set_show_password(!show_password)}
            >
              {show_password ? (
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
          checked={form_use_tls}
          id="ext-account-use-tls"
          onCheckedChange={(checked) => set_form_use_tls(checked === true)}
        />
        <label
          className="text-sm text-txt-primary"
          htmlFor="ext-account-use-tls"
        >
          {t("settings.use_tls")}
        </label>
      </div>
    </div>
  );
}
