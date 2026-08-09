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
import type { } from "@/types/thread";
import type { } from "@/services/api/mail";
import type { } from "@/services/api/multi_drafts";
import type { } from "@/lib/html_sanitizer";
import type { DecryptedEmail } from "@/components/email/use_email_viewer";
import type { } from "@/components/email/hooks/preload_cache";

import React, {    } from "react";
import {
  XMarkIcon,
  EnvelopeIcon,
} from "@heroicons/react/24/outline";

import { use_external_link } from "@/contexts/external_link_context";
import { use_i18n } from "@/lib/i18n/context";
import { is_system_email } from "@/lib/utils";


export interface ViewerUnsubscribeBannerProps {
  email: Pick<
    DecryptedEmail,
    "id" | "sender" | "sender_email" | "unsubscribe_info"
  >;
}

export function ViewerUnsubscribeBanner({
  email,
}: ViewerUnsubscribeBannerProps): React.ReactElement | null {
  const { t } = use_i18n();
  const { handle_external_link } = use_external_link();
  const [status, set_status] = React.useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [dismissed, set_dismissed] = React.useState(false);

  React.useEffect(() => {
    set_dismissed(false);
    set_status("idle");
  }, [email.id]);

  if (dismissed) return null;
  if (!email.unsubscribe_info?.has_unsubscribe) return null;
  if (is_system_email(email.sender_email)) return null;

  const info = email.unsubscribe_info;

  const display_text =
    status === "loading"
      ? t("settings.unsubscribing")
      : status === "success"
        ? t("common.unsubscribed_successfully")
        : status === "error"
          ? t("common.unsubscribe_error_manual")
          : info.method === "one-click"
            ? t("common.one_click_unsubscribe_available")
            : info.method === "mailto"
              ? t("common.email_unsubscribe_available")
              : t("common.unsubscribe_link_available");

  const handle_unsubscribe = async () => {
    const { confirm_unsubscribe } = await import(
      "@/components/modals/unsubscribe_confirmation_modal"
    );
    const confirm_kind =
      info.method === "one-click"
        ? "one_click"
        : info.method === "mailto"
          ? "mailto"
          : "url";
    const confirm_destination =
      info.unsubscribe_link ||
      info.unsubscribe_mailto ||
      info.list_unsubscribe_header ||
      "";

    if (!confirm_destination) {
      return;
    }

    const confirmed = await confirm_unsubscribe(
      confirm_kind,
      confirm_destination,
      email.sender,
    );

    if (!confirmed) return;

    set_status("loading");

    try {
      const { track_subscription, unsubscribe } = await import(
        "@/services/api/subscriptions"
      );

      const track_result = await track_subscription({
        sender_email: email.sender_email,
        sender_name: email.sender,
        unsubscribe_link: info.unsubscribe_link,
        list_unsubscribe_header: info.list_unsubscribe_header,
      });

      if (!track_result.data?.subscription_id) {
        set_status("error");

        return;
      }

      const method =
        info.method === "one-click" || info.list_unsubscribe_header
          ? "list_unsubscribe"
          : info.unsubscribe_link
            ? "link"
            : "manual";

      const result = await unsubscribe(
        track_result.data.subscription_id,
        method as "auto" | "list_unsubscribe" | "link" | "manual",
      );

      set_status(result.data?.success ? "success" : "error");
    } catch (error) {
      if (import.meta.env.DEV) console.error(error);
      set_status("error");
    }
  };

  return (
    <div className="mb-4 px-4">
      <div className="rounded-lg bg-surf-tertiary text-txt-secondary border border-edge-primary">
        <div className="flex items-center justify-between px-4 py-2.5">
          <div className="flex items-center gap-3 min-w-0">
            <EnvelopeIcon
              className="w-5 h-5 flex-shrink-0"
              style={{
                color:
                  status === "success"
                    ? "var(--success-color, #22c55e)"
                    : "var(--text-tertiary)",
              }}
            />
            <span className="text-sm">{display_text}</span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {status === "idle" &&
              (info.unsubscribe_link ||
                info.unsubscribe_mailto ||
                info.list_unsubscribe_header) && (
                <button
                  className="rounded-[12px] px-3 py-1 text-sm font-medium transition-colors bg-brand text-[var(--accent-fg,#ffffff)]"
                  type="button"
                  onClick={handle_unsubscribe}
                >
                  {t("mail.unsubscribe")}
                </button>
              )}
            {status === "error" && info.unsubscribe_link && (
              <button
                className="rounded-[12px] px-3 py-1 text-sm font-medium transition-colors bg-brand text-[var(--accent-fg,#ffffff)]"
                type="button"
                onClick={() => handle_external_link(info.unsubscribe_link!)}
              >
                {t("common.open_link")}
              </button>
            )}
            <button
              className="p-1 rounded-[14px] transition-colors text-txt-muted"
              title={t("common.dismiss")}
              type="button"
              onClick={() => set_dismissed(true)}
            >
              <XMarkIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

