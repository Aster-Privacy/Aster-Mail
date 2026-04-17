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
import type { TlsMethod } from "@/components/settings/hooks/use_external_accounts";
import type { TranslationFn } from "@/components/settings/external_accounts/form_types";

import {
  ChevronDownIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";
import { Checkbox } from "@aster/ui";

import { Input } from "@/components/ui/input";
import { render_toggle_button } from "@/components/settings/external_accounts/toggle_button";

interface AdvancedSettingsSectionProps {
  show_advanced: boolean;
  set_show_advanced: (value: boolean) => void;
  form_tls_method: TlsMethod;
  set_form_tls_method: (value: TlsMethod) => void;
  tls_method_options: { value: TlsMethod; label: string }[];
  form_connection_timeout: number;
  form_archive_sent: boolean;
  set_form_archive_sent: (value: boolean) => void;
  form_delete_after_fetch: boolean;
  set_form_delete_after_fetch: (value: boolean) => void;
  handle_connection_timeout_change: (value: string) => void;
  t: TranslationFn;
}

export function AdvancedSettingsSection({
  show_advanced,
  set_show_advanced,
  form_tls_method,
  set_form_tls_method,
  tls_method_options,
  form_connection_timeout,
  form_archive_sent,
  set_form_archive_sent,
  form_delete_after_fetch,
  set_form_delete_after_fetch,
  handle_connection_timeout_change,
  t,
}: AdvancedSettingsSectionProps) {
  return (
    <div className="space-y-3">
      <button
        aria-expanded={show_advanced}
        className="flex items-center gap-2 w-full text-sm font-semibold py-1 transition-colors text-txt-primary"
        type="button"
        onClick={() => set_show_advanced(!show_advanced)}
      >
        <ChevronDownIcon
          className="w-4 h-4 text-txt-muted"
          style={{
            transform: show_advanced ? "rotate(180deg)" : "rotate(0deg)",
          }}
        />
        {t("settings.advanced_settings")}
      </button>
      {show_advanced && (
        <div className="space-y-4 pl-6">
          <div>
            <label
              className="text-xs font-medium mb-1 block text-txt-muted"
              id="ext-account-tls-method-label"
            >
              {t("settings.tls_method")}
            </label>
            <div
              aria-labelledby="ext-account-tls-method-label"
              className="inline-flex p-1 rounded-lg bg-surf-secondary"
              role="radiogroup"
            >
              {tls_method_options.map((option) =>
                render_toggle_button(
                  form_tls_method === option.value,
                  option.label,
                  () => set_form_tls_method(option.value),
                  `tls-method-${option.value}`,
                ),
              )}
            </div>
          </div>
          <div>
            <label
              className="text-xs font-medium mb-1 block text-txt-muted"
              htmlFor="ext-account-timeout"
            >
              {t("settings.connection_timeout")}
            </label>
            <Input
              className="w-24"
              id="ext-account-timeout"
              max={120}
              min={5}
              type="number"
              value={form_connection_timeout}
              onChange={(e) => handle_connection_timeout_change(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              checked={form_archive_sent}
              id="ext-account-archive-sent"
              onCheckedChange={(checked) =>
                set_form_archive_sent(checked === true)
              }
            />
            <label
              className="text-sm text-txt-primary"
              htmlFor="ext-account-archive-sent"
            >
              {t("settings.archive_sent_label")}
            </label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              checked={form_delete_after_fetch}
              id="ext-account-delete-after"
              onCheckedChange={(checked) =>
                set_form_delete_after_fetch(checked === true)
              }
            />
            <label
              className={`text-sm ${form_delete_after_fetch ? "text-red-500" : "text-txt-primary"}`}
              htmlFor="ext-account-delete-after"
            >
              {t("settings.delete_after_fetch_label")}
            </label>
            {form_delete_after_fetch && (
              <ExclamationTriangleIcon className="w-4 h-4 flex-shrink-0 text-red-500" />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
