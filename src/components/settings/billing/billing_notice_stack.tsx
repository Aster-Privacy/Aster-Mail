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
import type { SubscriptionResponse } from "@/services/api/billing";

import { CurrentPlanNotices } from "@/components/settings/billing/current_plan_card";
import { CardDeclineNotice } from "@/components/settings/billing/card_decline_notice";
import { CryptoResumeBanner } from "@/components/settings/billing/crypto_resume_banner";
import { ResumeCheckoutCard } from "@/components/settings/billing/resume_checkout_card";
import { WinBackOfferCard } from "@/components/settings/billing/win_back_offer_card";
import { YearlySwitchCard } from "@/components/settings/billing/yearly_switch_card";

interface BillingNoticeStackProps {
  subscription: SubscriptionResponse | null;
  preferred_currency: string;
  grace_days_remaining: number;
  has_payment_failed: boolean;
  is_action_loading: boolean;
  is_over_limit: boolean;
  on_add_storage: () => void;
  on_manage_billing: () => void;
  on_reactivate: () => void;
  on_renew_with_crypto: () => void;
  on_choose_plan: () => void;
  on_switch_to_yearly: (plan_code: string) => void;
}

export function BillingNoticeStack({
  subscription,
  preferred_currency,
  grace_days_remaining,
  has_payment_failed,
  is_action_loading,
  is_over_limit,
  on_add_storage,
  on_manage_billing,
  on_reactivate,
  on_renew_with_crypto,
  on_choose_plan,
  on_switch_to_yearly,
}: BillingNoticeStackProps) {
  return (
    <div className="flex flex-col gap-2 empty:hidden">
      <CurrentPlanNotices
        grace_days_remaining={grace_days_remaining}
        has_payment_failed={has_payment_failed}
        is_action_loading={is_action_loading}
        is_over_limit={is_over_limit}
        on_add_storage={on_add_storage}
        on_manage_billing={on_manage_billing}
        on_reactivate={on_reactivate}
        on_renew_with_crypto={on_renew_with_crypto}
        subscription={subscription}
      />

      {!has_payment_failed && (
        <CardDeclineNotice decline={subscription?.last_card_decline} />
      )}

      <CryptoResumeBanner />

      <ResumeCheckoutCard current_plan_code={subscription?.plan.code ?? null} />

      <WinBackOfferCard
        offer={subscription?.pending_offer}
        on_choose_plan={on_choose_plan}
      />

      <YearlySwitchCard
        currency={preferred_currency}
        offer={subscription?.yearly_switch_offer}
        on_switch={on_switch_to_yearly}
      />
    </div>
  );
}
