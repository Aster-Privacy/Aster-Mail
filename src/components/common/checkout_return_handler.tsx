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

import { request_cache } from "@/services/api/request_cache";
import { invalidate_mail_stats } from "@/hooks/use_mail_stats";
import {
  show_toast,
  TOAST_DURATION_BILLING_MS,
} from "@/components/toast/simple_toast";
import { use_i18n } from "@/lib/i18n/context";
import type { TranslationKey } from "@/lib/i18n/types";
import { use_auth } from "@/contexts/auth_context";
import { ignore_error } from "@/lib/ignore_error";

const RETURN_KEY = "aster_checkout_return";

interface ReturnFlow {
  param: string;
  success_key: TranslationKey;
  cancelled_key: TranslationKey | null;
}

const FLOWS: ReturnFlow[] = [
  {
    param: "addon_purchase",
    success_key: "settings.addon_purchased",
    cancelled_key: null,
  },
  {
    param: "crypto",
    success_key: "settings.crypto_success_toast",
    cancelled_key: "settings.crypto_cancelled_toast",
  },
  {
    param: "family",
    success_key: "settings.checkout_welcome",
    cancelled_key: "settings.billing_checkout_cancelled",
  },
];

export function CheckoutReturnHandler() {
  const { t } = use_i18n();
  const { is_authenticated } = use_auth();
  const handled = useRef(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    let stashed: string | null = null;

    for (const flow of FLOWS) {
      const outcome = params.get(flow.param);

      if (outcome !== "success" && outcome !== "cancelled") continue;

      stashed = `${flow.param}:${outcome}`;
      params.delete(flow.param);
    }

    if (!stashed) return;

    try {
      sessionStorage.setItem(RETURN_KEY, stashed);
    } catch (caught) {
      ignore_error("components/common/checkout_return_handler:stash", caught);
    }

    const query = params.toString();

    window.history.replaceState(
      {},
      "",
      window.location.pathname + (query ? `?${query}` : ""),
    );
  }, []);

  useEffect(() => {
    if (!is_authenticated || handled.current) return;

    let stashed: string | null = null;

    try {
      stashed = sessionStorage.getItem(RETURN_KEY);
      if (stashed) sessionStorage.removeItem(RETURN_KEY);
    } catch (caught) {
      ignore_error("components/common/checkout_return_handler:consume", caught);
    }

    if (!stashed) return;

    handled.current = true;

    const [param, outcome] = stashed.split(":");
    const flow = FLOWS.find((candidate) => candidate.param === param);

    if (!flow) return;

    if (outcome !== "success") {
      if (flow.cancelled_key)
        show_toast(t(flow.cancelled_key), "info", TOAST_DURATION_BILLING_MS);

      return;
    }

    request_cache.invalidate("/payments/v1");
    request_cache.invalidate("/sync/v1");
    invalidate_mail_stats();
    window.dispatchEvent(new CustomEvent("aster:plan-changed"));
    show_toast(t(flow.success_key), "success");
  }, [is_authenticated, t]);

  return null;
}
