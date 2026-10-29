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
import type { InboxEmail } from "@/types/email";

import { useMemo } from "react";

import { detect_unsubscribe_info } from "@/utils/unsubscribe_detector";
import { use_unsubscribed_senders } from "@/hooks/use_unsubscribed_senders";
import { use_unsubscribe_action } from "@/hooks/use_unsubscribe_action";
import { use_i18n } from "@/lib/i18n/context";
import { safe_sender_name } from "@/lib/sender_trust_store";

interface RowUnsubscribeChipProps {
  email: Pick<
    InboxEmail,
    | "sender_email"
    | "sender_name"
    | "list_unsubscribe"
    | "list_unsubscribe_post"
    | "dkim_result"
  >;
}

export function row_has_unsubscribe_header(
  email: Pick<InboxEmail, "list_unsubscribe" | "sender_email">,
): boolean {
  return Boolean(email.list_unsubscribe?.trim() && email.sender_email);
}

export function RowUnsubscribeChip({ email }: RowUnsubscribeChipProps) {
  const { t } = use_i18n();
  const { is_unsubscribed } = use_unsubscribed_senders();
  const unsubscribe_info = useMemo(
    () =>
      detect_unsubscribe_info(undefined, undefined, {
        list_unsubscribe: email.list_unsubscribe,
        list_unsubscribe_post: email.list_unsubscribe_post,
        dkim_result: email.dkim_result,
      }),
    [email.list_unsubscribe, email.list_unsubscribe_post, email.dkim_result],
  );
  const { unsubscribe, is_pending } = use_unsubscribe_action({
    unsubscribe_info,
    sender_email: email.sender_email,
    sender_name: safe_sender_name(email.sender_name, email.sender_email),
  });

  if (
    !unsubscribe_info.has_unsubscribe ||
    is_pending ||
    is_unsubscribed(email.sender_email)
  ) {
    return null;
  }

  return (
    <button
      className="inline-flex h-7 items-center rounded-[14px] px-2 text-[12.5px] font-medium leading-none text-txt-muted transition-colors hover:bg-black/10 hover:text-txt-primary dark:hover:bg-white/10"
      data-testid="row-unsubscribe"
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        unsubscribe();
      }}
    >
      {t("mail.unsubscribe")}
    </button>
  );
}
