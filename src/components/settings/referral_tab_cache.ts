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
import type {
  MyAffiliatePayoutRequestItem,
  MyAffiliateStatus,
  MyReferralStatus,
  ReferralHistoryItem,
  ReferralInfo,
} from "@/services/api/billing";

export interface ReferralTabSnapshot {
  info: ReferralInfo | null;
  history: ReferralHistoryItem[];
  my_status: MyReferralStatus | null;
  affiliate_status: MyAffiliateStatus | null;
  payout_history: MyAffiliatePayoutRequestItem[];
}

let cached_snapshot: ReferralTabSnapshot | null = null;

export function peek_referral_tab(): ReferralTabSnapshot | null {
  return cached_snapshot;
}

export function remember_referral_tab(snapshot: ReferralTabSnapshot): void {
  if (!snapshot.info) return;
  cached_snapshot = snapshot;
}

export function clear_referral_tab_cache(): void {
  cached_snapshot = null;
}
