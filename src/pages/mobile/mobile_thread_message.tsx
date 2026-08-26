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
import type { PhishingLevel } from "@/lib/phishing_analyzer";

import { useMemo, useEffect, useState } from "react";
import {
  ArrowUturnLeftIcon,
  ArrowUturnRightIcon,
  EllipsisHorizontalIcon,
} from "@heroicons/react/24/outline";

import { SandboxedEmailRenderer } from "@/components/email/sandboxed_email_renderer";
import { TranslationBanner } from "@/components/email/banners/translation_banner";
import { use_email_translation } from "@/components/email/hooks/use_email_translation";
import { analyze_email_content } from "@/lib/phishing_analyzer";
import { ignore_error } from "@/lib/ignore_error";
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
import { show_toast } from "@/components/toast/simple_toast";
import {
  attachment_error_key,
  download_attachment_by_id,
} from "@/utils/attachment_download";
import { ProfileAvatar } from "@/components/ui/profile_avatar";
import { use_preferences } from "@/contexts/preferences_context";
import {
  RATCHET_UNDECRYPTABLE_SENTINEL,
  PGP_UNDECRYPTABLE_SENTINEL,
  is_ratchet_envelope,
  is_password_protected_body,
} from "@/utils/email_crypto";
import { PgpPasswordProtectedMessage } from "@/components/email/pgp_password_prompt";
import {
  is_lockdown_enabled,
  LOCKDOWN_CHANGED_EVENT,
} from "@/services/lockdown_store";
import { use_auth_safe } from "@/contexts/auth_context";
import { resolve_received_on_address } from "@/utils/delivered_to";
import { EmailTag } from "@/components/ui/email_tag";
import {
  normalize_alias_candidates,
  use_alias_delivery,
} from "@/hooks/use_alias_delivery";

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
  disable_auto_dark_mode,
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
  disable_auto_dark_mode?: boolean;
}) {
  const { preferences } = use_preferences();
  const auth = use_auth_safe();
  const account_id = auth?.current_account_id ?? "";
  const [lockdown_active, set_lockdown_active] = useState(() =>
    is_lockdown_enabled(account_id),
  );

  useEffect(() => {
    const update = () =>
      set_lockdown_active(is_lockdown_enabled(auth?.current_account_id ?? ""));

    window.addEventListener(LOCKDOWN_CHANGED_EVENT, update);
    window.addEventListener("storage", update);

    return () => {
      window.removeEventListener(LOCKDOWN_CHANGED_EVENT, update);
      window.removeEventListener("storage", update);
    };
  }, [auth?.current_account_id]);

  const [password_unlocked_body, set_password_unlocked_body] = useState<
    string | null
  >(null);
  const password_protected =
    is_password_protected_body(message.body) && password_unlocked_body === null;

  useEffect(() => {
    set_password_unlocked_body(null);
  }, [message.id]);

  const clean_body = useMemo(() => {
    if (password_unlocked_body !== null) {
      return password_unlocked_body;
    }

    if (message.html_content && !is_ratchet_envelope(message.html_content)) {
      return message.html_content;
    }

    return strip_quotes(message.body);
  }, [message.body, message.html_content, password_unlocked_body]);

  const has_plaintext_body =
    !password_protected &&
    !!message.body &&
    message.body !== RATCHET_UNDECRYPTABLE_SENTINEL &&
    message.body !== PGP_UNDECRYPTABLE_SENTINEL &&
    !is_ratchet_envelope(message.body);
  const is_ratchet_undecryptable =
    !has_plaintext_body &&
    (message.body === RATCHET_UNDECRYPTABLE_SENTINEL ||
      message.body === PGP_UNDECRYPTABLE_SENTINEL ||
      is_ratchet_envelope(message.body) ||
      is_ratchet_envelope(message.html_content));

  const collapsed_preview = useMemo(() => {
    if (password_protected) {
      return t("mail.pgp_password_protected_title");
    }

    if (
      clean_body === RATCHET_UNDECRYPTABLE_SENTINEL ||
      clean_body === PGP_UNDECRYPTABLE_SENTINEL
    ) {
      return t("mail.encrypted_message_unavailable");
    }
    const plain = strip_html_tags(clean_body);

    return plain.length > 60 ? plain.substring(0, 60) + "..." : plain;
  }, [clean_body, password_protected, t]);

  const is_system = is_system_email(message);
  const show_sender_name = message.display_sender_name ?? message.sender_name;
  const show_sender_email =
    message.display_sender_email ?? message.sender_email;
  const received_on_address = useMemo(
    () =>
      message.item_type === "received"
        ? resolve_received_on_address(message)
        : undefined,
    [message],
  );

  const alias_candidates_key = useMemo(
    () =>
      message.item_type === "received"
        ? normalize_alias_candidates([
            received_on_address,
            ...(message.to_recipients?.map((r) => r.email) ?? []),
            ...(message.cc_recipients?.map((r) => r.email) ?? []),
          ])
        : "",
    [
      message.item_type,
      message.to_recipients,
      message.cc_recipients,
      received_on_address,
    ],
  );
  const alias_delivery = use_alias_delivery(undefined, alias_candidates_key);

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
      external_content_mode: lockdown_active
        ? "never"
        : is_system
          ? "always"
          : preferences.load_remote_images,
      image_proxy_url: get_image_proxy_url(),
      sandbox_mode: true,
      lockdown_mode: lockdown_active,
      content_blocking:
        !is_system && preferences.block_external_content
          ? {
              block_remote_images:
                lockdown_active || preferences.block_remote_images,
              block_remote_fonts:
                lockdown_active || preferences.block_remote_fonts,
              block_remote_css: lockdown_active || preferences.block_remote_css,
              block_tracking_pixels:
                lockdown_active || preferences.block_tracking_pixels,
            }
          : lockdown_active
            ? {
                block_remote_images: true,
                block_remote_fonts: true,
                block_remote_css: true,
                block_tracking_pixels: true,
              }
            : undefined,
    });
  }, [clean_body, is_system, preferences, lockdown_active]);

  const sanitized_html = sanitize_result.html;

  const translation_enabled = preferences.translate_incoming !== "off";

  const [downloading_attachment_id, set_downloading_attachment_id] = useState<
    string | null
  >(null);
  const [phishing_level, set_phishing_level] = useState<PhishingLevel>("safe");
  const [phishing_checked, set_phishing_checked] = useState(false);

  useEffect(() => {
    if (!translation_enabled) {
      set_phishing_level("safe");
      set_phishing_checked(false);

      return;
    }

    let cancelled = false;

    set_phishing_level("safe");
    set_phishing_checked(false);

    analyze_email_content(
      message.html_content ?? "",
      message.body ?? "",
      message.sender_name ?? "",
      message.sender_email ?? "",
      !is_system,
    )
      .then((result) => {
        if (!cancelled) set_phishing_level(result.level);
      })
      .catch((caught) =>
        ignore_error("pages/mobile/mobile_thread_message:analyze", caught),
      )
      .finally(() => {
        if (!cancelled) set_phishing_checked(true);
      });

    return () => {
      cancelled = true;
    };
  }, [
    translation_enabled,
    message.id,
    message.html_content,
    message.body,
    message.sender_name,
    message.sender_email,
    is_system,
  ]);

  const translation = use_email_translation({
    account_id,
    email_id: message.id,
    subject: message.subject ?? "",
    translatable:
      !is_ratchet_undecryptable &&
      message.is_spam !== true &&
      message.item_type !== "draft" &&
      phishing_checked &&
      phishing_level === "safe",
  });

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
        className="border border-[var(--border-primary)] rounded-xl mx-3 my-1.5 overflow-hidden bg-[var(--thread-header-bg)] cursor-pointer"
        role="button"
        tabIndex={0}
        onClick={on_toggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            on_toggle();
          }
        }}
      >
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="shrink-0">
            <ProfileAvatar
              use_domain_logo
              email={show_sender_email}
              name={show_sender_name}
              sender_authenticated={is_system}
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
                {show_sender_name}
              </span>
              <span className="shrink-0 text-[11px] tabular-nums text-[var(--text-muted)]">
                {format_safe_date(message.timestamp, format_detail)}
              </span>
            </div>
            <p className="truncate text-[13px] text-[var(--text-muted)]">
              {collapsed_preview}
            </p>
          </div>
          <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
            <button
              className="flex h-8 w-8 items-center justify-center rounded-[8px] text-[var(--text-secondary)] active:opacity-70"
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
      </div>
    );
  }

  return (
    <div className="border border-[var(--border-primary)] rounded-xl mx-3 my-1.5 overflow-hidden bg-[var(--bg-primary)]">
      <div
        className="flex items-start gap-3 px-4 py-3 bg-[var(--thread-header-bg)] cursor-pointer"
        role="button"
        tabIndex={0}
        onClick={on_toggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            on_toggle();
          }
        }}
      >
        <div className="shrink-0">
          <ProfileAvatar
            use_domain_logo
            email={show_sender_email}
            name={show_sender_name}
            sender_authenticated={is_system}
            size="md"
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="flex-1 truncate text-[15px] font-semibold text-[var(--text-primary)]">
              {show_sender_name}
            </span>
            <div
              className="flex shrink-0 items-center gap-1.5"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                className="flex h-8 items-center gap-1 rounded-[12px] px-2.5 text-[var(--text-secondary)] active:opacity-70"
                style={{
                  background: "var(--bg-tertiary)",
                  boxShadow:
                    "0 1px 2px rgba(0,0,0,0.1), inset 0 1px 0 rgba(255,255,255,0.06)",
                  border: "1px solid var(--border-primary)",
                }}
                type="button"
                onClick={() => on_reply(message)}
              >
                <ArrowUturnLeftIcon className="h-4 w-4 rtl:-scale-x-100" />
              </button>
              <button
                className="flex h-8 items-center gap-1 rounded-[12px] px-2.5 text-[var(--text-secondary)] active:opacity-70"
                style={{
                  background: "var(--bg-tertiary)",
                  boxShadow:
                    "0 1px 2px rgba(0,0,0,0.1), inset 0 1px 0 rgba(255,255,255,0.06)",
                  border: "1px solid var(--border-primary)",
                }}
                type="button"
                onClick={() => on_forward(message)}
              >
                <ArrowUturnRightIcon className="h-4 w-4 rtl:-scale-x-100" />
              </button>
              <button
                className="flex h-8 w-8 items-center justify-center rounded-[8px] text-[var(--text-secondary)] active:opacity-70"
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
              {show_sender_email}
            </p>
          )}
          {received_on_address && (
            <p className="truncate text-[12px] leading-tight text-[var(--text-muted)]">
              {t("mail.received_on_prefix", { address: received_on_address })}
            </p>
          )}
          {alias_delivery && (
            <div className="mt-0.5 flex">
              <EmailTag
                show_icon
                className="max-w-[12rem]"
                icon="at"
                label={alias_delivery.label}
                size="xs"
                title={t("mail.received_via_alias", {
                  address: alias_delivery.address,
                })}
                variant="purple"
              />
            </div>
          )}
          <div className="flex items-center gap-1">
            <span className="text-[11px] leading-tight tabular-nums text-[var(--text-muted)]">
              {format_safe_date(message.timestamp, format_detail)}
            </span>
          </div>
        </div>
      </div>

      <div className={`overflow-hidden ${is_system ? "pt-2 pb-1" : ""}`}>
        {password_protected ? (
          <PgpPasswordProtectedMessage
            body={message.body}
            className="px-4 py-3"
            on_decrypted={set_password_unlocked_body}
          />
        ) : is_ratchet_undecryptable ? (
          <p className="px-4 py-3 text-[14px] italic text-[var(--text-muted)]">
            {t("mail.encrypted_message_unavailable")}
          </p>
        ) : (
          <>
            {translation.status !== "idle" && (
              <div className="px-4 pb-2">
                <TranslationBanner
                  download_bytes={translation.download_bytes}
                  limited_quality={translation.limited_quality}
                  on_show_original={translation.show_original}
                  on_translate={translation.translate}
                  showing_original={translation.showing_original}
                  source_language={translation.source_language}
                  status={translation.status}
                  target_language={translation.target_language}
                />
              </div>
            )}
            <SandboxedEmailRenderer
              body_background={sanitize_result.body_background}
              disable_auto_dark_mode={disable_auto_dark_mode}
              email_id={message.id}
              force_dark_mode={force_dark_mode}
              is_plain_text={!has_rich_html(clean_body)}
              load_remote_content={!lockdown_active && load_remote_content}
              on_document_ready={translation.on_document_ready}
              sanitized_html={sanitized_html}
              variant="mobile"
            />
          </>
        )}
      </div>

      {message.attachments && message.attachments.length > 0 && (
        <div className="space-y-2 px-4 pb-3">
          {message.attachments.map((att) => (
            <MobileAttachmentRow
              key={att.id}
              content_type={att.content_type}
              filename={att.filename}
              is_downloading={downloading_attachment_id === att.id}
              on_download={async () => {
                if (downloading_attachment_id) return;
                set_downloading_attachment_id(att.id);

                try {
                  await download_attachment_by_id(att.id, message.id);
                } catch (error) {
                  show_toast(t(attachment_error_key(error)), "error");
                } finally {
                  set_downloading_attachment_id(null);
                }
              }}
              size={att.size}
            />
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 border-t border-[var(--border-primary)] px-4 py-2">
        <button
          className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-[14px] text-[13px] font-medium text-[var(--accent-fg,#ffffff)] active:opacity-70"
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
          <ArrowUturnLeftIcon className="h-4 w-4 rtl:-scale-x-100" />
          {t("mail.reply")}
        </button>
        <button
          className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-[14px] text-[13px] font-medium text-[var(--text-secondary)] active:opacity-70"
          style={{
            background: "var(--bg-tertiary)",
            boxShadow:
              "0 1px 2px rgba(0,0,0,0.1), inset 0 1px 0 rgba(255,255,255,0.06)",
            border: "1px solid var(--border-primary)",
          }}
          type="button"
          onClick={() => on_forward(message)}
        >
          <ArrowUturnRightIcon className="h-4 w-4 rtl:-scale-x-100" />
          {t("mail.forward")}
        </button>
      </div>
    </div>
  );
}
