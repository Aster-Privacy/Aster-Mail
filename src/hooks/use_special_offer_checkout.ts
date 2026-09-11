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
import { useEffect, useMemo, useRef } from "react";

import {
  special_offer_checkout,
  type SpecialOfferCheckout,
} from "@/lib/special_offer";
import {
  refresh_special_offer_status,
  use_special_offer_status,
} from "@/stores/special_offer_status";

export function use_special_offer_checkout(
  current_plan_code?: string | null,
): SpecialOfferCheckout {
  const { status, is_loaded } = use_special_offer_status();
  const last_plan_code = useRef(current_plan_code);

  useEffect(() => {
    const previous = last_plan_code.current;

    last_plan_code.current = current_plan_code;

    if (previous && current_plan_code && previous !== current_plan_code) {
      void refresh_special_offer_status();
    }
  }, [current_plan_code]);

  const is_on_paid_plan = !!current_plan_code && current_plan_code !== "free";
  const is_available =
    is_loaded && status?.available === true && !is_on_paid_plan;

  return useMemo(() => special_offer_checkout(is_available), [is_available]);
}
