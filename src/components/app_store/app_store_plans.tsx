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
import type { TranslationKey } from "@/lib/i18n/types";
import type { PlanFeature } from "@/components/settings/billing/plan_card";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@aster/ui";

import { PlanCard, Segmented } from "@/components/settings/billing/plan_card";
import { PLAN_TIERS } from "@/components/settings/billing/billing_constants";
import { LoadFailedNotice } from "@/components/settings/load_failed_notice";
import { Spinner } from "@/components/ui/spinner";
import {
  show_toast,
  TOAST_DURATION_BILLING_MS,
} from "@/components/toast/simple_toast";
import { use_i18n } from "@/lib/i18n/context";
import { clear_plan_limits_cache } from "@/hooks/use_plan_limits";
import { invalidate_mail_stats } from "@/hooks/use_mail_stats";
import { request_cache } from "@/services/api/request_cache";
import { open_external } from "@/utils/open_link";
import {
  APP_STORE_PLAN_CODES,
  app_store_product_id,
  load_app_store_products,
  open_app_store_subscriptions,
  purchase_app_store_product,
  redeem_app_store_transaction,
  restore_app_store_purchases,
  type AppStoreInterval,
  type AppStorePlanCode,
  type AppStoreProduct,
  type AppStoreRestoreResult,
} from "@/services/app_store/storekit_client";

const TERMS_URL = "https://astermail.org/terms";
const PRIVACY_URL = "https://astermail.org/privacy";

const PLAN_FEATURE_KEYS: Record<AppStorePlanCode, TranslationKey[]> = {
  star: [
    "settings.plan_feat_storage_50",
    "settings.plan_feat_aliases_15",
    "settings.plan_feat_domains_5",
    "settings.plan_feat_advanced_aliases",
  ],
  nova: [
    "settings.plan_feat_storage_500",
    "settings.plan_feat_aliases_unlimited",
    "settings.plan_feat_domains_30",
    "settings.plan_feat_smart_folders",
  ],
  supernova: [
    "settings.plan_feat_storage_5tb",
    "settings.plan_feat_aliases_unlimited",
    "settings.plan_feat_domains_unlimited",
    "settings.plan_feat_priority_support",
  ],
};

const PLAN_DESCRIPTION_KEYS: Record<AppStorePlanCode, TranslationKey> = {
  star: "auth.plan_star_description",
  nova: "auth.plan_nova_description",
  supernova: "auth.plan_supernova_description",
};

export function announce_app_store_plan_change(): void {
  request_cache.invalidate("/payments/v1");
  clear_plan_limits_cache();
  invalidate_mail_stats();
  window.dispatchEvent(new CustomEvent("aster:plan-changed"));
}

interface AppStorePlansProps {
  current_plan_code: string | null;
  purchases_locked?: boolean;
  recommended_plan_code?: string | null;
  compact?: boolean;
  on_redeemed?: (plan_code: AppStorePlanCode) => void;
}

export function AppStorePlans({
  current_plan_code,
  purchases_locked = false,
  recommended_plan_code = "nova",
  compact = false,
  on_redeemed,
}: AppStorePlansProps) {
  const { t } = use_i18n();
  const [interval, set_interval] = useState<AppStoreInterval>("yearly");
  const [products, set_products] = useState<Map<string, AppStoreProduct>>(
    () => new Map(),
  );
  const [is_loading, set_is_loading] = useState(true);
  const [load_failed, set_load_failed] = useState(false);
  const [purchasing_id, set_purchasing_id] = useState<string | null>(null);
  const [is_restoring, set_is_restoring] = useState(false);

  const load_products = useCallback(async () => {
    set_is_loading(true);
    set_load_failed(false);
    try {
      const list = await load_app_store_products();

      set_products(new Map(list.map((product) => [product.id, product])));
      set_load_failed(list.length === 0);
    } catch {
      set_load_failed(true);
    } finally {
      set_is_loading(false);
    }
  }, []);

  useEffect(() => {
    void load_products();
  }, [load_products]);

  const tiers = useMemo(
    () =>
      PLAN_TIERS.filter((tier) =>
        (APP_STORE_PLAN_CODES as readonly string[]).includes(tier.id),
      ),
    [],
  );

  const is_busy = purchasing_id !== null || is_restoring;

  const report_restore = (result: AppStoreRestoreResult) => {
    if (result.redeemed > 0) {
      announce_app_store_plan_change();
      show_toast(
        t("app_store.restore_success"),
        "success",
        TOAST_DURATION_BILLING_MS,
      );

      return;
    }
    if (result.conflict) {
      show_toast(t("app_store.conflict"), "error", TOAST_DURATION_BILLING_MS);

      return;
    }
    if (result.failed) {
      show_toast(
        t("app_store.verify_failed"),
        "warning",
        TOAST_DURATION_BILLING_MS,
      );

      return;
    }
    show_toast(t("app_store.restore_none"), "info", TOAST_DURATION_BILLING_MS);
  };

  const handle_purchase = async (plan_code: AppStorePlanCode) => {
    if (is_busy || purchases_locked) return;
    const product_id = app_store_product_id(plan_code, interval);

    set_purchasing_id(product_id);
    try {
      const outcome = await purchase_app_store_product(product_id);

      if (outcome.status === "pending") {
        show_toast(
          t("app_store.purchase_pending"),
          "info",
          TOAST_DURATION_BILLING_MS,
        );

        return;
      }
      if (outcome.status !== "success") return;

      const result = await redeem_app_store_transaction(outcome.transaction);

      if (result === "redeemed") {
        announce_app_store_plan_change();
        show_toast(
          t("app_store.purchase_success"),
          "success",
          TOAST_DURATION_BILLING_MS,
        );
        on_redeemed?.(plan_code);
      } else if (result === "conflict") {
        show_toast(t("app_store.conflict"), "error", TOAST_DURATION_BILLING_MS);
      } else {
        show_toast(
          t("app_store.verify_failed"),
          "warning",
          TOAST_DURATION_BILLING_MS,
        );
      }
    } catch {
      show_toast(
        t("app_store.purchase_failed"),
        "error",
        TOAST_DURATION_BILLING_MS,
      );
    } finally {
      set_purchasing_id(null);
    }
  };

  const handle_restore = async () => {
    if (is_busy) return;
    set_is_restoring(true);
    try {
      report_restore(await restore_app_store_purchases());
    } catch {
      show_toast(
        t("app_store.restore_failed"),
        "error",
        TOAST_DURATION_BILLING_MS,
      );
    } finally {
      set_is_restoring(false);
    }
  };

  const plan_features = (plan_code: AppStorePlanCode): PlanFeature[] =>
    PLAN_FEATURE_KEYS[plan_code].map((key) => ({ label: t(key), on: true }));

  return (
    <div className="space-y-4">
      <div className="flex justify-center">
        <Segmented<AppStoreInterval>
          on_change={set_interval}
          options={[
            { id: "monthly", label: t("settings.billing_monthly") },
            { id: "yearly", label: t("settings.billing_yearly") },
          ]}
          value={interval}
        />
      </div>

      {load_failed && !is_loading ? (
        <LoadFailedNotice on_retry={() => void load_products()} />
      ) : null}

      {is_loading ? (
        <div className="flex justify-center py-8">
          <Spinner size="md" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {tiers.map((tier) => {
            const plan_code = tier.id as AppStorePlanCode;
            const product = products.get(
              app_store_product_id(plan_code, interval),
            );
            const is_current = current_plan_code === plan_code;
            const is_purchasing =
              purchasing_id === app_store_product_id(plan_code, interval);

            return (
              <PlanCard
                key={tier.id}
                badge={
                  is_current
                    ? t("settings.current_plan")
                    : recommended_plan_code === plan_code
                      ? t("settings.plan_recommended")
                      : null
                }
                compact={compact}
                cta_disabled={
                  is_current || purchases_locked || is_busy || !product
                }
                cta_label={
                  is_current
                    ? t("settings.current_plan")
                    : is_purchasing
                      ? t("app_store.processing")
                      : t("app_store.subscribe_to", { plan: tier.name })
                }
                description={t(PLAN_DESCRIPTION_KEYS[plan_code])}
                featured={recommended_plan_code === plan_code}
                features={plan_features(plan_code)}
                is_current={is_current}
                name={tier.name}
                on_cta={() => void handle_purchase(plan_code)}
                period_label={
                  interval === "yearly"
                    ? t("app_store.per_year")
                    : t("app_store.per_month")
                }
                price_label={product?.display_price ?? "-"}
              />
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button
          disabled={is_busy}
          size="sm"
          variant="secondary"
          onClick={() => void handle_restore()}
        >
          {is_restoring
            ? t("app_store.restoring")
            : t("app_store.restore_purchases")}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => void open_app_store_subscriptions()}
        >
          {t("app_store.manage_subscriptions")}
        </Button>
      </div>

      <p className="text-center text-xs text-txt-muted">
        {t("app_store.renewal_terms")}
      </p>

      <div className="flex items-center justify-center gap-4 text-xs">
        <button
          className="underline text-txt-muted hover:text-txt-primary"
          type="button"
          onClick={() => open_external(TERMS_URL)}
        >
          {t("app_store.terms_of_use")}
        </button>
        <button
          className="underline text-txt-muted hover:text-txt-primary"
          type="button"
          onClick={() => open_external(PRIVACY_URL)}
        >
          {t("common.privacy_policy")}
        </button>
      </div>
    </div>
  );
}
