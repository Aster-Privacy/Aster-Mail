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
import { ArrowPathIcon } from "@heroicons/react/24/outline";

import { FAMILY_PLAN_TIERS, PLAN_TIERS } from "./billing_constants";

import { use_i18n } from "@/lib/i18n/context";
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

    const opened = show_checkout_cancelled_upgrade({
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
  }, [is_resuming, t, target]);

  if (!target) return null;
  if (current_plan_code && current_plan_code === target.plan_code) return null;

  return (
    <div
      className={`rounded-xl bg-surf-secondary border border-edge-secondary px-4 py-3.5 ${class_name}`}
    >
      <div className="flex items-start gap-3">
        <ArrowPathIcon className="mt-0.5 h-5 w-5 flex-shrink-0 text-txt-muted" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-txt-primary">
            {t("settings.finish_plan_setup_title", {
              plan: plan_label(target.plan_code),
            })}
          </p>
          <p className="mt-0.5 text-xs text-txt-muted">
            {t("settings.finish_plan_setup_message")}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
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
          </div>
        </div>
      </div>
    </div>
  );
}
