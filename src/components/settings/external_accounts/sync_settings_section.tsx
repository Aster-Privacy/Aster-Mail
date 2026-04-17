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
import type { SyncFrequency } from "@/services/api/external_accounts";
import type { TranslationFn } from "@/components/settings/external_accounts/form_types";

import { ArrowPathIcon } from "@heroicons/react/24/outline";

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
  t: TranslationFn;
}

export function SyncSettingsSection({
  form_sync_frequency,
  set_form_sync_frequency,
  sync_frequency_options,
  t,
}: SyncSettingsSectionProps) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold flex items-center gap-2 text-txt-primary">
        <ArrowPathIcon className="w-4 h-4 text-txt-muted" />
        {t("settings.sync_settings")}
      </h3>
      <div>
        <label
          className="text-xs font-medium mb-1 block text-txt-muted"
          htmlFor="ext-account-sync-freq"
          id="ext-account-sync-freq-label"
        >
          {t("settings.sync_frequency")}
        </label>
        <Select
          value={form_sync_frequency}
          onValueChange={(value: string) =>
            set_form_sync_frequency(value as SyncFrequency)
          }
        >
          <SelectTrigger className="w-40" id="ext-account-sync-freq">
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
      </div>
    </div>
  );
}
