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
import { Button, Island, IslandSection } from "@aster/ui";

import {
  format_price,
  format_date,
  build_referral_invite_url,
  type ReferralInfo,
  type ReferralHistoryItem,
} from "@/services/api/billing";
import { show_toast } from "@/components/toast/simple_toast";
import { use_i18n } from "@/lib/i18n/context";
import { format_bytes } from "@/lib/utils";
import { copy_text } from "@/utils/copy_text";

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
    <IslandSection
      bare
      description={
        referral_info
          ? t("settings.referral_program_description", {
              amount: format_bytes(referral_info.bonus_bytes_per_referral),
            })
          : undefined
      }
      icon={<UserGroupIcon className="flex-shrink-0" />}
      id="referral_section"
      title={t("settings.referral_program")}
    >
      {referral_info && referral_info.referral_code ? (
        <>
          <Island className="mb-2" padding="md">
            <p className="text-xs text-txt-muted mb-1.5">
              {t("settings.your_referral_link")}
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                readOnly
                aria-label={t("settings.your_referral_link")}
                className="min-w-0 flex-1 h-9 px-3 rounded-lg bg-transparent border border-edge-secondary text-sm text-txt-primary outline-none"
                value={build_referral_invite_url(referral_info.referral_code)}
              />
              <Button
                className="h-9 px-3 text-sm"
                variant="secondary"
                onClick={async () => {
                  if (
                    await copy_text(
                      build_referral_invite_url(referral_info.referral_code),
                    )
                  ) {
                    show_toast(t("settings.link_copied"), "success");
                  } else {
                    show_toast(t("common.failed_to_copy"), "error");
                  }
                }}
              >
                <ClipboardDocumentIcon className="w-4 h-4" />
                {t("settings.copy_link")}
              </Button>
            </div>
            {!referral_info.is_affiliate && (
              <>
                {referral_info.bonus_bytes_per_referral > 0 && (
                  <p className="text-xs text-txt-muted mt-2">
                    {t("settings.referral_reward_info", {
                      amount: format_bytes(
                        referral_info.bonus_bytes_per_referral,
                      ),
                      max: format_bytes(referral_info.bonus_bytes_max),
                    })}
                  </p>
                )}
                <p className="text-xs text-txt-muted mt-1">
                  {t("settings.referral_commission_info", {
                    percent: referral_info.commission_percent || 10,
                  })}
                </p>
              </>
            )}
          </Island>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
            <Island className="px-3 py-3 text-center">
              <p className="text-lg font-bold text-txt-primary">
                {referral_info.total_referrals}
              </p>
              <p className="text-xs text-txt-muted">
                {t("settings.total_referrals")}
              </p>
            </Island>
            <Island className="px-3 py-3 text-center">
              <p className="text-lg font-bold text-yellow-500">
                {referral_info.pending_referrals}
              </p>
              <p className="text-xs text-txt-muted">
                {t("settings.pending_referrals")}
              </p>
            </Island>
            <Island className="px-3 py-3 text-center">
              <p className="text-lg font-bold text-green-500">
                {referral_info.completed_referrals}
              </p>
              <p className="text-xs text-txt-muted">
                {t("settings.completed_referrals")}
              </p>
            </Island>
            <Island className="px-3 py-3 text-center">
              <p className="text-lg font-bold text-txt-primary">
                {format_price(
                  (referral_info.credits_earned_cents || 0) +
                    (referral_info.commission_earned_cents || 0),
                )}
              </p>
              <p className="text-xs text-txt-muted">
                {t("settings.total_earned")}
              </p>
            </Island>
          </div>

          {referral_history_list.length > 0 && (
            <div>
              <div className="aster_island_section_header">
                <div className="aster_island_section_heading">
                  <h3 className="aster_island_section_title">
                    <span>{t("settings.referral_history")}</span>
                  </h3>
                </div>
              </div>
              <Island className="overflow-hidden">
                {referral_history_list.map((ref_item) => (
                  <div
                    key={ref_item.id}
                    className="flex min-h-14 flex-wrap items-center justify-between gap-x-3 gap-y-1.5 px-4 py-2.5 hover:bg-surf-hover transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm text-txt-primary">
                        {ref_item.referee_email_masked}
                      </p>
                      <p className="text-xs mt-0.5 text-txt-muted">
                        {format_date(ref_item.created_at)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={
                          ref_item.status === "completed"
                            ? "aster_badge aster_badge_green"
                            : "aster_badge aster_badge_amber"
                        }
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
              </Island>
            </div>
          )}

          {referral_history_list.length === 0 && (
            <Island className="text-center" padding="lg">
              <p className="text-xs text-txt-muted">
                {t("settings.no_referrals_yet")}
              </p>
            </Island>
          )}
        </>
      ) : (
        <Island className="text-center" padding="lg">
          <p className="text-sm text-txt-secondary">
            {t("settings.referral_loading")}
          </p>
        </Island>
      )}
    </IslandSection>
  );
}
