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
import type { DecryptedThreadMessage } from "@/types/thread";
import type {
  ExternalContentReport,
  ImageLoadMode,
} from "@/lib/html_sanitizer";
import type { PreloadedSanitizedContent } from "@/components/email/hooks/preload_cache";

import { useState, useMemo, useEffect, useRef } from "react";
import {
  StarIcon,
  EyeIcon,
  EyeSlashIcon,
  ChevronDownIcon,
  EllipsisHorizontalIcon,
  ArchiveBoxIcon,
  TrashIcon,
  PrinterIcon,
  ShieldExclamationIcon,
  CodeBracketIcon,
  ClipboardDocumentIcon,
  FolderIcon,
  ArrowUturnLeftIcon,
  MoonIcon,
  SunIcon,
  InformationCircleIcon,
} from "@heroicons/react/24/outline";
import { StarIcon as StarIconSolid } from "@heroicons/react/24/solid";

import { EmailTag } from "@/components/ui/email_tag";
import { is_ghost_email } from "@/stores/ghost_alias_store";
import { ProfileAvatar } from "@/components/ui/profile_avatar";
import {
  sanitize_html,
  is_html_content,
  has_rich_html,
  plain_text_to_html,
  strip_html_tags,
} from "@/lib/html_sanitizer";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown_menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { is_system_email } from "@/lib/utils";
import { get_image_proxy_url } from "@/lib/image_proxy";
import { use_i18n } from "@/lib/i18n/context";
import { use_preferences } from "@/contexts/preferences_context";
import { use_date_format } from "@/hooks/use_date_format";
import { show_toast } from "@/components/toast/simple_toast";
import { AttachmentList } from "@/components/email/attachment_list";
import { InlineReplyComposer } from "@/components/email/inline_reply_composer";
import { ThreadMessageBody } from "@/components/email/thread_message_body";
import { ThreadMessageActions } from "@/components/email/thread_message_actions";
import { MessageDetailsModal } from "@/components/email/message_details_modal";
import { TrackingProtectionShield } from "@/components/email/tracking_protection_shield";
import {
  extract_cid_references,
  extract_cid_inline_filenames,
  resolve_cid_references,
  revoke_cid_blob_urls,
} from "@/lib/cid_resolver";

interface ThreadMessageBlockProps {
  message: DecryptedThreadMessage;
  is_own_message: boolean;
  is_expanded: boolean;
  is_reply?: boolean;
  on_toggle: () => void;
  is_starred?: boolean;
  is_read?: boolean;
  on_star_toggle?: () => void;
  on_toggle_read?: () => void;
  on_reply?: (message: DecryptedThreadMessage) => void;
  on_reply_all?: (message: DecryptedThreadMessage) => void;
  on_forward?: (message: DecryptedThreadMessage) => void;
  on_archive?: (message: DecryptedThreadMessage) => void;
  on_trash?: (message: DecryptedThreadMessage) => void;
  on_print?: (message: DecryptedThreadMessage) => void;
  on_view_source?: (message: DecryptedThreadMessage) => void;
  on_report_phishing?: (message: DecryptedThreadMessage) => void;
  on_not_spam?: (message: DecryptedThreadMessage) => void;
  external_content_mode?: ImageLoadMode;
  on_external_content_detected?: (report: ExternalContentReport) => void;
  force_dark_mode?: boolean;
  on_toggle_dark_mode?: () => void;
  show_inline_reply?: boolean;
  inline_reply_thread_token?: string;
  inline_reply_is_external?: boolean;
  on_close_inline_reply?: () => void;
  inline_mode?: "reply" | "reply_all" | "forward";
  on_set_inline_mode?: (mode: "reply" | "reply_all" | "forward") => void;
  preloaded_sanitized?: PreloadedSanitizedContent;
  size_bytes?: number;
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

export function ThreadMessageBlock({
  message,
  is_own_message,
  is_expanded,
  is_reply = false,
  on_toggle,
  is_starred = false,
  is_read = true,
  on_star_toggle,
  on_toggle_read,
  on_reply,
  on_reply_all,
  on_forward,
  on_archive,
  on_trash,
  on_print,
  on_view_source,
  on_report_phishing,
  on_not_spam,
  external_content_mode,
  on_external_content_detected,
  force_dark_mode = false,
  on_toggle_dark_mode,
  show_inline_reply,
  inline_reply_thread_token,
  inline_reply_is_external,
  on_close_inline_reply,
  inline_mode = "reply",
  on_set_inline_mode,
  preloaded_sanitized,
  size_bytes,
}: ThreadMessageBlockProps): React.ReactElement {
  const { t } = use_i18n();
  const { preferences } = use_preferences();
  const { format_email_detail } = use_date_format();
  const [viewing_source, set_viewing_source] = useState(false);
  const [wrap_source, set_wrap_source] = useState(false);
  const [show_details_modal, set_show_details_modal] = useState(false);
  const clean_body = useMemo(() => {
    if (message.html_content && is_html_content(message.html_content)) {
      return message.html_content;
    }

    return strip_quotes(message.body);
  }, [message.body, message.html_content]);
  const has_reported_external_content = useRef(false);

  const collapsed_preview = useMemo(() => {
    const plain = strip_html_tags(clean_body);

    return plain.length > 80 ? plain.substring(0, 80) + "..." : plain;
  }, [clean_body]);

  const is_system = is_system_email(message.sender_email);
  const is_ghost_sender = is_ghost_email(message.sender_email);
  const rich_html_source = message.html_content || message.body;
  const is_plain_text = !rich_html_source || !has_rich_html(rich_html_source);

  const base_image_mode = is_system
    ? ("always" as ImageLoadMode)
    : !preferences.block_external_content
      ? ("always" as ImageLoadMode)
      : preferences.load_remote_images;

  const load_remote_content = external_content_mode === "always";

  const sanitized_content = useMemo(() => {
    if (preloaded_sanitized && base_image_mode !== "always") {
      const report: ExternalContentReport | null =
        preloaded_sanitized.external_content.blocked_count > 0
          ? preloaded_sanitized.external_content
          : null;

      return {
        html: preloaded_sanitized.html,
        report,
        body_background: preloaded_sanitized.body_background,
      };
    }

    if (!is_html_content(clean_body)) {
      return {
        html: plain_text_to_html(clean_body),
        report: null,
        body_background: undefined,
      };
    }

    const result = sanitize_html(clean_body, {
      external_content_mode: base_image_mode,
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

    const report: ExternalContentReport | null =
      result.external_content.blocked_count > 0
        ? result.external_content
        : null;

    return {
      html: result.html,
      report,
      body_background: result.body_background,
    };
  }, [
    preloaded_sanitized,
    clean_body,
    base_image_mode,
    preferences.block_external_content,
    preferences.block_remote_images,
    preferences.block_remote_fonts,
    preferences.block_remote_css,
    preferences.block_tracking_pixels,
  ]);

  useEffect(() => {
    if (
      !is_system &&
      sanitized_content.report &&
      sanitized_content.report.blocked_count > 0 &&
      on_external_content_detected &&
      !has_reported_external_content.current
    ) {
      has_reported_external_content.current = true;
      on_external_content_detected(sanitized_content.report);
    }
  }, [is_system, sanitized_content.report, on_external_content_detected]);

  useEffect(() => {
    has_reported_external_content.current = false;
  }, [message.id]);

  const [cid_resolved_html, set_cid_resolved_html] = useState<string | null>(
    null,
  );
  const cid_blob_urls_ref = useRef<string[]>([]);

  useEffect(() => {
    let cancelled = false;

    const has_cid = extract_cid_references(sanitized_content.html).length > 0;

    if (!has_cid || !is_expanded) {
      set_cid_resolved_html(null);

      return;
    }

    resolve_cid_references(sanitized_content.html, message.id)
      .then((result) => {
        if (cancelled) {
          revoke_cid_blob_urls(result.blob_urls);

          return;
        }
        revoke_cid_blob_urls(cid_blob_urls_ref.current);
        cid_blob_urls_ref.current = result.blob_urls;
        set_cid_resolved_html(result.html);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [sanitized_content.html, message.id, is_expanded]);

  useEffect(() => {
    return () => {
      revoke_cid_blob_urls(cid_blob_urls_ref.current);
      cid_blob_urls_ref.current = [];
    };
  }, []);

  const effective_html = cid_resolved_html ?? sanitized_content.html;

  const inline_cids = useMemo(() => {
    const refs = extract_cid_references(sanitized_content.html);

    return refs.length > 0
      ? new Set(refs.map((r) => r.toLowerCase()))
      : undefined;
  }, [sanitized_content.html]);

  const inline_filenames = useMemo(() => {
    const names = extract_cid_inline_filenames(sanitized_content.html);

    return names.size > 0 ? names : undefined;
  }, [sanitized_content.html]);

  const name = is_own_message ? t("common.me") : message.sender_name;

  if (message.is_deleted) {
    return (
      <div className="thread-card-collapsed rounded-xl px-5 py-3.5 text-sm italic text-txt-muted">
        {t("mail.message_deleted")}
      </div>
    );
  }

  if (!is_expanded) {
    return (
      <div
        className="group thread-card-collapsed flex cursor-pointer items-center justify-between rounded-xl px-3 py-3"
        role="button"
        tabIndex={0}
        onClick={on_toggle}
        onKeyDown={(e) => e["key"] === "Enter" && on_toggle()}
      >
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          {is_reply && (
            <ArrowUturnLeftIcon className="h-3.5 w-3.5 flex-shrink-0 text-txt-muted" />
          )}
          <ProfileAvatar
            use_domain_logo
            email={message.sender_email}
            name={message.sender_name}
            size="xs"
          />
          <span
            className={`truncate text-sm ${is_read ? "font-normal text-txt-muted" : "font-semibold text-txt-primary"}`}
          >
            {name}
          </span>
          {is_ghost_sender && (
            <EmailTag
              className="flex-shrink-0"
              icon="eye-slash"
              label={t("common.ghost_label")}
              muted={is_read}
              size="sm"
              title={t("common.ghost_mode_tooltip")}
              variant="purple"
            />
          )}
          {collapsed_preview && (
            <span className="truncate text-sm text-txt-muted">
              - {collapsed_preview}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100">
            {on_toggle_read && (
              <button
                className="-m-1 rounded-md p-1.5 hover:bg-surf-hover"
                onClick={(e) => {
                  e.stopPropagation();
                  on_toggle_read();
                }}
              >
                {is_read ? (
                  <EyeSlashIcon className="h-4 w-4 text-txt-muted" />
                ) : (
                  <EyeIcon className="h-4 w-4 text-txt-muted" />
                )}
              </button>
            )}
            <button
              className="-m-1 rounded-md p-1.5 hover:bg-surf-hover"
              onClick={(e) => {
                e.stopPropagation();
                on_star_toggle?.();
              }}
            >
              {is_starred ? (
                <StarIconSolid className="h-4 w-4 text-amber-400" />
              ) : (
                <StarIcon className="h-4 w-4 text-txt-muted" />
              )}
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="-m-1 rounded-md p-1.5 hover:bg-surf-hover"
                  onClick={(e) => e.stopPropagation()}
                >
                  <EllipsisHorizontalIcon className="h-4 w-4 text-txt-muted" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    on_star_toggle?.();
                  }}
                >
                  {is_starred ? (
                    <StarIconSolid className="w-4 h-4 mr-2 text-amber-400" />
                  ) : (
                    <StarIcon className="w-4 h-4 mr-2" />
                  )}
                  {is_starred ? t("mail.unstar") : t("mail.star")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    on_toggle_read?.();
                  }}
                >
                  {is_read ? (
                    <EyeSlashIcon className="w-4 h-4 mr-2" />
                  ) : (
                    <EyeIcon className="w-4 h-4 mr-2" />
                  )}
                  {is_read ? t("mail.mark_unread") : t("mail.mark_read")}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {on_archive && (
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      on_archive(message);
                    }}
                  >
                    <ArchiveBoxIcon className="w-4 h-4 mr-2" />
                    {t("mail.archive")}
                  </DropdownMenuItem>
                )}
                {on_trash && (
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      on_trash(message);
                    }}
                  >
                    <TrashIcon className="w-4 h-4 mr-2" />
                    {message.is_deleted
                      ? t("mail.delete_permanently")
                      : t("mail.move_to_trash")}
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem disabled>
                  <FolderIcon className="w-4 h-4 mr-2" />
                  {t("mail.move_to_folder")}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {on_print && (
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      on_print(message);
                    }}
                  >
                    <PrinterIcon className="w-4 h-4 mr-2" />
                    {t("mail.print")}
                  </DropdownMenuItem>
                )}
                {on_view_source && (
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      on_view_source(message);
                    }}
                  >
                    <CodeBracketIcon className="w-4 h-4 mr-2" />
                    {t("mail.view_source")}
                  </DropdownMenuItem>
                )}
                {on_not_spam ? (
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      on_not_spam(message);
                    }}
                  >
                    <ShieldExclamationIcon className="w-4 h-4 mr-2" />
                    {t("mail.not_spam")}
                  </DropdownMenuItem>
                ) : on_report_phishing ? (
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      on_report_phishing(message);
                    }}
                  >
                    <ShieldExclamationIcon className="w-4 h-4 mr-2 text-amber-500" />
                    <span className="text-amber-500">
                      {t("common.report_phishing")}
                    </span>
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    navigator.clipboard
                      .writeText(message.id)
                      .then(() => {
                        show_toast(t("common.message_id_copied"), "success");
                      })
                      .catch(() => {});
                  }}
                >
                  <ClipboardDocumentIcon className="w-4 h-4 mr-2" />
                  Copy message ID
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    set_show_details_modal(true);
                  }}
                >
                  <InformationCircleIcon className="w-4 h-4 mr-2" />
                  {t("mail.message_details")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          {preferences.show_tracking_protection !== false &&
            sanitized_content.report && (
              <TrackingProtectionShield
                t={t}
                tracking_report={sanitized_content.report}
              />
            )}
          <span className="text-sm text-txt-muted">
            {format_email_detail(new Date(message.timestamp))}
          </span>
        </div>

        <MessageDetailsModal
          is_open={show_details_modal}
          message={message}
          on_close={() => set_show_details_modal(false)}
          size_bytes={size_bytes}
        />
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl bg-[var(--thread-card-bg)] border border-[var(--thread-card-border)]">
      <div
        className="group flex cursor-pointer items-start gap-3 px-3 @md:px-4 py-3"
        role="button"
        tabIndex={0}
        onClick={on_toggle}
        onKeyDown={(e) => e["key"] === "Enter" && on_toggle()}
      >
        <ProfileAvatar
          use_domain_logo
          className="flex-shrink-0 mt-0.5"
          email={message.sender_email}
          name={message.sender_name}
          size="sm"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            {is_reply && (
              <ArrowUturnLeftIcon className="h-3.5 w-3.5 flex-shrink-0 text-txt-muted" />
            )}
            <span
              className={`text-sm truncate ${is_read ? "font-normal text-txt-muted" : "font-semibold text-txt-primary"}`}
            >
              {name}
            </span>
            {is_ghost_sender && (
              <EmailTag
                className="flex-shrink-0"
                icon="eye-slash"
                label={t("common.ghost_label")}
                muted={is_read}
                size="sm"
                title={t("common.ghost_mode_tooltip")}
                variant="purple"
              />
            )}
            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100">
              {on_toggle_read && (
                <button
                  className="-m-1 rounded-md p-1.5 hover:bg-surf-hover"
                  onClick={(e) => {
                    e.stopPropagation();
                    on_toggle_read();
                  }}
                >
                  {is_read ? (
                    <EyeSlashIcon className="h-4 w-4 text-txt-muted" />
                  ) : (
                    <EyeIcon className="h-4 w-4 text-txt-muted" />
                  )}
                </button>
              )}
              <button
                className="-m-1 rounded-md p-1.5 hover:bg-surf-hover"
                onClick={(e) => {
                  e.stopPropagation();
                  on_star_toggle?.();
                }}
              >
                {is_starred ? (
                  <StarIconSolid className="h-4 w-4 text-amber-400" />
                ) : (
                  <StarIcon className="h-4 w-4 text-txt-muted" />
                )}
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className="-m-1 rounded-md p-1.5 hover:bg-surf-hover"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <EllipsisHorizontalIcon className="h-4 w-4 text-txt-muted" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      on_star_toggle?.();
                    }}
                  >
                    {is_starred ? (
                      <StarIconSolid className="w-4 h-4 mr-2 text-amber-400" />
                    ) : (
                      <StarIcon className="w-4 h-4 mr-2" />
                    )}
                    {is_starred ? t("mail.unstar") : t("mail.star")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      on_toggle_read?.();
                    }}
                  >
                    {is_read ? (
                      <EyeSlashIcon className="w-4 h-4 mr-2" />
                    ) : (
                      <EyeIcon className="w-4 h-4 mr-2" />
                    )}
                    {is_read ? t("mail.mark_unread") : t("mail.mark_read")}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {on_archive && (
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.stopPropagation();
                        on_archive(message);
                      }}
                    >
                      <ArchiveBoxIcon className="w-4 h-4 mr-2" />
                      {t("mail.archive")}
                    </DropdownMenuItem>
                  )}
                  {on_trash && (
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.stopPropagation();
                        on_trash(message);
                      }}
                    >
                      <TrashIcon className="w-4 h-4 mr-2" />
                      {message.is_deleted
                        ? t("mail.delete_permanently")
                        : t("mail.move_to_trash")}
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem disabled>
                    <FolderIcon className="w-4 h-4 mr-2" />
                    {t("mail.move_to_folder")}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {on_print && (
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.stopPropagation();
                        on_print(message);
                      }}
                    >
                      <PrinterIcon className="w-4 h-4 mr-2" />
                      Print
                    </DropdownMenuItem>
                  )}
                  {on_toggle_dark_mode && (
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.stopPropagation();
                        on_toggle_dark_mode();
                      }}
                    >
                      {force_dark_mode ? (
                        <SunIcon className="w-4 h-4 mr-2" />
                      ) : (
                        <MoonIcon className="w-4 h-4 mr-2" />
                      )}
                      {force_dark_mode
                        ? t("mail.exit_dark_mode")
                        : t("mail.view_dark_mode")}
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      set_viewing_source(!viewing_source);
                    }}
                  >
                    <CodeBracketIcon className="w-4 h-4 mr-2" />
                    {viewing_source
                      ? t("mail.hide_source")
                      : t("mail.view_source")}
                  </DropdownMenuItem>
                  {on_not_spam ? (
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.stopPropagation();
                        on_not_spam(message);
                      }}
                    >
                      <ShieldExclamationIcon className="w-4 h-4 mr-2" />
                      {t("mail.not_spam")}
                    </DropdownMenuItem>
                  ) : on_report_phishing ? (
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.stopPropagation();
                        on_report_phishing(message);
                      }}
                    >
                      <ShieldExclamationIcon className="w-4 h-4 mr-2 text-amber-500" />
                      <span className="text-amber-500">
                        {t("common.report_phishing")}
                      </span>
                    </DropdownMenuItem>
                  ) : null}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      navigator.clipboard
                        .writeText(message.id)
                        .then(() => {
                          show_toast(t("common.message_id_copied"), "success");
                        })
                        .catch(() => {});
                    }}
                  >
                    <ClipboardDocumentIcon className="w-4 h-4 mr-2" />
                    {t("mail.copy_message_id")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      set_show_details_modal(true);
                    }}
                  >
                    <InformationCircleIcon className="w-4 h-4 mr-2" />
                    {t("mail.message_details")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          <Popover>
            <PopoverTrigger asChild>
              <button
                className="flex items-center gap-0.5 text-xs text-txt-muted hover:text-txt-secondary mt-0.5"
                onClick={(e) => e.stopPropagation()}
              >
                {message.to_recipients && message.to_recipients.length > 0
                  ? `to ${message.to_recipients.map((r) => r.name || r.email.split("@")[0]).join(", ")}`
                  : is_own_message
                    ? ""
                    : `to ${t("common.me")}`}{" "}
                &#9660;
              </button>
            </PopoverTrigger>
            <PopoverContent
              align="start"
              className="w-80 p-3 text-xs space-y-2 bg-surf-primary border-edge-primary"
              side="bottom"
              onClick={(e: React.MouseEvent) => e.stopPropagation()}
            >
              <div className="flex">
                <span className="w-14 flex-shrink-0 font-medium text-txt-muted">
                  {t("common.from_label")}
                </span>
                <span className="min-w-0 text-txt-secondary break-words">
                  {message.sender_name} &lt;{message.sender_email}&gt;
                </span>
              </div>
              {message.to_recipients && message.to_recipients.length > 0 && (
                <div className="flex items-start">
                  <span className="w-14 flex-shrink-0 font-medium pt-0.5 text-txt-muted">
                    {t("common.to_label")}
                  </span>
                  <span className="flex-1 min-w-0 flex flex-wrap items-center gap-1 text-txt-secondary">
                    {message.to_recipients.map((r, i) => (
                      <span
                        key={r.email}
                        className="inline-flex items-center gap-1"
                      >
                        <ProfileAvatar
                          use_domain_logo
                          email={r.email}
                          name={r.name || ""}
                          size="xs"
                        />
                        <span>{r.name || r.email}</span>
                        {i < (message.to_recipients?.length ?? 0) - 1 && (
                          <span>,</span>
                        )}
                      </span>
                    ))}
                  </span>
                </div>
              )}
              <div className="flex">
                <span className="w-14 flex-shrink-0 font-medium text-txt-muted">
                  {t("common.date_label")}
                </span>
                <span className="text-txt-secondary">
                  {format_email_detail(new Date(message.timestamp))}
                </span>
              </div>
              <div className="flex">
                <span className="w-14 flex-shrink-0 font-medium text-txt-muted">
                  {t("common.subject_label")}
                </span>
                <span className="min-w-0 text-txt-secondary break-words">
                  {message.subject}
                </span>
              </div>
            </PopoverContent>
          </Popover>
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          {preferences.show_tracking_protection !== false &&
            sanitized_content.report && (
              <TrackingProtectionShield
                t={t}
                tracking_report={sanitized_content.report}
              />
            )}
          <span className="text-sm text-txt-muted">
            {format_email_detail(new Date(message.timestamp))}
          </span>
          <ChevronDownIcon className="ml-1 h-4 w-4 text-txt-muted" />
        </div>
      </div>

      <MessageDetailsModal
        is_open={show_details_modal}
        message={message}
        on_close={() => set_show_details_modal(false)}
        size_bytes={size_bytes}
      />

      <ThreadMessageBody
        body_background={sanitized_content.body_background}
        clean_body={clean_body}
        email_id={message.id}
        force_dark_mode={force_dark_mode}
        is_plain_text={is_plain_text}
        load_remote_content={load_remote_content}
        sanitized_html={effective_html}
        set_wrap_source={set_wrap_source}
        viewing_source={viewing_source}
        wrap_source={wrap_source}
      />

      <AttachmentList
        has_recipient_key={message.has_recipient_key}
        inline_cids={inline_cids}
        inline_filenames={inline_filenames}
        is_external={message.is_external}
        mail_item_id={message.id}
      />

      {!show_inline_reply && (
        <ThreadMessageActions
          message={message}
          on_forward={on_forward}
          on_reply={on_reply}
          on_reply_all={on_reply_all}
        />
      )}

      {show_inline_reply &&
        on_close_inline_reply &&
        (() => {
          const is_own_msg = message.item_type === "sent";
          const first_to_recipient = message.to_recipients?.[0];
          const inline_recipient_email =
            is_own_msg && first_to_recipient
              ? first_to_recipient.email
              : message.sender_email;
          const inline_recipient_name =
            is_own_msg && first_to_recipient
              ? first_to_recipient.name ||
                first_to_recipient.email.split("@")[0]
              : message.sender_name;

          const original_cc_emails =
            message.to_recipients
              ?.filter(
                (r) =>
                  r.email.toLowerCase() !==
                  inline_recipient_email.toLowerCase(),
              )
              .map((r) => r.email) ?? [];

          const all_to_emails =
            message.to_recipients?.map((r) => r.email) ?? [];

          const inline_reply_from = is_own_msg
            ? message.sender_email
            : undefined;

          return (
            <InlineReplyComposer
              inline_mode={inline_mode}
              is_external={inline_reply_is_external}
              on_close={on_close_inline_reply}
              on_set_inline_mode={on_set_inline_mode}
              original_body={message.body || ""}
              original_cc={original_cc_emails}
              original_email_id={message.id}
              original_subject={message.subject}
              original_timestamp={message.timestamp}
              original_to={all_to_emails}
              recipient_email={inline_recipient_email}
              recipient_name={inline_recipient_name}
              reply_from_address={inline_reply_from}
              sender_email={message.sender_email}
              sender_name={message.sender_name}
              thread_token={inline_reply_thread_token}
            />
          );
        })()}
    </div>
  );
}

export { ThreadMessagesList } from "./thread_messages_list";
export type { ThreadMessagesListRef } from "./thread_messages_list";
