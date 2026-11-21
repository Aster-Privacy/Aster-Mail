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
import type { SyncFrequency } from "@/services/api/external_accounts";
import type { TranslationFn } from "@/components/settings/external_accounts/form_types";

import { ArrowPathIcon } from "@heroicons/react/24/outline";
import { IslandSection, SettingControlRow, SettingToggleRow } from "@aster/ui";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface SyncSettingsSectionProps {
  form_sync_frequency: SyncFrequency;
  set_form_sync_frequency: (value: SyncFrequency) => void;
  sync_frequency_options: { value: SyncFrequency; label: string }[];
  is_editing: boolean;
  form_import_existing: boolean;
  set_form_import_existing: (value: boolean) => void;
  t: TranslationFn;
}

export function SyncSettingsSection({
  form_sync_frequency,
  set_form_sync_frequency,
  sync_frequency_options,
  is_editing,
  form_import_existing,
  set_form_import_existing,
  t,
}: SyncSettingsSectionProps) {
  return (
    <IslandSection
      divided
      icon={<ArrowPathIcon />}
      title={t("settings.sync_settings")}
    >
      <SettingControlRow
        control={
          <Select
            value={form_sync_frequency}
            onValueChange={(value: string) =>
              set_form_sync_frequency(value as SyncFrequency)
            }
          >
            <SelectTrigger
              aria-label={t("settings.sync_frequency")}
              className="w-full"
              id="ext-account-sync-freq"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {sync_frequency_options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
        description={t("settings.ext_v2_sync_frequency_description")}
        label={t("settings.sync_frequency")}
      />
      {!is_editing && (
        <SettingToggleRow
          checked={form_import_existing}
          description={
            form_import_existing
              ? t("settings.import_existing_mail_on")
              : t("settings.import_existing_mail_off")
          }
          label={t("settings.import_existing_mail")}
          on_change={set_form_import_existing}
        />
      )}
    </IslandSection>
  );
}
