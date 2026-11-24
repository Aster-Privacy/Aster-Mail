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
import type { TlsMethod } from "@/components/settings/hooks/use_external_accounts";
import type { TranslationFn } from "@/components/settings/external_accounts/form_types";

import {
  AdjustmentsHorizontalIcon,
  ChevronDownIcon,
} from "@heroicons/react/24/outline";
import { Island, IslandRow, SettingControlRow } from "@aster/ui";
import { useState } from "react";

import { commit_on_enter } from "@/lib/commit_on_enter";
import { Input } from "@/components/ui/input";
import { render_toggle_button } from "@/components/settings/external_accounts/toggle_button";

interface AdvancedSettingsSectionProps {
  show_advanced: boolean;
  set_show_advanced: (value: boolean) => void;
  form_tls_method: TlsMethod;
  set_form_tls_method: (value: TlsMethod) => void;
  tls_method_options: { value: TlsMethod; label: string }[];
  form_connection_timeout: number;
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
  handle_connection_timeout_change,
  t,
}: AdvancedSettingsSectionProps) {
  const [timeout_input, set_timeout_input] = useState<string | null>(null);

  return (
    <Island divided className="overflow-hidden">
      <IslandRow
        aria-expanded={show_advanced}
        chevron={false}
        description={t("settings.ext_v2_advanced_description")}
        icon={<AdjustmentsHorizontalIcon />}
        label={t("settings.advanced_settings")}
        on_press={() => set_show_advanced(!show_advanced)}
        trailing={
          <ChevronDownIcon
            aria-hidden="true"
            className={`w-4 h-4 text-txt-muted transition-transform duration-200 ${
              show_advanced ? "rotate-180" : ""
            }`}
          />
        }
      />
      {show_advanced && (
        <SettingControlRow
          control={
            <div
              aria-labelledby="ext-account-tls-method-label"
              className="inline-flex gap-0.5 p-1 rounded-full bg-[var(--aster-segmented-track)]"
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
          }
          control_width="auto"
          description={
            <span id="ext-account-tls-method-label">
              {t("settings.ext_v2_tls_method_description")}
            </span>
          }
          label={t("settings.tls_method")}
        />
      )}
      {show_advanced && (
        <SettingControlRow
          control={
            <Input
              aria-label={t("settings.connection_timeout")}
              className="aster_input_tonal w-24"
              id="ext-account-timeout"
              inputMode="numeric"
              max={120}
              min={5}
              size="md"
              type="number"
              value={timeout_input ?? form_connection_timeout}
              onBlur={(e) => {
                handle_connection_timeout_change(e.target.value);
                set_timeout_input(null);
              }}
              onChange={(e) => set_timeout_input(e.target.value)}
              onFocus={(e) => set_timeout_input(e.target.value)}
              onKeyDown={commit_on_enter}
            />
          }
          control_width="auto"
          description={t("settings.ext_v2_timeout_description")}
          label={t("settings.connection_timeout")}
        />
      )}
    </Island>
  );
}
