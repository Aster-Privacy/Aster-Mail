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
import { ShieldCheckIcon } from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";

import { use_i18n } from "@/lib/i18n/context";
import {
  get_twin_address,
  type TwinAddressResponse,
} from "@/services/api/aliases";

interface TwinAddressCardProps {
  refresh_token: number;
  on_claim: (local_part: string, domain: string) => void;
}

export function TwinAddressCard({
  refresh_token,
  on_claim,
}: TwinAddressCardProps) {
  const { t } = use_i18n();
  const [twin, set_twin] = useState<TwinAddressResponse | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const response = await get_twin_address();

        if (cancelled) return;

        set_twin(response.data ?? null);
      } catch {
        if (cancelled) return;

        set_twin(null);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [refresh_token]);

  if (!twin) return null;

  if (twin.state !== "reserved" && twin.state !== "available") return null;

  const description =
    twin.state === "reserved"
      ? t("settings.twin_address_reserved_description", {
          address: twin.address,
        })
      : t("settings.twin_address_available_description", {
          address: twin.address,
        });

  return (
    <div className="mb-3 rounded-xl border border-edge-secondary bg-surf-secondary p-3">
      <div className="flex items-start gap-3">
        <ShieldCheckIcon className="mt-0.5 h-5 w-5 shrink-0 text-txt-secondary" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-txt-primary">
            {t("settings.twin_address_title")}
          </p>
          <p className="mt-1 break-words text-sm text-txt-muted">{description}</p>
        </div>
        <Button
          className="shrink-0 self-center"
          size="sm"
          variant="secondary"
          onClick={() => on_claim(twin.local_part, twin.domain)}
        >
          {t("settings.twin_address_create")}
        </Button>
      </div>
    </div>
  );
}
