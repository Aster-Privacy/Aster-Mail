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
import type { DecryptedThreadMessage } from "@/types/thread";
import type { TranslationKey } from "@/lib/i18n";

import { useMemo, useEffect } from "react";
import {
  ArrowUturnLeftIcon,
  ArrowUturnRightIcon,
  EllipsisHorizontalIcon,
} from "@heroicons/react/24/outline";

import { SandboxedEmailRenderer } from "@/components/email/sandboxed_email_renderer";
import {
  sanitize_html,
  is_html_content,
  has_rich_html,
  plain_text_to_html,
  strip_html_tags,
  type ExternalContentReport,
} from "@/lib/html_sanitizer";
import { is_system_email } from "@/lib/utils";
import { get_image_proxy_url } from "@/lib/image_proxy";
import { MobileAttachmentRow } from "@/components/mobile/mobile_attachment_row";
import { ProfileAvatar } from "@/components/ui/profile_avatar";
import { use_preferences } from "@/contexts/preferences_context";


export function format_safe_date(
  timestamp: string | number | undefined,
  formatter: (date: Date) => string,
): string {
  if (!timestamp) return "";
  const date = new Date(timestamp);

  if (isNaN(date.getTime())) return "";

  return formatter(date);
}

function strip_quotes(body: string): string {
  return (
    body
      .replace(/On .+wrote:[\s\S]*/gi, "")
      .replace(/^>.*$/gm, "")
      .replace(/<blockquote[^>]*>[\s\S]*?<\/blockquote>/gi, "")
      .trim() || body
  );
}

export function MobileThreadMessage({
  message,
  is_expanded,
  is_own_message,
  load_remote_content,
  on_toggle,
  on_reply,
  on_forward,
  on_open_menu,
  on_external_content_detected,
  format_detail,
  t,
  force_dark_mode,
}: {
  message: DecryptedThreadMessage;
  is_expanded: boolean;
  is_own_message: boolean;
  load_remote_content: boolean;
  on_toggle: () => void;
  on_reply: (msg: DecryptedThreadMessage) => void;
  on_forward: (msg: DecryptedThreadMessage) => void;
  on_open_menu: (msg: DecryptedThreadMessage) => void;
  on_external_content_detected?: (report: ExternalContentReport) => void;
  format_detail: (date: Date) => string;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
  force_dark_mode?: boolean;
}) {
  const { preferences } = use_preferences();

  const clean_body = useMemo(() => {
    if (message.html_content && is_html_content(message.html_content)) {
      return message.html_content;
    }

    return strip_quotes(message.body);
  }, [message.body, message.html_content]);

  const collapsed_preview = useMemo(() => {
    const plain = strip_html_tags(clean_body);

    return plain.length > 60 ? plain.substring(0, 60) + "..." : plain;
  }, [clean_body]);

  const is_system = is_system_email(message.sender_email);

  const sanitize_result = useMemo(() => {
    if (!is_html_content(clean_body)) {
      return {
        html: plain_text_to_html(clean_body),
        external_content: {
          has_remote_images: false,
          has_remote_fonts: false,
          has_remote_css: false,
          has_tracking_pixels: false,
          blocked_count: 0,
          blocked_items: [],
          cleaned_links: [],
        } as ExternalContentReport,
        body_background: undefined,
      };
    }

    return sanitize_html(clean_body, {
      external_content_mode: is_system
        ? "always"
        : preferences.load_remote_images,
      image_proxy_url: get_image_proxy_url(),
      sandbox_mode: true,
      content_blocking:
        !is_system && preferences.block_external_content
          ? {
              block_remote_images: preferences.block_remote_images,
              block_remote_fonts: preferences.block_remote_fonts,
              block_remote_css: preferences.block_remote_css,
              block_tracking_pixels: preferences.block_tracking_pixels,
            }
          : undefined,
    });
  }, [clean_body, is_system, preferences]);

  const sanitized_html = sanitize_result.html;

  useEffect(() => {
    if (
      is_expanded &&
      sanitize_result.external_content.blocked_count > 0 &&
      on_external_content_detected
    ) {
      on_external_content_detected(sanitize_result.external_content);
    }
  }, [
    is_expanded,
    sanitize_result.external_content,
    on_external_content_detected,
  ]);

  if (message.is_deleted) {
    return (
      <div className="px-4 py-3 text-[14px] italic text-[var(--text-muted)]">
        {t("mail.message_deleted")}
      </div>
    );
  }

  if (!is_expanded) {
    return (
      <div
        className="border border-[var(--border-primary)] rounded-xl mx-3 my-1.5 overflow-hidden bg-[var(--thread-header-bg)]"
        role="button"
        tabIndex={0}
        onClick={on_toggle}
      >
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="shrink-0">
            <ProfileAvatar
              use_domain_logo
              email={message.sender_email}
              name={message.sender_name}
              size="sm"
            />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span
                className={`flex-1 truncate text-[14px] ${
                  message.is_read
                    ? "text-[var(--text-secondary)]"
                    : "font-semibold text-[var(--text-primary)]"
                }`}
              >
                {message.sender_name}
              </span>
              <span className="shrink-0 text-[11px] tabular-nums text-[var(--text-muted)]">
                {format_safe_date(message.timestamp, format_detail)}
              </span>
            </div>
            <p className="truncate text-[13px] text-[var(--text-muted)]">
              {collapsed_preview}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="border border-[var(--border-primary)] rounded-xl mx-3 my-1.5 overflow-hidden bg-[var(--bg-primary)]">
      <div
        className="flex items-start gap-3 px-4 py-3 bg-[var(--thread-header-bg)]"
        role="button"
        tabIndex={0}
        onClick={on_toggle}
      >
        <div className="shrink-0">
          <ProfileAvatar
            use_domain_logo
            email={message.sender_email}
            name={message.sender_name}
            size="md"
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="flex-1 truncate text-[15px] font-semibold text-[var(--text-primary)]">
              {message.sender_name}
            </span>
            <div
              className="flex shrink-0 items-center gap-1.5"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                className="flex h-8 items-center gap-1 rounded-lg px-2.5 text-[var(--text-secondary)] active:opacity-70"
                style={{
                  background: "var(--bg-tertiary)",
                  boxShadow:
                    "0 1px 2px rgba(0,0,0,0.1), inset 0 1px 0 rgba(255,255,255,0.06)",
                  border: "1px solid var(--border-primary)",
                }}
                type="button"
                onClick={() => on_reply(message)}
              >
                <ArrowUturnLeftIcon className="h-4 w-4" />
              </button>
              <button
                className="flex h-8 items-center gap-1 rounded-lg px-2.5 text-[var(--text-secondary)] active:opacity-70"
                style={{
                  background: "var(--bg-tertiary)",
                  boxShadow:
                    "0 1px 2px rgba(0,0,0,0.1), inset 0 1px 0 rgba(255,255,255,0.06)",
                  border: "1px solid var(--border-primary)",
                }}
                type="button"
                onClick={() => on_forward(message)}
              >
                <ArrowUturnRightIcon className="h-4 w-4" />
              </button>
              <button
                className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-secondary)] active:opacity-70"
                style={{
                  background: "var(--bg-tertiary)",
                  boxShadow:
                    "0 1px 2px rgba(0,0,0,0.1), inset 0 1px 0 rgba(255,255,255,0.06)",
                  border: "1px solid var(--border-primary)",
                }}
                type="button"
                onClick={() => on_open_menu(message)}
              >
                <EllipsisHorizontalIcon className="h-4.5 w-4.5" />
              </button>
            </div>
          </div>
          {is_own_message ? (
            <p className="-mt-0.5 text-[12px] leading-tight text-[var(--text-muted)]">
              {t("mail.to_label")}{" "}
              {message.to_recipients && message.to_recipients.length > 0
                ? message.to_recipients.map((r) => r.name || r.email).join(", ")
                : t("mail.unknown_recipient")}
            </p>
          ) : (
            <p className="-mt-0.5 text-[12px] leading-tight text-[var(--text-muted)]">
              {message.sender_email}
            </p>
          )}
          <div className="flex items-center gap-1">
            <span className="text-[11px] leading-tight tabular-nums text-[var(--text-muted)]">
              {format_safe_date(message.timestamp, format_detail)}
            </span>
          </div>
        </div>
      </div>

      <div className={`overflow-hidden ${is_system ? "pt-2 pb-1" : ""}`}>
        <SandboxedEmailRenderer
          body_background={sanitize_result.body_background}
          force_dark_mode={force_dark_mode}
          is_plain_text={!has_rich_html(clean_body)}
          load_remote_content={load_remote_content}
          sanitized_html={sanitized_html}
          variant="mobile"
        />
      </div>

      {message.attachments && message.attachments.length > 0 && (
        <div className="space-y-2 px-4 pb-3">
          {message.attachments.map((att) => (
            <MobileAttachmentRow
              key={att.id}
              content_type={att.content_type}
              filename={att.filename}
              size={att.size}
            />
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 border-t border-[var(--border-primary)] px-4 py-2">
        <button
          className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg text-[13px] font-medium text-white active:opacity-70"
          style={{
            background:
              "linear-gradient(180deg, var(--accent-color, #3b82f6) 0%, var(--accent-color-hover, #2563eb) 100%)",
            boxShadow:
              "0 1px 3px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.15)",
            border: "none",
          }}
          type="button"
          onClick={() => on_reply(message)}
        >
          <ArrowUturnLeftIcon className="h-4 w-4" />
          {t("mail.reply")}
        </button>
        <button
          className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg text-[13px] font-medium text-[var(--text-secondary)] active:opacity-70"
          style={{
            background: "var(--bg-tertiary)",
            boxShadow:
              "0 1px 2px rgba(0,0,0,0.1), inset 0 1px 0 rgba(255,255,255,0.06)",
            border: "1px solid var(--border-primary)",
          }}
          type="button"
          onClick={() => on_forward(message)}
        >
          <ArrowUturnRightIcon className="h-4 w-4" />
          {t("mail.forward")}
        </button>
      </div>
    </div>
  );
}
