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

import { useState, useCallback } from "react";
import {
  XMarkIcon,
  PaperAirplaneIcon,
  PencilIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";

import { EmailTag } from "@/components/ui/email_tag";
import { ProfileAvatar } from "@/components/ui/profile_avatar";
import { ConfirmationModal } from "@/components/modals/confirmation_modal";
import { use_i18n } from "@/lib/i18n/context";
import {
  cancel_scheduled_email,
  send_scheduled_now,
  get_scheduled_email,
  type ScheduledEmailWithContent,
} from "@/services/api/scheduled";
import { use_auth } from "@/contexts/auth_context";
import { show_action_toast } from "@/components/toast/action_toast";
import { show_toast } from "@/components/toast/simple_toast";
import { DdgFavicon } from "@/components/compose/compose_shared";
import {
  sanitize_html,
  is_html_content,
  has_rich_html,
  plain_text_to_html,
} from "@/lib/html_sanitizer";
import { get_image_proxy_url } from "@/lib/image_proxy";
import { get_email_username } from "@/lib/utils";
import { SandboxedEmailRenderer } from "@/components/email/sandboxed_email_renderer";

interface ScheduledData {
  id: string;
  to_recipients: string[];
  cc_recipients: string[];
  bcc_recipients: string[];
  subject: string;
  body: string;
  scheduled_at: string;
}

interface SplitScheduledViewerProps {
  scheduled_data: ScheduledData;
  on_close: () => void;
  on_edit?: (email: ScheduledEmailWithContent) => void;
}

function format_scheduled_time(
  iso_string: string,
  t: (key: TranslationKey, params?: Record<string, string | number>) => string,
): string {
  const date = new Date(iso_string);
  const now = new Date();
  const diff_ms = date.getTime() - now.getTime();
  const diff_hours = diff_ms / (1000 * 60 * 60);

  if (diff_hours < 0) {
    return t("common.sending_soon");
  }

  if (diff_hours < 1) {
    const mins = Math.round(diff_hours * 60);

    return t("common.in_x_minutes", { count: mins });
  }

  if (diff_hours < 24) {
    return date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return date.toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function format_full_date(iso_string: string): string {
  const date = new Date(iso_string);

  return date.toLocaleDateString([], {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function SplitScheduledViewer({
  scheduled_data,
  on_close,
  on_edit,
}: SplitScheduledViewerProps): React.ReactElement {
  const { t } = use_i18n();
  const { vault } = use_auth();
  const [show_cancel_confirm, set_show_cancel_confirm] = useState(false);
  const [is_cancelling, set_is_cancelling] = useState(false);
  const [is_sending_now, set_is_sending_now] = useState(false);
  const [is_loading_content, set_is_loading_content] = useState(false);

  const copy_to_clipboard = useCallback(async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      show_toast(t("common.item_copied", { label }), "success");
    } catch (error) {
      if (import.meta.env.DEV) console.error(error);
      const textarea = document.createElement("textarea");

      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      show_toast(t("common.item_copied", { label }), "success");
    }
  }, []);

  const handle_cancel = useCallback(async () => {
    set_is_cancelling(true);

    const response = await cancel_scheduled_email(scheduled_data.id);

    set_is_cancelling(false);
    set_show_cancel_confirm(false);

    if (!response.error) {
      show_action_toast({
        message: t("common.scheduled_email_cancelled"),
        action_type: "trash",
        email_ids: [scheduled_data.id],
      });
      window.dispatchEvent(new CustomEvent("astermail:mail-changed"));
      on_close();
    }
  }, [scheduled_data.id, on_close]);

  const handle_send_now = useCallback(async () => {
    set_is_sending_now(true);

    const response = await send_scheduled_now(scheduled_data.id);

    set_is_sending_now(false);

    if (!response.error) {
      show_toast(t("common.email_sent_successfully"), "success");
      window.dispatchEvent(new CustomEvent("astermail:mail-changed"));
      on_close();
    }
  }, [scheduled_data.id, on_close]);

  const handle_edit = useCallback(async () => {
    if (!vault || !on_edit) return;

    set_is_loading_content(true);

    const response = await get_scheduled_email(scheduled_data.id, vault);

    set_is_loading_content(false);

    if (!response.error && response.data) {
      on_edit(response.data);
      on_close();
    }
  }, [scheduled_data.id, vault, on_edit, on_close]);

  const primary_recipient = scheduled_data.to_recipients[0] || "";
  const recipient_name =
    get_email_username(primary_recipient) || t("common.recipient");

  return (
    <div className="flex flex-col h-full bg-surf-primary">
      <div
        className="flex-1 overflow-y-auto"
        style={{ scrollbarGutter: "stable" }}
      >
        <div className="p-3 @md:p-4 @2xl:p-6">
          <div className="flex items-start justify-between gap-2 @lg:gap-4 mb-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1 mb-1 flex-wrap">
                <EmailTag
                  label={t("mail.scheduled")}
                  size="default"
                  variant="scheduled"
                />
                <EmailTag
                  icon="clock"
                  label={format_scheduled_time(scheduled_data.scheduled_at, t)}
                  size="default"
                  variant="scheduled"
                />
              </div>
              <button
                className="text-base @md:text-lg @2xl:text-xl font-semibold cursor-pointer hover:opacity-80 transition-opacity text-left break-words min-w-0 text-txt-primary"
                type="button"
                onClick={() =>
                  copy_to_clipboard(
                    scheduled_data.subject || t("mail.no_subject"),
                    t("mail.subject"),
                  )
                }
              >
                {scheduled_data.subject || t("mail.no_subject")}
              </button>
            </div>
            <button
              className="p-1.5 rounded-[14px] transition-colors hover:bg-surf-hover flex-shrink-0 -mt-1 -mr-1 text-txt-muted"
              onClick={on_close}
            >
              <XMarkIcon className="w-5 h-5" />
            </button>
          </div>

          <div className="flex items-start gap-2 @lg:gap-3 mb-6">
            <ProfileAvatar
              clickable
              email={primary_recipient}
              name={recipient_name}
              size="lg"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center min-w-0">
                  <span className="font-medium text-sm flex items-center gap-1 flex-wrap text-txt-primary">
                    <span>{t("mail.to")}:</span>
                    {scheduled_data.to_recipients.map((email, i) => (
                      <span
                        key={email}
                        className="inline-flex items-center gap-1"
                      >
                        <DdgFavicon email={email} size={14} />
                        <span>{email}</span>
                        {i < scheduled_data.to_recipients.length - 1 && (
                          <span>,</span>
                        )}
                      </span>
                    ))}
                  </span>
                </div>
              </div>
              {scheduled_data.cc_recipients.length > 0 && (
                <div className="text-xs mt-0.5 flex items-center gap-1 flex-wrap text-txt-muted">
                  <span>{t("mail.cc")}:</span>
                  {scheduled_data.cc_recipients.map((email, i) => (
                    <span
                      key={email}
                      className="inline-flex items-center gap-1"
                    >
                      <DdgFavicon email={email} size={12} />
                      <span>{email}</span>
                      {i < scheduled_data.cc_recipients.length - 1 && (
                        <span>,</span>
                      )}
                    </span>
                  ))}
                </div>
              )}
              {scheduled_data.bcc_recipients.length > 0 && (
                <div className="text-xs mt-0.5 flex items-center gap-1 flex-wrap text-txt-muted">
                  <span>{t("mail.bcc")}:</span>
                  {scheduled_data.bcc_recipients.map((email, i) => (
                    <span
                      key={email}
                      className="inline-flex items-center gap-1"
                    >
                      <DdgFavicon email={email} size={12} />
                      <span>{email}</span>
                      {i < scheduled_data.bcc_recipients.length - 1 && (
                        <span>,</span>
                      )}
                    </span>
                  ))}
                </div>
              )}
              <p className="text-xs mt-1 text-txt-muted">
                {t("mail.scheduled_for")}{" "}
                {format_full_date(scheduled_data.scheduled_at)}
              </p>
            </div>
          </div>

          <SandboxedEmailRenderer
            is_plain_text={!has_rich_html(scheduled_data.body)}
            sanitized_html={
              is_html_content(scheduled_data.body)
                ? sanitize_html(scheduled_data.body, {
                    image_proxy_url: get_image_proxy_url(),
                    sandbox_mode: true,
                  }).html
                : plain_text_to_html(scheduled_data.body)
            }
          />
        </div>
      </div>

      <div className="flex items-center gap-2 px-3 @md:px-4 py-3 border-t border-edge-primary">
        <Button
          className="flex-1"
          disabled={is_sending_now}
          variant="depth"
          onClick={handle_send_now}
        >
          <PaperAirplaneIcon className="w-4 h-4" />
          {is_sending_now ? t("settings.sending") : t("common.send_now")}
        </Button>
        {on_edit && (
          <button
            className="flex-1 h-10 flex items-center justify-center gap-2 rounded-[14px] text-sm font-medium transition-all duration-150 hover:bg-surf-hover disabled:opacity-50 disabled:cursor-not-allowed bg-surf-secondary text-txt-primary shadow-[0_1px_2px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.06),inset_0_0_0_1px_var(--border-primary)]"
            disabled={is_loading_content}
            onClick={handle_edit}
          >
            <PencilIcon className="w-4 h-4" />
            {is_loading_content ? t("common.loading") : t("common.edit")}
          </button>
        )}
        <button
          className="h-10 w-10 flex items-center justify-center rounded-[10px] transition-colors hover:bg-surf-hover disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={is_cancelling}
          onClick={() => set_show_cancel_confirm(true)}
        >
          <TrashIcon className="w-4 h-4 text-red-500" />
        </button>
      </div>

      <ConfirmationModal
        cancel_text={t("mail.keep_scheduled")}
        confirm_text={
          is_cancelling ? t("mail.cancelling") : t("mail.cancel_email")
        }
        is_open={show_cancel_confirm}
        message={t("mail.cancel_scheduled_confirmation")}
        on_cancel={() => set_show_cancel_confirm(false)}
        on_confirm={handle_cancel}
        title={t("mail.cancel_scheduled_email")}
        variant="danger"
      />
    </div>
  );
}
