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
import type { CardDecline } from "@/services/api/billing";

import { ExclamationTriangleIcon } from "@heroicons/react/24/solid";

import { use_i18n } from "@/lib/i18n/context";

interface CardDeclineNoticeProps {
  decline: CardDecline | null | undefined;
  class_name?: string;
}

const decline_reason_messages = {
  insufficient_funds: "settings.card_declined_insufficient_funds",
  expired_card: "settings.card_declined_expired_card",
  card_details: "settings.card_declined_card_details",
  card_not_supported: "settings.card_declined_card_not_supported",
  contact_bank: "settings.card_declined_contact_bank",
} as const;

type DeclineMessageKey =
  (typeof decline_reason_messages)[keyof typeof decline_reason_messages];

export function card_decline_message_key(reason: string): DeclineMessageKey {
  return (
    decline_reason_messages[reason as keyof typeof decline_reason_messages] ??
    decline_reason_messages.contact_bank
  );
}

export function CardDeclineNotice({
  decline,
  class_name = "",
}: CardDeclineNoticeProps) {
  const { t } = use_i18n();

  if (!decline) return null;

  return (
    <div
      className={`rounded-2xl border border-amber-500/30 bg-amber-500/10 px-5 py-4 ${class_name}`}
      role="status"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <span
          aria-hidden="true"
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-amber-500/20 text-amber-600 dark:text-amber-400"
        >
          <ExclamationTriangleIcon className="h-5 w-5" />
        </span>

        <div className="min-w-0">
          <p className="text-[15px] font-semibold leading-tight text-amber-900 dark:text-amber-200">
            {t("settings.card_declined_title")}
          </p>
          <p className="mt-1.5 text-xs leading-relaxed text-amber-900/80 dark:text-amber-200/80">
            {t(card_decline_message_key(decline.reason))}
          </p>
        </div>
      </div>
    </div>
  );
}
