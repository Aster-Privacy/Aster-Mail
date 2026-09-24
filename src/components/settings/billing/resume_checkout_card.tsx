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

import { FAMILY_PLAN_TIERS, PLAN_TIERS } from "./billing_constants";

import { use_i18n } from "@/lib/i18n/context";
import { BillingNotice } from "@/components/settings/billing/billing_layout";
import {
  show_toast,
  TOAST_DURATION_BILLING_MS,
} from "@/components/toast/simple_toast";
import {
  clear_checkout_target,
  read_checkout_target,
  type CheckoutTarget,
} from "@/services/api/billing";
import {
  show_checkout_cancelled_upgrade,
  type UpgradeInterval,
} from "@/stores/upgrade_store";
import { is_special_offer_available } from "@/lib/special_offer";
import { request_special_offer_checkout } from "@/stores/special_offer_store";
import { use_special_offer_status } from "@/stores/special_offer_status";

interface ResumeCheckoutCardProps {
  current_plan_code: string | null;
  class_name?: string;
}

function upgrade_interval_for(billing_interval: string): UpgradeInterval {
  if (billing_interval === "month") return "month";
  if (billing_interval === "biennial") return "biennial";

  return "year";
}

function plan_label(plan_code: string): string {
  const tier =
    PLAN_TIERS.find((entry) => entry.id === plan_code) ??
    FAMILY_PLAN_TIERS.find((entry) => entry.id === plan_code);

  return tier?.name ?? plan_code;
}

export function ResumeCheckoutCard({
  current_plan_code,
  class_name = "",
}: ResumeCheckoutCardProps) {
  const { t } = use_i18n();
  const [target, set_target] = useState<CheckoutTarget | null>(() =>
    read_checkout_target(),
  );
  const [is_resuming, set_is_resuming] = useState(false);
  const { status: offer_status } = use_special_offer_status();
  const can_resume_offer =
    !!target?.special_offer &&
    !!offer_status?.available &&
    is_special_offer_available({
      plan_code: current_plan_code ?? "free",
      is_dismissed: offer_status.dismissed ?? false,
    });

  useEffect(() => {
    const refresh = () => set_target(read_checkout_target());

    window.addEventListener("focus", refresh);
    window.addEventListener("aster:plan-changed", refresh);

    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("aster:plan-changed", refresh);
    };
  }, []);

  useEffect(() => {
    if (!target || !current_plan_code) return;
    if (target.plan_code !== current_plan_code) return;

    clear_checkout_target();
    set_target(null);
  }, [current_plan_code, target]);

  const handle_dismiss = useCallback(() => {
    clear_checkout_target();
    set_target(null);
  }, []);

  const handle_resume = useCallback(() => {
    if (!target || is_resuming) return;

    set_is_resuming(true);

    const opened = can_resume_offer
      ? request_special_offer_checkout()
      : show_checkout_cancelled_upgrade({
          plan_code: target.plan_code,
          interval: upgrade_interval_for(target.billing_interval),
        });

    set_is_resuming(false);

    if (opened) return;

    show_toast(
      t("settings.failed_checkout"),
      "error",
      TOAST_DURATION_BILLING_MS,
    );
  }, [can_resume_offer, is_resuming, t, target]);

  if (!target) return null;
  if (current_plan_code && current_plan_code === target.plan_code) return null;

  return (
    <BillingNotice
      body={t("settings.finish_plan_setup_message")}
      class_name={class_name}
      title={t("settings.finish_plan_setup_title", {
        plan: plan_label(target.plan_code),
      })}
    >
      <button
        className="aster_btn aster_btn_primary aster_btn_sm"
        disabled={is_resuming}
        type="button"
        onClick={handle_resume}
      >
        {t("settings.finish_plan_setup_action")}
      </button>
      <button
        className="aster_btn aster_btn_ghost aster_btn_sm"
        disabled={is_resuming}
        type="button"
        onClick={handle_dismiss}
      >
        {t("common.not_now")}
      </button>
    </BillingNotice>
  );
}
