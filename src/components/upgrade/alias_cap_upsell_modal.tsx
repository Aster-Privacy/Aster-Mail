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
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { SparklesIcon } from "@heroicons/react/24/solid";
import { Button } from "@aster/ui";

import {
  Modal,
  ModalBody,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from "@/components/ui/modal";
import { AliasUsageMeter } from "@/components/settings/aliases/alias_usage_meter";
import { use_auth } from "@/contexts/auth_context";
import { use_i18n } from "@/lib/i18n/context";
import { use_plan_limits } from "@/hooks/use_plan_limits";
import { alias_cap_offer_for_plan } from "@/lib/alias_usage";
import { format_price } from "@/services/api/billing";
import {
  PLAN_TIERS,
  convert_cents,
  detect_currency_from_locale,
} from "@/components/settings/billing/billing_constants";
import { use_currency_rates } from "@/components/settings/billing/use_currency_rates";
import {
  close_alias_cap_upsell,
  use_alias_cap_upsell_state,
} from "@/stores/alias_cap_upsell_store";
import {
  is_on_auth_route,
  show_plan_limit_upgrade,
} from "@/stores/upgrade_store";

export function AliasCapUpsellModal() {
  const { t } = use_i18n();
  const location = useLocation();
  const state = use_alias_cap_upsell_state();
  const { is_authenticated } = use_auth();
  const { limits, plan_code } = use_plan_limits();
  const [currency, set_currency] = useState("usd");

  use_currency_rates();

  useEffect(() => {
    set_currency(detect_currency_from_locale());
  }, []);

  const is_blocked = is_on_auth_route(location.pathname) || !is_authenticated;

  useEffect(() => {
    if (is_blocked && state.is_open) close_alias_cap_upsell();
  }, [is_blocked, state.is_open]);

  const alias_limit_info = limits?.limits.max_email_aliases ?? null;
  const used = state.used ?? alias_limit_info?.current ?? 0;
  const limit = state.limit ?? alias_limit_info?.limit ?? 0;

  const offer = useMemo(
    () => alias_cap_offer_for_plan(plan_code ?? null),
    [plan_code],
  );

  const offer_tier = useMemo(
    () => PLAN_TIERS.find((tier) => tier.id === offer?.plan_code) ?? null,
    [offer],
  );

  const alternative_tier = useMemo(() => {
    if (!offer_tier || offer?.is_unlimited) return null;

    return PLAN_TIERS.find((tier) => tier.id === "nova") ?? null;
  }, [offer, offer_tier]);

  if (!offer || !offer_tier) return null;

  const monthly_price = format_price(
    convert_cents(offer_tier.monthly_cents, currency),
    currency,
  );

  const open_plans = () => {
    close_alias_cap_upsell();
    show_plan_limit_upgrade({
      resource: "aliases",
      plan_code: offer_tier.id,
      interval: "month",
    });
  };

  return (
    <Modal
      is_open={state.is_open && !is_blocked}
      on_close={close_alias_cap_upsell}
      size="md"
    >
      <ModalHeader>
        <ModalTitle>{t("common.alias_limit_reached")}</ModalTitle>
        <ModalDescription>
          {t("settings.alias_limit_all_used", { used, count: limit })}
        </ModalDescription>
      </ModalHeader>

      <ModalBody className="space-y-3">
        <AliasUsageMeter limit={limit} show_upgrade_action={false} used={used} />

        <div
          className="flex items-start gap-2.5 rounded-2xl px-3.5 py-3"
          style={{
            backgroundColor:
              "color-mix(in srgb, var(--accent-color) 10%, transparent)",
          }}
        >
          <SparklesIcon
            className="mt-0.5 h-4 w-4 flex-shrink-0"
            style={{ color: "var(--accent-color)" }}
          />
          <div className="space-y-1">
            <p className="text-[13px] font-medium text-txt-primary">
              {offer.is_unlimited
                ? t("settings.alias_cap_upsell_benefit_unlimited", {
                    plan: offer_tier.name,
                    price: monthly_price,
                  })
                : t("settings.alias_cap_upsell_benefit", {
                    plan: offer_tier.name,
                    aliases: offer.alias_allowance,
                    price: monthly_price,
                  })}
            </p>
            {alternative_tier && (
              <p className="text-[13px] text-txt-secondary">
                {t("settings.alias_cap_upsell_alternative", {
                  plan: alternative_tier.name,
                })}
              </p>
            )}
          </div>
        </div>
      </ModalBody>

      <ModalFooter>
        <Button variant="ghost" onClick={close_alias_cap_upsell}>
          {t("common.not_now")}
        </Button>
        <Button variant="depth" onClick={open_plans}>
          {t("settings.alias_cap_upsell_cta", { plan: offer_tier.name })}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
