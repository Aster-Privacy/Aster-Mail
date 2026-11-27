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
import type { TranslationKey } from "@/lib/i18n/types";
import type { UnsubscribeInfo } from "@/types/email";
import type { UnsubscribeResult } from "@/utils/unsubscribe_detector";

import { show_action_toast } from "@/components/toast/action_toast";
import { is_any_lockdown_active } from "@/services/lockdown_store";
import { get_manual_unsubscribe_url } from "@/utils/unsubscribe_detector";
import { request_external_link } from "@/utils/external_link_request";

export type UnsubscribeOutcome = UnsubscribeResult | "error";

export interface UnsubscribeToastCopy {
  message_key: TranslationKey;
  tone: "success" | "info" | "error";
  offers_page: boolean;
}

const MANUAL_TOAST_MS = 12000;

export function resolve_unsubscribe_toast_copy(
  outcome: UnsubscribeOutcome,
  has_page: boolean,
): UnsubscribeToastCopy {
  if (outcome === "api") {
    return {
      message_key: "mail.successfully_unsubscribed",
      tone: "success",
      offers_page: false,
    };
  }

  const was_attempted = outcome === "failed" || outcome === "error";

  if (!has_page) {
    return was_attempted
      ? {
          message_key: "mail.unsubscribe_failed",
          tone: "error",
          offers_page: false,
        }
      : {
          message_key: "mail.unsubscribe_use_email_link",
          tone: "info",
          offers_page: false,
        };
  }

  return was_attempted
    ? {
        message_key: "mail.unsubscribe_not_confirmed",
        tone: "error",
        offers_page: true,
      }
    : {
        message_key: "mail.unsubscribe_on_website",
        tone: "info",
        offers_page: true,
      };
}

export interface ShowUnsubscribeToastOptions {
  outcome: UnsubscribeOutcome;
  info: UnsubscribeInfo;
  t: (key: TranslationKey) => string;
  on_page_opened?: () => void;
}

export function show_unsubscribe_toast({
  outcome,
  info,
  t,
  on_page_opened,
}: ShowUnsubscribeToastOptions): boolean {
  const url =
    outcome === "api" || is_any_lockdown_active()
      ? ""
      : get_manual_unsubscribe_url(info);
  const copy = resolve_unsubscribe_toast_copy(outcome, !!url);

  show_action_toast({
    message: t(copy.message_key),
    action_type: "unsubscribe",
    email_ids: [],
    result_tone: copy.tone,
    sound:
      copy.tone === "success"
        ? "done"
        : copy.tone === "error"
          ? "fail"
          : "none",
    ...(copy.offers_page && {
      duration_ms: MANUAL_TOAST_MS,
      actions: [
        {
          label: t("mail.open_page"),
          on_press: () => {
            void request_external_link(url, null, "unsubscribe").then(
              (opened) => {
                if (opened) on_page_opened?.();
              },
            );
          },
        },
      ],
    }),
  });

  return copy.offers_page;
}
