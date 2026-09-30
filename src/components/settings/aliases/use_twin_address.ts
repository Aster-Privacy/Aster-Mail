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

import { ignore_error } from "@/lib/ignore_error";
import {
  get_twin_address,
  type TwinAddressResponse,
  type TwinSibling,
} from "@/services/api/aliases";

const cache_key = "aster_twin_address_v1";

let cached_twin: TwinAddressResponse | null = null;
let cached_twin_loaded = false;

function read_session_cache(): boolean {
  if (cached_twin_loaded) return true;

  try {
    const raw = sessionStorage.getItem(cache_key);

    if (raw === null) return false;

    cached_twin = JSON.parse(raw) as TwinAddressResponse | null;
    cached_twin_loaded = true;

    return true;
  } catch (caught) {
    ignore_error(
      "components/settings/aliases/use_twin_address:read_session_cache",
      caught,
    );

    return false;
  }
}

function write_session_cache(value: TwinAddressResponse | null) {
  try {
    sessionStorage.setItem(cache_key, JSON.stringify(value));
  } catch (caught) {
    ignore_error(
      "components/settings/aliases/use_twin_address:write_session_cache",
      caught,
    );
  }
}

export function claimable_siblings(
  twin: TwinAddressResponse | null,
): TwinSibling[] {
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

export interface TwinAddressState {
  twin: TwinAddressResponse | null;
  siblings: TwinSibling[];
}

export function use_twin_address(refresh_token: number): TwinAddressState {
  const had_cache = read_session_cache();
  const [is_visible] = useState(had_cache);
  const [twin, set_twin] = useState<TwinAddressResponse | null>(cached_twin);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      let value: TwinAddressResponse | null = null;

      try {
        const response = await get_twin_address();

        value = response.data ?? null;
      } catch (caught) {
        ignore_error(
          "components/settings/aliases/use_twin_address:load",
          caught,
        );
      }

      cached_twin = value;
      cached_twin_loaded = true;
      write_session_cache(value);

      if (cancelled) return;

      set_twin(value);
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [refresh_token]);

  return {
    twin,
    siblings: is_visible ? claimable_siblings(twin) : [],
  };
}
