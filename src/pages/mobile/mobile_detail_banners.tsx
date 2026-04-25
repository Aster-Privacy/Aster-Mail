//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
import type { ExternalContentReport } from "@/lib/html_sanitizer";
import type { TranslationKey } from "@/lib/i18n";

import { useState, useRef, useEffect } from "react";
import {
  EnvelopeIcon,
  ShieldExclamationIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";

import { is_system_email } from "@/lib/utils";
import {
  execute_unsubscribe,
  get_sender_domain,
} from "@/utils/unsubscribe_detector";
import { track_subscription } from "@/services/api/subscriptions";
import { persist_unsubscribe } from "@/hooks/use_unsubscribed_senders";
import { show_action_toast } from "@/components/toast/action_toast";
import { use_preferences } from "@/contexts/preferences_context";

export function MobileUnsubscribeBanner({
  email,
  t,
}: {
  email: {
    sender_email: string;
    sender: string;
    unsubscribe_info?: {
      has_unsubscribe: boolean;
      unsubscribe_link?: string;
      list_unsubscribe_header?: string;
      unsubscribe_mailto?: string;
      method: string;
    };
  };
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}) {
  const { preferences } = use_preferences();
  const [dismissed, set_dismissed] = useState(false);
  const pending_timeout_ref = useRef<NodeJS.Timeout | null>(null);
  const cancelled_ref = useRef(false);

  useEffect(() => {
    return () => {
      if (pending_timeout_ref.current) {
        clearTimeout(pending_timeout_ref.current);
      }
    };
  }, []);

  if (dismissed || !email.unsubscribe_info?.has_unsubscribe) return null;
  if (is_system_email(email.sender_email)) return null;

  const info = email.unsubscribe_info;
  const domain = get_sender_domain(email.sender_email);

  const handle_unsubscribe = () => {
    cancelled_ref.current = false;
    set_dismissed(true);

    const delay_seconds = preferences.undo_send_seconds ?? 10;
    const delay_ms = delay_seconds * 1000;

    track_subscription({
      sender_email: email.sender_email,
      sender_name: email.sender,
      unsubscribe_link: info.unsubscribe_link,
      list_unsubscribe_header: info.list_unsubscribe_header,
    }).catch(() => {});

    show_action_toast({
      message: t("mail.successfully_unsubscribed"),
      action_type: "not_spam",
      email_ids: [],
      duration_ms: delay_ms,
      on_undo: async () => {
        cancelled_ref.current = true;
        if (pending_timeout_ref.current) {
          clearTimeout(pending_timeout_ref.current);
          pending_timeout_ref.current = null;
        }
        set_dismissed(false);
      },
    });

    pending_timeout_ref.current = setTimeout(async () => {
      pending_timeout_ref.current = null;
      if (cancelled_ref.current) return;

      try {
        const result = await execute_unsubscribe(info as never);
        if (result === "api") {
          persist_unsubscribe(email.sender_email, email.sender || "", {
            unsubscribe_link: info.unsubscribe_link,
            list_unsubscribe_header: info.list_unsubscribe_header,
          }, "auto");
        }
        if (result !== "api") {
          const url = info.unsubscribe_link || info.unsubscribe_mailto;
          show_action_toast({
            message: t("mail.unsubscribe_manual_required"),
            action_type: "not_spam",
            email_ids: [],
            duration_ms: 15000,
            action_label: t("mail.open_unsubscribe_page"),
            on_undo: async () => {
              if (url) window.open(url, "_blank", "noopener,noreferrer");
            },
          });
        }
      } catch {
        show_action_toast({
          message: t("mail.unsubscribe_failed"),
          action_type: "not_spam",
          email_ids: [],
        });
      }
    }, delay_ms);
  };

  return (
    <div className="mx-4 mt-3 rounded-lg border border-[var(--border-primary)] bg-[var(--bg-secondary)] px-3 py-2.5">
      <div className="flex items-center gap-3">
        <EnvelopeIcon className="h-5 w-5 shrink-0 text-[var(--text-muted)]" />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] text-[var(--text-primary)]">
            {`${t("mail.stop_receiving_from")} ${domain}`}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            className="rounded-md bg-brand px-2.5 py-1 text-[12px] font-medium text-white active:opacity-70"
            type="button"
            onClick={handle_unsubscribe}
          >
            {t("mail.unsubscribe")}
          </button>
          <button
            className="rounded-md p-1 text-[var(--text-muted)] active:bg-[var(--bg-tertiary)]"
            type="button"
            onClick={() => set_dismissed(true)}
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

export function MobileExternalContentBanner({
  report,
  on_load,
  t,
}: {
  report: ExternalContentReport;
  on_load: () => void;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}) {
  const [dismissed, set_dismissed] = useState(false);

  if (dismissed || report.blocked_count === 0) return null;

  const parts: string[] = [];

  if (report.has_remote_images) {
    const count = report.blocked_items.filter((i) => i.type === "image").length;

    if (count > 0) parts.push(count === 1 ? t("common.images_count").replace("{{count}}", "1") : t("common.images_count_plural").replace("{{count}}", String(count)));
  }
  if (report.has_tracking_pixels)
    parts.push(t("common.tracking_pixels"));
  if (report.has_remote_fonts) parts.push(t("common.fonts"));
  if (report.has_remote_css) parts.push(t("common.stylesheets"));
  const message =
    parts.length > 0 ? parts.join(", ") : t("common.blocked_items_count").replace("{{count}}", String(report.blocked_count));

  return (
    <div className="mx-4 mt-3 rounded-lg border border-[var(--border-primary)] bg-[var(--bg-secondary)] px-3 py-2.5">
      <div className="flex items-center gap-3">
        <ShieldExclamationIcon className="h-5 w-5 shrink-0 text-amber-500" />
        <p className="min-w-0 flex-1 text-[13px] text-[var(--text-primary)]">
          {t("mail.external_content_blocked").replace(
            "{{message}}",
            message,
          )}
        </p>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            className="rounded-md bg-[var(--accent-color,#4f6ef7)] px-2.5 py-1 text-[12px] font-medium text-white active:opacity-70"
            type="button"
            onClick={on_load}
          >
            {t("common.load_content")}
          </button>
          <button
            className="rounded-md p-1 text-[var(--text-muted)] active:bg-[var(--bg-tertiary)]"
            type="button"
            onClick={() => set_dismissed(true)}
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
