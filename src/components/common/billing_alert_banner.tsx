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
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";

import { use_should_reduce_motion } from "@/provider";
import { use_i18n } from "@/lib/i18n/context";
import { get_subscription } from "@/services/api/billing";
import { ignore_error } from "@/lib/ignore_error";

const DISMISSED_KEY = "aster_billing_alert_dismissed";
const RECHECK_INTERVAL_MS = 5 * 60 * 1000;

function get_dismissed(): boolean {
  try {
    return sessionStorage.getItem(DISMISSED_KEY) === "true";
  } catch {
    return false;
  }
}

function set_dismissed() {
  try {
    sessionStorage.setItem(DISMISSED_KEY, "true");
  } catch (caught) {
    ignore_error(
      "components/common/billing_alert_banner:set_dismissed",
      caught,
    );
  }
}

function days_remaining(grace_period_end: string | null): number | null {
  if (!grace_period_end) return null;

  const end = new Date(grace_period_end).getTime();

  if (Number.isNaN(end)) return null;

  const days = Math.ceil((end - Date.now()) / (1000 * 60 * 60 * 24));

  return days > 0 ? days : null;
}

export function BillingAlertBanner() {
  const reduce_motion = use_should_reduce_motion();
  const navigate = useNavigate();
  const { t } = use_i18n();
  const [is_hidden, set_is_hidden] = useState(get_dismissed);
  const [grace_days, set_grace_days] = useState<number | null>(null);
  const [has_payment_failed, set_has_payment_failed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let last_checked = 0;

    const check = () => {
      if (get_dismissed()) return;

      const now = Date.now();

      if (now - last_checked < RECHECK_INTERVAL_MS) return;
      last_checked = now;

      get_subscription()
        .then((response) => {
          if (cancelled || response.error || !response.data) return;

          if (!response.data.payment_failed_at) {
            set_has_payment_failed(false);

            return;
          }

          set_has_payment_failed(true);
          set_grace_days(days_remaining(response.data.grace_period_end));
        })
        .catch((caught) => {
          ignore_error("components/common/billing_alert_banner:load", caught);
        });
    };

    check();
    window.addEventListener("focus", check);
    window.addEventListener("aster:plan-changed", check);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", check);
      window.removeEventListener("aster:plan-changed", check);
    };
  }, []);

  const should_hide = is_hidden || !has_payment_failed;

  const handle_dismiss = () => {
    set_is_hidden(true);
    set_dismissed();
  };

  const handle_update = () => {
    set_is_hidden(true);
    navigate("/settings/billing");
  };

  return (
    <AnimatePresence>
      {!should_hide && (
        <motion.div
          animate={{ opacity: 1, height: "auto" }}
          className="w-full flex-shrink-0 overflow-hidden text-white"
          exit={{ opacity: 0, height: 0, overflow: "hidden" }}
          initial={reduce_motion ? false : { opacity: 0, height: 0 }}
          style={{ backgroundColor: "#dc2626" }}
          transition={{ duration: reduce_motion ? 0 : 0.2 }}
        >
          <div className="flex items-center justify-between gap-2 px-4 py-1.5">
            <div className="flex min-w-0 items-center gap-1.5">
              <ExclamationTriangleIcon className="h-3.5 w-3.5 flex-shrink-0 opacity-90" />
              <span className="truncate text-xs font-medium opacity-95">
                {grace_days === null
                  ? t("common.billing_alert_body")
                  : t("common.billing_alert_body_days", {
                      days: String(grace_days),
                    })}
              </span>
            </div>
            <div className="flex flex-shrink-0 items-center gap-1.5">
              <button
                className="rounded-[12px] px-2.5 py-0.5 text-xs font-medium transition-colors"
                style={{ backgroundColor: "rgba(255, 255, 255, 0.2)" }}
                type="button"
                onClick={handle_update}
              >
                {t("common.billing_alert_action")}
              </button>
              <button
                className="rounded-[12px] px-2.5 py-0.5 text-xs font-medium transition-colors"
                style={{ backgroundColor: "rgba(255, 255, 255, 0.1)" }}
                type="button"
                onClick={handle_dismiss}
              >
                {t("common.dismiss")}
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
