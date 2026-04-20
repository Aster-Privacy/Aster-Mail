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
import { useState, useEffect, useCallback } from "react";
import {
  UserGroupIcon,
  ClipboardDocumentIcon,
  GiftIcon,
  ArrowPathIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";

import { use_i18n } from "@/lib/i18n/context";
import {
  get_referral_info,
  get_referral_history,
  format_price,
  format_date,
  type ReferralInfo,
  type ReferralHistoryItem,
} from "@/services/api/billing";
import { show_toast } from "@/components/toast/simple_toast";

export function ReferralTab() {
  const { t } = use_i18n();
  const [referral_info, set_referral_info] = useState<ReferralInfo | null>(
    null,
  );
  const [referral_history, set_referral_history] = useState<
    ReferralHistoryItem[]
  >([]);
  const [is_loading, set_is_loading] = useState(true);

  const load_data = useCallback(async () => {
    set_is_loading(true);

    try {
      const [info_res, history_res] = await Promise.all([
        get_referral_info(),
        get_referral_history(),
      ]);

      if (info_res.data) {
        set_referral_info(info_res.data);
      }

      if (history_res.data) {
        set_referral_history(history_res.data.referrals);
      }
    } finally {
      set_is_loading(false);
    }
  }, []);

  useEffect(() => {
    load_data();
  }, [load_data]);

  if (is_loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <ArrowPathIcon className="w-5 h-5 animate-spin text-txt-muted" />
      </div>
    );
  }

  if (!referral_info || !referral_info.referral_code) {
    return (
      <div className="text-center py-16">
        <UserGroupIcon className="w-10 h-10 text-txt-muted mx-auto mb-3" />
        <p className="text-sm text-txt-secondary">
          {t("settings.referral_not_eligible")}
        </p>
        <p className="text-xs text-txt-muted mt-1">
          {t("settings.referral_not_eligible_description")}
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h3 className="text-base font-semibold text-txt-primary">
          {t("settings.referral_program")}
        </h3>
        <p className="text-xs text-txt-muted mt-1">
          {t("settings.referral_program_description")}
        </p>
      </div>

      <div className="rounded-xl border border-edge-secondary p-4 mb-5 bg-surf-secondary/30">
        <div className="flex items-center gap-2 mb-3">
          <GiftIcon className="w-4 h-4 text-txt-secondary" />
          <p className="text-sm font-medium text-txt-primary">
            {t("settings.your_referral_link")}
          </p>
        </div>
        <div className="flex gap-2">
          <input
            readOnly
            className="flex-1 h-9 px-3 rounded-lg bg-transparent border border-edge-secondary text-sm text-txt-primary outline-none font-mono text-xs"
            value={referral_info.referral_link}
          />
          <Button
            className="h-9 px-3 text-sm"
            variant="secondary"
            onClick={() => {
              navigator.clipboard.writeText(referral_info.referral_link);
              show_toast(t("settings.link_copied"), "success");
            }}
          >
            <ClipboardDocumentIcon className="w-4 h-4" />
            {t("settings.copy_link")}
          </Button>
        </div>
      </div>

      <div className="mb-5">
        <p className="text-xs font-medium text-txt-secondary mb-2">
          {t("settings.referral_how_it_works")}
        </p>
        <div className="space-y-2">
          <div className="flex items-start gap-3 text-xs text-txt-muted">
            <span className="flex-shrink-0 w-5 h-5 rounded-full bg-surf-tertiary text-txt-secondary flex items-center justify-center text-[10px] font-bold mt-0.5">
              1
            </span>
            <span>{t("settings.referral_step_share")}</span>
          </div>
          <div className="flex items-start gap-3 text-xs text-txt-muted">
            <span className="flex-shrink-0 w-5 h-5 rounded-full bg-surf-tertiary text-txt-secondary flex items-center justify-center text-[10px] font-bold mt-0.5">
              2
            </span>
            <span>{t("settings.referral_step_signup")}</span>
          </div>
          <div className="flex items-start gap-3 text-xs text-txt-muted">
            <span className="flex-shrink-0 w-5 h-5 rounded-full bg-surf-tertiary text-txt-secondary flex items-center justify-center text-[10px] font-bold mt-0.5">
              3
            </span>
            <span>{t("settings.referral_step_earn")}</span>
          </div>
        </div>
      </div>

      <div className="mb-5">
        <p className="text-xs font-medium text-txt-secondary mb-2">
          {t("settings.referral_rewards")}
        </p>
        <div className="rounded-xl border border-edge-secondary p-3 space-y-2 bg-surf-secondary/30">
          <p className="text-xs text-txt-muted">
            {t("settings.referral_reward_info")}
          </p>
          <p className="text-xs text-txt-muted">
            {t("settings.referral_commission_info", {
              percent: String(referral_info.commission_percent || 5),
            })}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <div className="px-3 py-3 rounded-xl border border-edge-secondary text-center">
          <p className="text-xl font-bold text-txt-primary">
            {referral_info.total_referrals}
          </p>
          <p className="text-xs text-txt-muted mt-0.5">
            {t("settings.total_referrals")}
          </p>
        </div>
        <div className="px-3 py-3 rounded-xl border border-edge-secondary text-center">
          <p className="text-xl font-bold text-yellow-500">
            {referral_info.pending_referrals}
          </p>
          <p className="text-xs text-txt-muted mt-0.5">
            {t("settings.pending_referrals")}
          </p>
        </div>
        <div className="px-3 py-3 rounded-xl border border-edge-secondary text-center">
          <p className="text-xl font-bold text-green-500">
            {referral_info.completed_referrals}
          </p>
          <p className="text-xs text-txt-muted mt-0.5">
            {t("settings.completed_referrals")}
          </p>
        </div>
        <div className="px-3 py-3 rounded-xl border border-edge-secondary text-center">
          <p className="text-xl font-bold text-txt-primary">
            {format_price(
              (referral_info.credits_earned_cents || 0) +
                (referral_info.commission_earned_cents || 0),
            )}
          </p>
          <p className="text-xs text-txt-muted mt-0.5">
            {t("settings.total_earned")}
          </p>
        </div>
      </div>

      <div>
        <p className="text-xs font-medium text-txt-secondary mb-2">
          {t("settings.referral_history")}
        </p>
        {referral_history.length > 0 ? (
          <div className="rounded-xl border overflow-hidden border-edge-secondary">
            {referral_history.map((ref_item) => (
              <div
                key={ref_item.id}
                className="flex items-center justify-between px-4 py-3 border-b border-edge-secondary last:border-b-0 hover:bg-surf-hover transition-colors"
              >
                <div>
                  <p className="text-sm text-txt-primary">
                    {ref_item.referee_email_masked}
                  </p>
                  <p className="text-xs mt-0.5 text-txt-muted">
                    {format_date(ref_item.created_at)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      ref_item.status === "completed"
                        ? "bg-green-500/15 text-green-500"
                        : "bg-yellow-500/15 text-yellow-500"
                    }`}
                  >
                    {ref_item.status === "completed"
                      ? t("settings.referral_status_completed")
                      : t("settings.referral_status_pending")}
                  </span>
                  {ref_item.referrer_credit_cents > 0 && (
                    <p className="text-sm font-medium text-green-500">
                      +{format_price(ref_item.referrer_credit_cents)}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-edge-secondary py-8 text-center">
            <UserGroupIcon className="w-8 h-8 text-txt-muted mx-auto mb-2" />
            <p className="text-xs text-txt-muted">
              {t("settings.no_referrals_yet")}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
