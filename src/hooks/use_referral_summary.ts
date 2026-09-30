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
import { useCallback, useEffect, useState } from "react";

import { get_referral_info, type ReferralInfo } from "@/services/api/billing";
import { ignore_error } from "@/lib/ignore_error";

let cached_info: ReferralInfo | null = null;
let in_flight: Promise<ReferralInfo | null> | null = null;
const listeners = new Set<(info: ReferralInfo | null) => void>();

async function load_referral_info(): Promise<ReferralInfo | null> {
  if (in_flight) return in_flight;

  in_flight = get_referral_info()
    .then((res) => res.data ?? null)
    .catch((caught) => {
      ignore_error("hooks/use_referral_summary:load_referral_info", caught);

      return null;
    })
    .then((info) => {
      cached_info = info;
      in_flight = null;
      listeners.forEach((listener) => listener(info));

      return info;
    });

  return in_flight;
}

export function invalidate_referral_summary(): void {
  cached_info = null;
  in_flight = null;
  void load_referral_info();
}

export function use_referral_summary() {
  const [info, set_info] = useState<ReferralInfo | null>(cached_info);

  useEffect(() => {
    listeners.add(set_info);

    if (!cached_info) void load_referral_info();

    return () => {
      listeners.delete(set_info);
    };
  }, []);

  const refresh = useCallback(() => {
    invalidate_referral_summary();
  }, []);

  return { referral_info: info, refresh };
}
