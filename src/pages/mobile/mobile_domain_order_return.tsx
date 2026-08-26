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
import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";

import { use_auth } from "@/contexts/auth_context";
import { ignore_error } from "@/lib/ignore_error";

const PENDING_ORDER_KEY = "aster_pending_domain_order";

export function MobileDomainOrderReturn() {
  const { is_authenticated } = use_auth();
  const navigate = useNavigate();
  const handled = useRef(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const order_id = params.get("domain_order");

    if (!order_id || params.get("cancelled") === "1") return;

    try {
      sessionStorage.setItem(PENDING_ORDER_KEY, order_id);
    } catch (caught) {
      ignore_error("pages/mobile/mobile_domain_order_return:stash", caught);
    }
  }, []);

  useEffect(() => {
    if (!is_authenticated || handled.current) return;

    let pending: string | null = null;

    try {
      pending = sessionStorage.getItem(PENDING_ORDER_KEY);
    } catch (caught) {
      ignore_error("pages/mobile/mobile_domain_order_return:read", caught);
    }

    if (!pending) return;

    handled.current = true;
    navigate("/settings/aliases");
  }, [is_authenticated, navigate]);

  return null;
}
