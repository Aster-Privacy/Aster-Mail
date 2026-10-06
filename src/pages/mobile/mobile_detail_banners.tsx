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
  ChevronRightIcon,
  EnvelopeIcon,
  ShieldExclamationIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { ShieldCheckIcon } from "@heroicons/react/24/solid";

import { is_system_email } from "@/lib/utils";
import {
  TrackingProtectionDetails,
  summarize_tracking_protection,
} from "@/components/email/tracking_protection_details";
import { MobileBottomSheet } from "@/components/mobile/mobile_bottom_sheet";
import {
  execute_unsubscribe,
  get_sender_domain,
  get_manual_unsubscribe_url,
} from "@/utils/unsubscribe_detector";
import { open_external } from "@/utils/open_link";
import {
  persist_unsubscribe,
  use_unsubscribed_senders,
} from "@/hooks/use_unsubscribed_senders";
import { show_action_toast } from "@/components/toast/action_toast";
import { is_any_lockdown_active } from "@/services/lockdown_store";
import { use_preferences } from "@/contexts/preferences_context";
import { get_undo_send_delay_ms } from "@/services/send_queue";

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
  const { is_unsubscribed } = use_unsubscribed_senders();
  const [dismissed, set_dismissed] = useState(false);
  const pending_timeout_ref = useRef<NodeJS.Timeout | null>(null);
  const cancelled_ref = useRef(false);
  const mounted_ref = useRef(true);

  useEffect(() => {
    mounted_ref.current = true;

    return () => {
      mounted_ref.current = false;
    };
  }, []);

  if (dismissed || !email.unsubscribe_info?.has_unsubscribe) return null;
  if (is_system_email(email)) return null;
  if (is_unsubscribed(email.sender_email)) return null;

  const info = email.unsubscribe_info;
  const domain = get_sender_domain(email.sender_email);

  const record_unsubscribed = () =>
    persist_unsubscribe(
      email.sender_email,
      email.sender || "",
      {
        unsubscribe_link: info.unsubscribe_link,
        list_unsubscribe_header: info.list_unsubscribe_header,
      },
      "manual",
    );

  const handle_unsubscribe = () => {
    cancelled_ref.current = false;
    set_dismissed(true);

    const delay_ms = get_undo_send_delay_ms(
      preferences.undo_send_enabled,
      preferences.undo_send_seconds,
      preferences.undo_send_period,
    );

    if (delay_ms > 0) {
      show_action_toast({
        message: t("settings.unsubscribing"),
        action_type: "not_spam",
        email_ids: [],
        duration_ms: delay_ms,
        on_undo: async () => {
          cancelled_ref.current = true;
          if (pending_timeout_ref.current) {
            clearTimeout(pending_timeout_ref.current);
            pending_timeout_ref.current = null;
          }
          if (mounted_ref.current) set_dismissed(false);
        },
      });
    }

    pending_timeout_ref.current = setTimeout(async () => {
      pending_timeout_ref.current = null;
      if (cancelled_ref.current) return;

      try {
        const result = await execute_unsubscribe(info as never);

        if (result === "api") {
          record_unsubscribed();
          show_action_toast({
            message: t("mail.successfully_unsubscribed"),
            action_type: "not_spam",
            email_ids: [],
          });
        }
        if (result !== "api") {
          const url = get_manual_unsubscribe_url(info);
          const lockdown = is_any_lockdown_active();

          show_action_toast({
            message: t("mail.unsubscribe_manual_required"),
            action_type: "not_spam",
            email_ids: [],
            duration_ms: 15000,
            ...(!lockdown &&
              url && {
                action_label: t("mail.open_unsubscribe_page"),
                on_undo: async () => {
                  open_external(url);
                  record_unsubscribed();
                },
              }),
          });
          if (mounted_ref.current && (lockdown || !url)) {
            set_dismissed(false);
          }
        }
      } catch {
        if (mounted_ref.current) set_dismissed(false);
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
            className="rounded-[var(--aster-radius-control)] bg-brand px-2.5 py-1 text-[12px] font-medium text-[var(--accent-fg,#ffffff)] active:opacity-70"
            type="button"
            onClick={handle_unsubscribe}
          >
            {t("mail.unsubscribe")}
          </button>
          <button
            className="rounded-[14px] p-1 text-[var(--text-muted)] active:bg-[var(--bg-tertiary)]"
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
  const [trackers_open, set_trackers_open] = useState(false);

  const tracking_summary = summarize_tracking_protection(report);
  const tracking_pixels = tracking_summary.spy_pixels;

  if (dismissed || report.blocked_count === 0) return null;
  const parts: string[] = [];

  if (report.has_remote_images) {
    const count = report.blocked_items.filter((i) => i.type === "image").length;

    if (count > 0) parts.push(t("common.images_count", { count }));
  }
  if (report.has_remote_fonts) parts.push(t("common.fonts"));
  if (report.has_remote_css) parts.push(t("common.stylesheets"));
  const other_count = report.blocked_count - tracking_pixels.count;
  const message =
    parts.length > 0
      ? parts.join(", ")
      : other_count > 0
        ? t("common.blocked_items_count", { count: other_count })
        : "";

  return (
    <div className="mx-4 mt-3 rounded-lg border border-[var(--border-primary)] bg-[var(--bg-secondary)] px-3 py-2.5">
      <div className="flex items-center gap-3">
        <ShieldExclamationIcon className="h-5 w-5 shrink-0 text-amber-500" />
        <div className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
          {message && (
            <p className="text-[13px] text-[var(--text-primary)]">
              {t("mail.external_content_blocked", { message })}
            </p>
          )}
          {tracking_pixels.count > 0 && (
            <button
              aria-expanded={trackers_open}
              aria-haspopup="dialog"
              className="-ms-1 inline-flex items-center gap-1 rounded-[var(--aster-radius-control)] px-1 py-0.5 text-[12px] font-medium text-[var(--text-secondary)] active:bg-[var(--bg-tertiary)]"
              data-testid="tracking-pixel-indicator"
              type="button"
              onClick={() => set_trackers_open(true)}
            >
              <ShieldCheckIcon
                aria-hidden="true"
                className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-500"
              />
              {t("common.tracking_pixels_count", {
                count: tracking_pixels.count,
              })}
              <ChevronRightIcon
                aria-hidden="true"
                className="h-3.5 w-3.5 shrink-0 stroke-[2.25] rtl:rotate-180"
              />
            </button>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            className="rounded-[var(--aster-radius-control)] bg-[var(--accent-color,#4f6ef7)] px-2.5 py-1 text-[12px] font-medium text-[var(--accent-fg,#ffffff)] active:opacity-70"
            type="button"
            onClick={on_load}
          >
            {t("common.load_content")}
          </button>
          <button
            className="rounded-[14px] p-1 text-[var(--text-muted)] active:bg-[var(--bg-tertiary)]"
            type="button"
            onClick={() => set_dismissed(true)}
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div
        className="contents"
        onTouchEnd={(e) => e.stopPropagation()}
        onTouchMove={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
      >
        <MobileBottomSheet
          aria_label={t("mail.tracking_protection")}
          is_open={trackers_open && tracking_pixels.count > 0}
          on_close={() => set_trackers_open(false)}
        >
          <div className="px-2 pb-2">
            <TrackingProtectionDetails summary={tracking_summary} />
            <div className="mx-4 my-1 border-t border-[var(--border-primary)]" />
            <button
              className="flex w-full items-center justify-center rounded-[16px] px-4 py-3 text-[15px] font-medium text-[var(--text-secondary)] active:bg-[var(--bg-tertiary)]"
              type="button"
              onClick={() => set_trackers_open(false)}
            >
              {t("common.close")}
            </button>
          </div>
        </MobileBottomSheet>
      </div>
    </div>
  );
}
