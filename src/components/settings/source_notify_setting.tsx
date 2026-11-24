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
import { InboxArrowDownIcon } from "@heroicons/react/24/outline";
import { IslandSection, SettingControlRow } from "@aster/ui";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { use_source_notify } from "@/hooks/use_source_notify";
import { use_i18n } from "@/lib/i18n/context";

export function SourceNotifySetting() {
  const { t } = use_i18n();
  const { rows, is_saving, choice_for, set_choice } = use_source_notify();

  if (rows.length === 0) return null;

  return (
    <IslandSection
      description={t("settings.ext_v2_notify_sources_description")}
      icon={<InboxArrowDownIcon />}
      title={t("settings.ext_v2_notify_sources_title")}
    >
      {rows.map((row) => (
        <SettingControlRow
          key={row.value}
          control={
            <Select
              disabled={is_saving}
              value={choice_for(row.value)}
              onValueChange={(value) =>
                void set_choice(row.value, value === "none" ? "none" : "all")
              }
            >
              <SelectTrigger aria-label={row.label} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  {t("settings.ext_v2_notify_source_all")}
                </SelectItem>
                <SelectItem value="none">
                  {t("settings.ext_v2_notify_source_none")}
                </SelectItem>
              </SelectContent>
            </Select>
          }
          label={row.label}
        />
      ))}
    </IslandSection>
  );
}
