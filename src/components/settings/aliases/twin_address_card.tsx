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
import type { TwinSibling } from "@/services/api/aliases";

import { XMarkIcon } from "@heroicons/react/24/outline";
import { Island, IslandIconButton, PillButton } from "@aster/ui";

import { use_preferences } from "@/contexts/preferences_context";
import { use_i18n } from "@/lib/i18n/context";

interface TwinAddressCardProps {
  siblings: TwinSibling[];
  on_claim: (local_part: string, domain: string) => void;
}

export function TwinAddressCard({ siblings, on_claim }: TwinAddressCardProps) {
  const { t } = use_i18n();
  const { preferences, update_preference } = use_preferences();

  if (siblings.length === 0 || preferences.twin_address_banner_dismissed) {
    return null;
  }

  const primary = siblings[0];
  const multiple = siblings.length > 1;
  const label = multiple ? primary.local_part : primary.address;
  const status = multiple
    ? t("settings.twin_address_reserved_multiple", { count: siblings.length })
    : primary.state === "reserved"
      ? t("settings.twin_address_reserved")
      : t("settings.twin_address_available");

  return (
    <Island className="mb-2" padding="md">
      <div className="flex items-center gap-3">
        <p className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 text-sm">
          <span
            className="min-w-0 max-w-full truncate font-medium text-txt-primary"
            title={label}
          >
            {label}
          </span>
          <span className="text-txt-muted">{status}</span>
        </p>
        <div className="flex shrink-0 items-center gap-1">
          <PillButton
            size="sm"
            variant="tonal"
            onClick={() => on_claim(primary.local_part, primary.domain)}
          >
            {t("settings.twin_address_create")}
          </PillButton>
          <IslandIconButton
            label={t("settings.twin_address_dismiss")}
            size="sm"
            onClick={() =>
              update_preference("twin_address_banner_dismissed", true, true)
            }
          >
            <XMarkIcon className="h-4 w-4" />
          </IslandIconButton>
        </div>
      </div>
    </Island>
  );
}
