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
import { useMemo } from "react";

import {
  special_offer_checkout,
  type SpecialOfferCheckout,
} from "@/lib/special_offer";
import { use_special_offer_status } from "@/stores/special_offer_status";

export function use_special_offer_checkout(): SpecialOfferCheckout {
  const { status, is_loaded } = use_special_offer_status();
  const is_available = is_loaded && status?.available === true;

  return useMemo(() => special_offer_checkout(is_available), [is_available]);
}
