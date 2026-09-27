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
import { useCallback, useEffect, useRef, useState } from "react";

import {
  type BillingHistoryItem,
  get_billing_history,
  get_subscription,
  reactivate_subscription,
} from "@/services/api/billing";
import { api_client } from "@/services/api/client";
import { request_cache } from "@/services/api/request_cache";
import { get_current_account_id } from "@/services/account_manager";
import { invalidate_mail_stats } from "@/hooks/use_mail_stats";
import { show_upgrade_plans } from "@/stores/upgrade_store";
import { show_special_offer } from "@/stores/special_offer_store";
import { get_special_offer_status_snapshot } from "@/stores/special_offer_status";
import { is_special_offer_available } from "@/lib/special_offer";
import { show_toast } from "@/components/toast/simple_toast";
import { server_error_text } from "@/components/settings/billing/server_error_text";
import { use_i18n } from "@/lib/i18n/context";

type ResubscribeKind = "reactivate" | "choose" | null;

const WIN_BACK_WINDOW_MS = 60 * 24 * 60 * 60 * 1000;

let cached_kind: ResubscribeKind = null;
let cached_account_id: string | null = null;
let kind_request_in_flight: {
  account_id: string | null;
  promise: Promise<ResubscribeKind>;
} | null = null;
const listeners = new Set<(kind: ResubscribeKind) => void>();

function publish(kind: ResubscribeKind, account_id: string | null): void {
  cached_kind = kind;
  cached_account_id = account_id;
  listeners.forEach((listener) => listener(kind));
}

function ended_recently(item: BillingHistoryItem, now: number): boolean {
  const ended_at = Date.parse(item.period_end ?? item.created_at);

  if (Number.isNaN(ended_at)) return false;

  return Math.min(ended_at, now) >= now - WIN_BACK_WINDOW_MS;
}

async function load_resubscribe_kind(): Promise<ResubscribeKind> {
  const subscription = (await get_subscription()).data;

  if (!subscription) throw new Error("subscription unavailable");
  if (subscription.cancel_at_period_end && subscription.has_stripe_subscription)
    return "reactivate";
  if (subscription.plan.code !== "free") return null;

  const history = (await get_billing_history(1, 20)).data;

  if (!history) throw new Error("billing history unavailable");

  const now = Date.now();
  const churned_recently = history.items.some(
    (item) => item.status === "paid" && ended_recently(item, now),
  );

  return churned_recently ? "choose" : null;
}

async function refresh_resubscribe_kind(): Promise<void> {
  if (!api_client.is_authenticated()) {
    publish(null, null);

    return;
  }

  const account_id = await get_current_account_id();

  if (account_id !== cached_account_id) publish(null, account_id);
  if (kind_request_in_flight?.account_id !== account_id) {
    const request = {
      account_id,
      promise: load_resubscribe_kind().catch(() =>
        cached_account_id === account_id ? cached_kind : null,
      ),
    };

    kind_request_in_flight = request;
    request.promise.finally(() => {
      if (kind_request_in_flight === request) kind_request_in_flight = null;
    });
  }

  const kind = await kind_request_in_flight.promise;

  if ((await get_current_account_id()) === account_id)
    publish(kind, account_id);
}

export function clear_resubscribe_cache(): void {
  publish(null, null);
}

export function use_resubscribe(is_open: boolean) {
  const { t } = use_i18n();
  const [kind, set_kind] = useState<ResubscribeKind>(cached_kind);
  const busy_ref = useRef(false);

  useEffect(() => {
    listeners.add(set_kind);

    return () => {
      listeners.delete(set_kind);
    };
  }, []);

  useEffect(() => {
    refresh_resubscribe_kind().catch(() => undefined);
  }, [is_open]);

  const resubscribe = useCallback(async () => {
    if (kind === "choose") {
      const offer = get_special_offer_status_snapshot().status;
      const offer_open =
        !!offer?.available &&
        is_special_offer_available({
          plan_code: "free",
          is_dismissed: offer.dismissed ?? false,
        }) &&
        show_special_offer("manual");

      if (!offer_open) show_upgrade_plans();

      return;
    }
    if (kind !== "reactivate" || busy_ref.current) return;
    busy_ref.current = true;

    try {
      const response = await reactivate_subscription();

      if (response.data) {
        publish(null, cached_account_id);
        request_cache.invalidate("/payments/v1");
        request_cache.invalidate("/sync/v1");
        invalidate_mail_stats();
        show_toast(t("settings.subscription_reactivated"), "success");
      } else {
        show_toast(
          server_error_text(response.error, t("settings.failed_reactivate")),
          "error",
        );
      }
    } catch {
      show_toast(t("settings.failed_reactivate"), "error");
    } finally {
      busy_ref.current = false;
    }
  }, [kind, t]);

  return { can_resubscribe: kind !== null, resubscribe };
}
