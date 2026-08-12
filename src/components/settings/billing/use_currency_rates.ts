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
import { useEffect, useReducer } from "react";

import { get_currency_rates } from "@/services/api/billing";
import {
  set_currency_rates,
  subscribe_currency_rates,
} from "@/components/settings/billing/billing_constants";

const RATE_REFRESH_MS = 6 * 60 * 60 * 1000;

let last_hydrated_at = 0;
let in_flight: Promise<void> | null = null;

export function hydrate_currency_rates(): Promise<void> {
  if (in_flight) return in_flight;

  if (last_hydrated_at && Date.now() - last_hydrated_at < RATE_REFRESH_MS) {
    return Promise.resolve();
  }

  in_flight = get_currency_rates()
    .then((response) => {
      const rates = response.data?.rates;

      if (rates && Object.keys(rates).length > 0) {
        set_currency_rates(rates);
        last_hydrated_at = Date.now();
      }
    })
    .catch(() => undefined)
    .finally(() => {
      in_flight = null;
    });

  return in_flight;
}

export function use_currency_rates(): void {
  const [, force_render] = useReducer((count: number) => count + 1, 0);

  useEffect(() => subscribe_currency_rates(force_render), []);

  useEffect(() => {
    void hydrate_currency_rates();
  }, []);
}
