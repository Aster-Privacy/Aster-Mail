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

import {
  activate_subscription,
  clear_checkout_target,
  get_subscription,
  read_checkout_target,
} from "@/services/api/billing";
import { request_cache } from "@/services/api/request_cache";
import { invalidate_mail_stats } from "@/hooks/use_mail_stats";
import { show_toast } from "@/components/toast/simple_toast";
import { use_i18n } from "@/lib/i18n/context";
import { use_auth } from "@/contexts/auth_context";
import { ignore_error } from "@/lib/ignore_error";

const BILLING_RETURN_KEY = "aster_billing_return";
const MAX_ATTEMPTS = 8;

function read_key(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch (caught) {
    ignore_error("pages/mobile/mobile_billing_return_handler:read_key", caught);

    return null;
  }
}

function clear_key(key: string) {
  try {
    sessionStorage.removeItem(key);
  } catch (caught) {
    ignore_error("pages/mobile/mobile_billing_return_handler:clear_key", caught);
  }
}

export function MobileBillingReturnHandler() {
  const { t } = use_i18n();
  const { is_authenticated } = use_auth();
  const navigate = useNavigate();
  const handled = useRef(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const billing = params.get("billing");

    if (billing !== "success" && billing !== "cancelled") return;

    try {
      sessionStorage.setItem(BILLING_RETURN_KEY, billing);
    } catch (caught) {
      ignore_error("pages/mobile/mobile_billing_return_handler:stash", caught);
    }
    params.delete("billing");
    const query = params.toString();

    window.history.replaceState(
      {},
      "",
      window.location.pathname + (query ? `?${query}` : ""),
    );
  }, []);

  useEffect(() => {
    if (!is_authenticated || handled.current) return;

    const billing = read_key(BILLING_RETURN_KEY);

    if (!billing) return;

    handled.current = true;
    clear_key(BILLING_RETURN_KEY);

    if (billing === "cancelled") {
      clear_checkout_target();
      show_toast(t("settings.billing_checkout_cancelled"), "info");

      return;
    }

    void (async () => {
      request_cache.invalidate("/payments/v1");
      invalidate_mail_stats();
      try {
        await activate_subscription();
      } catch (caught) {
        ignore_error(
          "pages/mobile/mobile_billing_return_handler:activate",
          caught,
        );
      }

      const target = read_checkout_target()?.plan_code ?? null;

      clear_checkout_target();

      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        await new Promise((resolve) =>
          setTimeout(resolve, attempt === 0 ? 800 : 1500),
        );
        request_cache.invalidate("/payments/v1");
        const response = await get_subscription();
        const live = response.data?.plan.code;
        const activated = target
          ? live === target
          : Boolean(live) && live !== "free";

        if (response.data && activated) {
          request_cache.invalidate("/sync/v1");
          invalidate_mail_stats();
          window.dispatchEvent(new CustomEvent("aster:plan-changed"));
          show_toast(t("settings.checkout_welcome"), "success");
          navigate("/settings/billing");

          return;
        }
      }

      request_cache.invalidate("/payments/v1");
      request_cache.invalidate("/sync/v1");
      invalidate_mail_stats();
      window.dispatchEvent(new CustomEvent("aster:plan-changed"));
      show_toast(t("settings.payment_processing_delayed"), "info");
    })();
  }, [is_authenticated, navigate, t]);

  return null;
}
