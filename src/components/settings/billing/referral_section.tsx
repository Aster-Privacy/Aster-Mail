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
import {
  UserGroupIcon,
  ClipboardDocumentIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";

import {
  format_price,
  format_date,
  type ReferralInfo,
  type ReferralHistoryItem,
} from "@/services/api/billing";
import { show_toast } from "@/components/toast/simple_toast";
import { use_i18n } from "@/lib/i18n/context";

interface ReferralSectionProps {
  referral_info: ReferralInfo | null;
  referral_history_list: ReferralHistoryItem[];
}

export function ReferralSection({
  referral_info,
  referral_history_list,
}: ReferralSectionProps) {
  const { t } = use_i18n();

  return (
    <div className="border-t border-edge-secondary pt-8">
      <div className="mb-2">
        <h3 className="flex items-center gap-2 text-base font-semibold text-txt-primary">
          <UserGroupIcon className="w-4 h-4 text-txt-primary flex-shrink-0" />
          {t("settings.referral_program")}
        </h3>
        <p className="text-xs text-txt-muted mt-1">
          {t("settings.referral_program_description")}
        </p>
        <div className="mt-2 h-px bg-edge-secondary" />
      </div>

      {referral_info && referral_info.referral_code ? (
        <>
          <div className="mb-3">
            <p className="text-xs text-txt-muted mb-1.5">
              {t("settings.your_referral_link")}
            </p>
            <div className="flex gap-2">
              <input
                readOnly
                className="flex-1 h-9 px-3 rounded-lg bg-transparent border border-edge-secondary text-sm text-txt-primary outline-none"
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
            <p className="text-xs text-txt-muted mt-2">
              {t("settings.referral_reward_info")}
            </p>
            <p className="text-xs text-txt-muted mt-1">
              {t("settings.referral_commission_info", {
                percent: String(referral_info.commission_percent || 5),
              })}
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
            <div className="px-3 py-2.5 rounded-lg border border-edge-secondary text-center">
              <p className="text-lg font-bold text-txt-primary">
                {referral_info.total_referrals}
              </p>
              <p className="text-xs text-txt-muted">
                {t("settings.total_referrals")}
              </p>
            </div>
            <div className="px-3 py-2.5 rounded-lg border border-edge-secondary text-center">
              <p className="text-lg font-bold text-yellow-500">
                {referral_info.pending_referrals}
              </p>
              <p className="text-xs text-txt-muted">
                {t("settings.pending_referrals")}
              </p>
            </div>
            <div className="px-3 py-2.5 rounded-lg border border-edge-secondary text-center">
              <p className="text-lg font-bold text-green-500">
                {referral_info.completed_referrals}
              </p>
              <p className="text-xs text-txt-muted">
                {t("settings.completed_referrals")}
              </p>
            </div>
            <div className="px-3 py-2.5 rounded-lg border border-edge-secondary text-center">
              <p className="text-lg font-bold text-txt-primary">
                {format_price(
                  (referral_info.credits_earned_cents || 0) +
                    (referral_info.commission_earned_cents || 0),
                )}
              </p>
              <p className="text-xs text-txt-muted">
                {t("settings.total_earned")}
              </p>
            </div>
          </div>

          <div className="mb-3" />

          {referral_history_list.length > 0 && (
            <div>
              <p className="text-xs font-medium text-txt-secondary mb-2">
                {t("settings.referral_history")}
              </p>
              <div className="rounded-lg border overflow-hidden border-edge-secondary">
                {referral_history_list.map((ref_item) => (
                  <div
                    key={ref_item.id}
                    className="flex items-center justify-between px-4 py-2.5 hover:bg-surf-hover transition-colors"
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
                        className={`text-xs font-medium px-2 py-0.5 rounded ${
                          ref_item.status === "completed"
                            ? "bg-green-500/20 text-green-500"
                            : "bg-yellow-500/20 text-yellow-500"
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
            </div>
          )}

          {referral_history_list.length === 0 && (
            <p className="text-xs text-txt-muted text-center py-3">
              {t("settings.no_referrals_yet")}
            </p>
          )}
        </>
      ) : (
        <div className="text-center py-4">
          <p className="text-sm text-txt-secondary">
            {t("settings.referral_loading")}
          </p>
        </div>
      )}
    </div>
  );
}
