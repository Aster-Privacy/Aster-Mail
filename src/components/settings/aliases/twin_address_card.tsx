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
import { useEffect, useState } from "react";
import { ShieldCheckIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";

import { use_preferences } from "@/contexts/preferences_context";
import { use_i18n } from "@/lib/i18n/context";
import {
  get_twin_address,
  type TwinAddressResponse,
  type TwinSibling,
} from "@/services/api/aliases";

interface TwinAddressCardProps {
  refresh_token: number;
  on_claim: (local_part: string, domain: string) => void;
}

let cached_twin: TwinAddressResponse | null = null;
let cached_twin_loaded = false;

function claimable_siblings(twin: TwinAddressResponse | null): TwinSibling[] {
  if (!twin) return [];

  const all: TwinSibling[] =
    twin.siblings && twin.siblings.length > 0
      ? twin.siblings
      : [
          {
            address: twin.address,
            domain: twin.domain,
            local_part: twin.local_part,
            state: twin.state,
          },
        ];

  return all.filter(
    (sibling) => sibling.state === "reserved" || sibling.state === "available",
  );
}

export function TwinAddressCard({
  refresh_token,
  on_claim,
}: TwinAddressCardProps) {
  const { t } = use_i18n();
  const { preferences, update_preference } = use_preferences();
  const [twin, set_twin] = useState<TwinAddressResponse | null>(cached_twin);
  const [loaded, set_loaded] = useState(cached_twin_loaded);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const response = await get_twin_address();

        if (cancelled) return;

        cached_twin = response.data ?? null;
      } catch {
        if (cancelled) return;

        cached_twin = null;
      }

      cached_twin_loaded = true;
      set_twin(cached_twin);
      set_loaded(true);
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [refresh_token]);

  const siblings = claimable_siblings(twin);

  if (preferences.twin_address_banner_dismissed) return null;

  if (!loaded) {
    return (
      <div
        aria-hidden="true"
        className="mb-3 h-[74px] animate-pulse rounded-xl bg-surf-secondary"
      />
    );
  }

  if (siblings.length === 0) return null;

  const primary = siblings[0];
  const multiple = siblings.length > 1;

  return (
    <div className="mb-3 rounded-xl border border-edge-secondary bg-surf-secondary p-3">
      <div className="flex items-start gap-3">
        <ShieldCheckIcon className="mt-0.5 h-5 w-5 shrink-0 text-txt-secondary" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-txt-primary">
            {multiple
              ? t("settings.twin_address_title_multiple")
              : t("settings.twin_address_title")}
          </p>
          <p className="mt-1 break-words text-sm text-txt-muted">
            {multiple
              ? t("settings.twin_address_multiple_description", {
                  local_part: primary.local_part,
                  count: siblings.length,
                })
              : primary.state === "reserved"
                ? t("settings.twin_address_reserved_description", {
                    address: primary.address,
                  })
                : t("settings.twin_address_available_description", {
                    address: primary.address,
                  })}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1 self-center">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => on_claim(primary.local_part, primary.domain)}
          >
            {t("settings.twin_address_create")}
          </Button>
          <button
            aria-label={t("settings.twin_address_dismiss")}
            className="rounded-lg p-1.5 text-txt-muted transition-colors hover:bg-surf-tertiary hover:text-txt-primary"
            type="button"
            onClick={() =>
              update_preference("twin_address_banner_dismissed", true, true)
            }
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
