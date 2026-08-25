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
import { copy_text_or_throw } from "@/utils/copy_text";
import type { ThreadMessageBlockProps } from "./use_thread_message_block";

import {
  AtSymbolIcon,
  StarIcon,
  EyeIcon,
  EyeSlashIcon,
  EllipsisHorizontalIcon,
  ArchiveBoxIcon,
  TrashIcon,
  PrinterIcon,
  ShieldExclamationIcon,
  NoSymbolIcon,
  CodeBracketIcon,
  ClipboardDocumentIcon,
  FolderIcon,
  CheckIcon,
  MoonIcon,
  SunIcon,
  InformationCircleIcon,
  ArrowUturnLeftIcon,
  ArrowUturnRightIcon,
} from "@heroicons/react/24/outline";
import { StarIcon as StarIconSolid } from "@heroicons/react/24/solid";
import { Tooltip } from "@aster/ui";

import { render_collapsed_thread_message } from "./thread_message_collapsed";
import { use_thread_message_block } from "./use_thread_message_block";

import { EmailTag } from "@/components/ui/email_tag";
import { ProfileAvatar } from "@/components/ui/profile_avatar";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "@/components/ui/dropdown_menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { OfficialBadge } from "@/components/email/official_badge";
import { show_toast } from "@/components/toast/simple_toast";
import { AttachmentList } from "@/components/email/attachment_list";
import { InlineReplyComposer } from "@/components/email/inline_reply_composer";
import { build_reply_recipient_for_message } from "@/components/email/build_reply_recipient";
import { ThreadMessageBody } from "@/components/email/thread_message_body";
import { SpamReasonsBanner } from "@/components/email/banners/spam_reasons_banner";
import { TranslationBanner } from "@/components/email/banners/translation_banner";
import { ThreadMessageActions } from "@/components/email/thread_message_actions";
import { MessageDetailsModal } from "@/components/email/message_details_modal";
import { SenderProfileTrigger } from "@/components/profile/sender_profile_trigger";
import { PgpPasswordProtectedMessage } from "@/components/email/pgp_password_prompt";
import { open_external } from "@/utils/open_link";

export function ThreadMessageBlock(
  props: ThreadMessageBlockProps,
): React.ReactElement {
  const {
    message,
    is_own_message,
    is_expanded,
    is_single_message = false,
    is_last_in_thread = false,
    hide_bottom_border = false,
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
    on_report_phishing,
    on_block_sender,
    on_not_spam,
    folders = [],
    message_folder_tokens,
    on_move_to_folder,
    force_dark_mode = false,
    disable_auto_dark_mode = false,
    on_toggle_dark_mode,
    show_inline_reply,
    inline_reply_thread_token,
    inline_reply_is_external,
    on_close_inline_reply,
    inline_mode = "reply",
    on_set_inline_mode,
    on_draft_saved,
    existing_draft,
    size_bytes,
    on_unsubscribe,
    on_manual_unsubscribed,
    unsubscribe_url,
    on_load_external_content,
  } = props;
  const state = use_thread_message_block(props);
  const {
    t,
    auth,
    format_email_detail,
    viewing_source,
    set_viewing_source,
    wrap_source,
    set_wrap_source,
    show_details_modal,
    set_show_details_modal,
    unsub_state,
    set_unsub_state,
    set_password_unlocked_body,
    password_protected,
    clean_body,
    lockdown_active,
    is_system,
    is_ghost_sender,
    show_sender_name,
    show_sender_email,
    received_on_address,
    alias_delivery,
    delivered_to_address,
    is_ratchet_undecryptable,
    is_plain_text,
    translation,
    load_remote_content,
    sanitized_content,
    effective_html,
    html_blocked,
    plain_text_html,
    inline_cids,
    inline_filenames,
    name,
    can_collapse,
  } = state;

  if (message.is_deleted) {
    return (
      <div className="px-4 py-3 text-sm italic text-txt-muted border-b border-[var(--border-thread-divider)]">
        {t("mail.message_deleted")}
      </div>
    );
  }

  if (!is_expanded && !is_last_in_thread && !is_single_message) {
    return render_collapsed_thread_message(props, state);
  }

  return (
    <div
      className={`overflow-hidden ${show_inline_reply || is_last_in_thread || is_single_message || hide_bottom_border ? "" : "border-b border-[var(--border-thread-divider)]"}`}
    >
      <div
        className={`group flex items-start gap-3 px-4 pt-3 pb-1 ${can_collapse ? "cursor-pointer select-none" : ""}`}
        role={can_collapse ? "button" : undefined}
        tabIndex={can_collapse ? 0 : undefined}
        onClick={
          can_collapse
            ? (e) => {
                e.stopPropagation();
                on_toggle();
              }
            : undefined
        }
        onKeyDown={
          can_collapse
            ? (e) => {
                if (e["key"] === "Enter" || e["key"] === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                  on_toggle();
                }
              }
            : undefined
        }
      >
        {is_own_message ? (
          <ProfileAvatar
            use_domain_logo
            className="flex-shrink-0 mt-0.5"
            email={message.sender_email}
            name={message.sender_name}
            size="md"
          />
        ) : (
          <SenderProfileTrigger
            className="flex-shrink-0 mt-0.5 rounded-full hover:opacity-80 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
            email={message.sender_email}
            name={message.sender_name}
          >
            <ProfileAvatar
              use_domain_logo
              email={show_sender_email}
              name={show_sender_name}
              size="md"
            />
          </SenderProfileTrigger>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 min-w-0">
            {is_own_message ? (
              <span className="text-sm font-semibold truncate text-txt-primary max-w-full">
                {name}
              </span>
            ) : (
              <SenderProfileTrigger
                className="text-sm font-semibold truncate text-txt-primary max-w-full hover:underline underline-offset-2 focus:outline-none"
                email={message.sender_email}
                name={message.sender_name}
              >
                {name}
              </SenderProfileTrigger>
            )}
            {!is_own_message && (
              <OfficialBadge
                className="flex-shrink-0"
                email={message.sender_email}
              />
            )}
            <span className="text-xs text-txt-muted truncate hidden sm:inline max-w-full">
              &lt;{show_sender_email}&gt;
            </span>
            {is_ghost_sender && (
              <Tooltip tip={t("common.ghost_mode_tooltip")}>
                <EmailTag
                  className="flex-shrink-0"
                  icon="eye-slash"
                  label={t("common.ghost_label")}
                  muted={is_read}
                  size="sm"
                  variant="purple"
                />
              </Tooltip>
            )}
            {on_unsubscribe && unsub_state === "idle" && (
              <button
                className="flex-shrink-0 text-xs font-medium text-blue-500 rounded px-1.5 py-0.5 hover:bg-blue-500/10 transition-colors"
                onClick={async (e) => {
                  e.stopPropagation();
                  set_unsub_state("loading");
                  const result = await on_unsubscribe();

                  set_unsub_state(result === "success" ? "done" : "manual");
                }}
              >
                {t("mail.unsubscribe")}
              </button>
            )}
            {unsub_state === "manual" &&
              unsubscribe_url &&
              !lockdown_active && (
                <button
                  className="flex-shrink-0 text-xs font-medium text-blue-500 rounded px-1.5 py-0.5 hover:bg-blue-500/10 transition-colors"
                  onClick={(e) => {
                    e.stopPropagation();
                    open_external(unsubscribe_url);
                    set_unsub_state("done");
                    on_manual_unsubscribed?.();
                  }}
                >
                  {t("mail.open_unsubscribe_page")}
                </button>
              )}
            {!lockdown_active &&
              sanitized_content.report &&
              sanitized_content.report.blocked_count > 0 &&
              on_load_external_content &&
              (() => {
                const report = sanitized_content.report!;
                const image_count = report.blocked_items.filter(
                  (i) => i.type === "image",
                ).length;
                const tracker_count = report.blocked_items.filter(
                  (i) => i.type === "tracking_pixel",
                ).length;
                const font_count = report.blocked_items.filter(
                  (i) => i.type === "font",
                ).length;
                const css_count = report.blocked_items.filter(
                  (i) => i.type === "css",
                ).length;
                const btn_class =
                  "flex-shrink-0 text-xs font-medium text-blue-500 rounded px-1.5 py-0.5 hover:bg-blue-500/10 transition-colors";

                return (
                  <>
                    {image_count > 0 && (
                      <button
                        className={btn_class}
                        onClick={(e) => {
                          e.stopPropagation();
                          on_load_external_content(["image"]);
                        }}
                      >
                        {`${t("mail.load_external_content")} (${image_count} ${image_count === 1 ? t("mail.image") : t("mail.images")})`}
                      </button>
                    )}
                    {tracker_count > 0 && (
                      <button
                        className={btn_class}
                        onClick={(e) => {
                          e.stopPropagation();
                          on_load_external_content(["tracking_pixel"]);
                        }}
                      >
                        {`${t("mail.load_external_content")} (${tracker_count} ${tracker_count === 1 ? t("mail.tracker") : t("mail.trackers")})`}
                      </button>
                    )}
                    {(font_count > 0 || css_count > 0) && (
                      <button
                        className={btn_class}
                        onClick={(e) => {
                          e.stopPropagation();
                          on_load_external_content(["font", "css"]);
                        }}
                      >
                        {(() => {
                          const parts: string[] = [];

                          if (font_count > 0)
                            parts.push(
                              `${font_count} ${font_count === 1 ? t("mail.font") : t("mail.fonts")}`,
                            );
                          if (css_count > 0)
                            parts.push(`${css_count} ${t("mail.stylesheet")}`);

                          return `${t("mail.load_external_content")} (${parts.join(", ")})`;
                        })()}
                      </button>
                    )}
                  </>
                );
              })()}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Popover>
              <PopoverTrigger asChild>
                <button
                  className="flex items-center gap-0.5 text-xs text-txt-muted hover:text-txt-secondary mt-0.5"
                  onClick={(e) => e.stopPropagation()}
                >
                  {message.to_recipients && message.to_recipients.length > 0
                    ? t("mail.to_recipients_prefix", {
                        recipients: message.to_recipients
                          .map((r) => r.name || r.email?.split("@")[0] || "")
                          .join(", "),
                      })
                    : is_own_message
                      ? ""
                      : t("mail.to_recipients_prefix", {
                          recipients: t("common.me"),
                        })}{" "}
                  &#9660;
                </button>
              </PopoverTrigger>
              <PopoverContent
                align="start"
                className="w-[26rem] max-w-[90vw] p-3 text-xs space-y-2 bg-surf-primary border-edge-primary"
                side="bottom"
                onClick={(e: React.MouseEvent) => e.stopPropagation()}
              >
                <div className="flex">
                  <span className="min-w-14 flex-shrink-0 whitespace-nowrap pe-2 font-medium text-txt-muted">
                    {t("common.from_label")}
                  </span>
                  <span
                    className="min-w-0 text-txt-secondary break-words"
                    dir="auto"
                  >
                    {show_sender_name}{" "}
                    <button
                      className="hover:underline text-txt-muted break-all text-start"
                      onClick={() => {
                        copy_text_or_throw(show_sender_email)
                          .then(() =>
                            show_toast(t("common.email_copied"), "success"),
                          )
                          .catch(() =>
                            show_toast(t("common.failed_to_copy"), "error"),
                          );
                      }}
                    >
                      &lt;{show_sender_email}&gt;
                    </button>
                  </span>
                </div>
                {delivered_to_address && (
                  <div className="flex">
                    <span className="min-w-14 flex-shrink-0 whitespace-nowrap pe-2 font-medium text-txt-muted">
                      {t("common.received_on_label")}
                    </span>
                    <span className="min-w-0 text-txt-secondary break-words">
                      {delivered_to_address}
                    </span>
                  </div>
                )}
                {message.to_recipients && message.to_recipients.length > 0 && (
                  <div className="flex items-start">
                    <span className="min-w-14 flex-shrink-0 whitespace-nowrap pe-2 font-medium pt-0.5 text-txt-muted">
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
                          <button
                            className="hover:underline"
                            onClick={() => {
                              copy_text_or_throw(r.email)
                                .then(() =>
                                  show_toast(
                                    t("common.email_copied"),
                                    "success",
                                  ),
                                )
                                .catch(() =>
                                  show_toast(
                                    t("common.failed_to_copy"),
                                    "error",
                                  ),
                                );
                            }}
                          >
                            {r.name || r.email}
                          </button>
                          {i < (message.to_recipients?.length ?? 0) - 1 && (
                            <span>,</span>
                          )}
                        </span>
                      ))}
                    </span>
                  </div>
                )}
                {message.cc_recipients && message.cc_recipients.length > 0 && (
                  <div className="flex items-start">
                    <span className="min-w-14 flex-shrink-0 whitespace-nowrap pe-2 font-medium pt-0.5 text-txt-muted">
                      {t("common.cc_label")}
                    </span>
                    <span className="flex-1 min-w-0 flex flex-wrap items-center gap-1 text-txt-secondary">
                      {message.cc_recipients.map((r, i) => (
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
                          <button
                            className="hover:underline"
                            onClick={() => {
                              copy_text_or_throw(r.email)
                                .then(() =>
                                  show_toast(
                                    t("common.email_copied"),
                                    "success",
                                  ),
                                )
                                .catch(() =>
                                  show_toast(
                                    t("common.failed_to_copy"),
                                    "error",
                                  ),
                                );
                            }}
                          >
                            {r.name || r.email}
                          </button>
                          {i < (message.cc_recipients?.length ?? 0) - 1 && (
                            <span>,</span>
                          )}
                        </span>
                      ))}
                    </span>
                  </div>
                )}
                {message.bcc_recipients &&
                  message.bcc_recipients.length > 0 && (
                    <div className="flex items-start">
                      <span className="min-w-14 flex-shrink-0 whitespace-nowrap pe-2 font-medium pt-0.5 text-txt-muted">
                        {t("common.bcc_label")}
                      </span>
                      <span className="flex-1 min-w-0 flex flex-wrap items-center gap-1 text-txt-secondary">
                        {message.bcc_recipients.map((r, i) => (
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
                            <button
                              className="hover:underline"
                              onClick={() => {
                                copy_text_or_throw(r.email)
                                  .then(() =>
                                    show_toast(
                                      t("common.email_copied"),
                                      "success",
                                    ),
                                  )
                                  .catch(() =>
                                    show_toast(
                                      t("common.failed_to_copy"),
                                      "error",
                                    ),
                                  );
                              }}
                            >
                              {r.name || r.email}
                            </button>
                            {i < (message.bcc_recipients?.length ?? 0) - 1 && (
                              <span>,</span>
                            )}
                          </span>
                        ))}
                      </span>
                    </div>
                  )}
                <div className="flex">
                  <span className="min-w-14 flex-shrink-0 whitespace-nowrap pe-2 font-medium text-txt-muted">
                    {t("common.date_label")}
                  </span>
                  <span className="text-txt-secondary">
                    {format_email_detail(new Date(message.timestamp))}
                  </span>
                </div>
                <div className="flex">
                  <span className="min-w-14 flex-shrink-0 whitespace-nowrap pe-2 font-medium text-txt-muted">
                    {t("common.subject_label")}
                  </span>
                  <span
                    dir="auto"
                    className="min-w-0 text-txt-secondary break-words"
                  >
                    {message.subject || t("mail.no_subject")}
                  </span>
                </div>
              </PopoverContent>
            </Popover>
            {alias_delivery && (
              <Tooltip
                tip={t("mail.received_via_alias", {
                  address: alias_delivery.address,
                })}
              >
                <span
                  aria-label={t("mail.received_via_alias", {
                    address: alias_delivery.address,
                  })}
                  className="flex-shrink-0 inline-flex items-center text-txt-muted"
                >
                  <AtSymbolIcon className="h-3.5 w-3.5" />
                </span>
              </Tooltip>
            )}
          </div>
          {received_on_address && (
            <span
              className="block truncate max-w-full text-xs text-txt-muted mt-0.5"
              title={received_on_address}
            >
              {t("mail.received_on_prefix", { address: received_on_address })}
            </span>
          )}
        </div>

        <div className="flex items-center gap-0.5 flex-shrink-0">
          <button
            className="rounded-full p-1.5 hover:bg-surf-hover"
            title={is_starred ? t("mail.unstar") : t("mail.star")}
            onClick={(e) => {
              e.stopPropagation();
              on_star_toggle?.();
            }}
          >
            {is_starred ? (
              <StarIconSolid className="h-[18px] w-[18px] text-amber-400" />
            ) : (
              <StarIcon className="h-[18px] w-[18px] text-txt-muted" />
            )}
          </button>
          {on_reply && !is_system && (
            <button
              className="rounded-full p-1.5 hover:bg-surf-hover"
              title={t("mail.reply")}
              onClick={(e) => {
                e.stopPropagation();
                on_reply(message);
              }}
            >
              <ArrowUturnLeftIcon className="h-[18px] w-[18px] text-txt-muted rtl:-scale-x-100" />
            </button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="rounded-full p-1.5 hover:bg-surf-hover"
                title={t("common.more")}
                onClick={(e) => e.stopPropagation()}
              >
                <EllipsisHorizontalIcon className="h-[18px] w-[18px] text-txt-muted" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              {on_reply && !is_system && (
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    on_reply(message);
                  }}
                >
                  <ArrowUturnLeftIcon className="w-4 h-4 me-2 rtl:-scale-x-100" />
                  {t("mail.reply")}
                </DropdownMenuItem>
              )}
              {on_reply_all && !is_system && (
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    on_reply_all(message);
                  }}
                >
                  <ArrowUturnLeftIcon className="w-4 h-4 me-2 rtl:-scale-x-100" />
                  {t("mail.reply_all")}
                </DropdownMenuItem>
              )}
              {on_forward && (
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    on_forward(message);
                  }}
                >
                  <ArrowUturnRightIcon className="w-4 h-4 me-2 rtl:-scale-x-100" />
                  {t("mail.forward")}
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              {message.item_type !== "sent" && (
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    on_toggle_read?.();
                  }}
                >
                  {is_read ? (
                    <EyeSlashIcon className="w-4 h-4 me-2" />
                  ) : (
                    <EyeIcon className="w-4 h-4 me-2" />
                  )}
                  {is_read ? t("mail.mark_unread") : t("mail.mark_read")}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  on_star_toggle?.();
                }}
              >
                {is_starred ? (
                  <StarIconSolid className="w-4 h-4 me-2 text-amber-400" />
                ) : (
                  <StarIcon className="w-4 h-4 me-2" />
                )}
                {is_starred ? t("mail.unstar") : t("mail.star")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {on_archive && (
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    on_archive(message);
                  }}
                >
                  <ArchiveBoxIcon className="w-4 h-4 me-2" />
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
                  <TrashIcon className="w-4 h-4 me-2" />
                  {message.is_deleted
                    ? t("mail.delete_permanently")
                    : t("mail.move_to_trash")}
                </DropdownMenuItem>
              )}
              {folders.length > 0 && on_move_to_folder && (
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <FolderIcon className="w-4 h-4 me-2" />
                    {t("mail.move_to_folder")}
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="w-48">
                    {folders.map((folder) => {
                      const is_current = (message_folder_tokens ?? []).includes(
                        folder.id,
                      );

                      return (
                        <DropdownMenuItem
                          key={folder.id}
                          onSelect={(e) => {
                            e.preventDefault();
                            on_move_to_folder(message, folder.id);
                          }}
                        >
                          {is_current && (
                            <CheckIcon className="me-0.5 h-3 w-3 flex-shrink-0" />
                          )}
                          <span
                            className="me-1.5 h-2.5 w-2.5 rounded-full flex-shrink-0"
                            style={
                              folder.color.startsWith("#")
                                ? { backgroundColor: folder.color }
                                : {}
                            }
                          />
                          <span className="truncate">{folder.name}</span>
                        </DropdownMenuItem>
                      );
                    })}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              )}
              <DropdownMenuSeparator />
              {on_print && (
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    on_print(message);
                  }}
                >
                  <PrinterIcon className="w-4 h-4 me-2" />
                  {t("mail.print")}
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
                    <SunIcon className="w-4 h-4 me-2" />
                  ) : (
                    <MoonIcon className="w-4 h-4 me-2" />
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
                <CodeBracketIcon className="w-4 h-4 me-2" />
                {viewing_source ? t("mail.hide_source") : t("mail.view_source")}
              </DropdownMenuItem>
              {on_not_spam ? (
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    on_not_spam(message);
                  }}
                >
                  <ShieldExclamationIcon className="w-4 h-4 me-2" />
                  {t("mail.not_spam")}
                </DropdownMenuItem>
              ) : on_report_phishing ? (
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    on_report_phishing(message);
                  }}
                >
                  <ShieldExclamationIcon className="w-4 h-4 me-2 text-amber-500" />
                  <span className="text-amber-500">
                    {t("common.report_phishing")}
                  </span>
                </DropdownMenuItem>
              ) : null}
              {on_block_sender && !is_own_message && (
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    on_block_sender(message);
                  }}
                >
                  <NoSymbolIcon className="w-4 h-4 me-2 text-red-500" />
                  <span className="text-red-500">{t("mail.block_sender")}</span>
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  copy_text_or_throw(message.id)
                    .then(() => {
                      show_toast(t("common.message_id_copied"), "success");
                    })
                    .catch(() =>
                      show_toast(t("common.failed_to_copy"), "error"),
                    );
                }}
              >
                <ClipboardDocumentIcon className="w-4 h-4 me-2" />
                {t("mail.copy_message_id")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  set_show_details_modal(true);
                }}
              >
                <InformationCircleIcon className="w-4 h-4 me-2" />
                {t("mail.message_details")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <span className="text-[13px] text-txt-muted whitespace-nowrap ms-1.5">
            {format_email_detail(new Date(message.timestamp))}
          </span>
        </div>
      </div>

      <MessageDetailsModal
        is_open={show_details_modal}
        message={message}
        on_close={() => set_show_details_modal(false)}
        size_bytes={size_bytes}
      />

      {message.item_type === "received" &&
        message.dmarc_result !== "pass" &&
        (message.spf_result === "fail" ||
          message.dkim_result === "fail" ||
          message.dmarc_result === "fail") && (
          <div className="mx-4 mt-2 mb-3 rounded-md bg-[#dc2626]">
            <div className="flex items-center gap-2 px-3 py-2">
              <ShieldExclamationIcon className="w-4 h-4 text-white flex-shrink-0" />
              <p className="text-[13px] text-white leading-snug flex-1 min-w-0">
                {t("common.auth_fail_banner_body")}
              </p>
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    aria-label={t("common.auth_fail_banner_title")}
                    className="flex-shrink-0 text-white/80 hover:text-white transition-colors"
                    type="button"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <InformationCircleIcon className="w-4 h-4" />
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  align="end"
                  className="max-w-xs space-y-2 text-[12px] leading-snug"
                  side="bottom"
                >
                  <p>{t("common.auth_fail_tooltip_intro")}</p>
                  {message.spf_result === "fail" && (
                    <p>
                      <span className="font-semibold">SPF: </span>
                      {t("common.auth_fail_tooltip_spf")}
                    </p>
                  )}
                  {message.dkim_result === "fail" && (
                    <p>
                      <span className="font-semibold">DKIM: </span>
                      {t("common.auth_fail_tooltip_dkim")}
                    </p>
                  )}
                  {message.dmarc_result === "fail" && (
                    <p>
                      <span className="font-semibold">DMARC: </span>
                      {t("common.auth_fail_tooltip_dmarc")}
                    </p>
                  )}
                </PopoverContent>
              </Popover>
            </div>
          </div>
        )}

      {message.item_type === "received" &&
        on_not_spam &&
        message.is_spam === true &&
        (message.spam_signals?.length ?? 0) > 0 && (
          <SpamReasonsBanner
            on_not_spam={() => on_not_spam(message)}
            signals={message.spam_signals ?? []}
          />
        )}

      <div
        className={`${is_plain_text || html_blocked ? "ps-[52px] pb-4" : "pb-0"} pt-1`}
      >
        {!is_ratchet_undecryptable && (
          <div
            className={`min-w-0 ${is_plain_text || html_blocked ? "pe-4" : "ps-[52px] pe-4"}`}
          >
            <TranslationBanner
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
        {password_protected ? (
          <PgpPasswordProtectedMessage
            body={message.body}
            className="px-4 py-3"
            on_decrypted={set_password_unlocked_body}
          />
        ) : is_ratchet_undecryptable ? (
          <p className="px-4 py-3 text-sm italic text-txt-muted">
            {t("mail.encrypted_message_unavailable")}
          </p>
        ) : (
          <ThreadMessageBody
            body_background={
              html_blocked ? undefined : sanitized_content.body_background
            }
            clean_body={clean_body}
            disable_auto_dark_mode={disable_auto_dark_mode}
            email_id={message.id}
            force_dark_mode={force_dark_mode}
            is_plain_text={html_blocked ? true : is_plain_text}
            load_remote_content={html_blocked ? false : load_remote_content}
            on_document_ready={translation.on_document_ready}
            preserve_formatting={message.is_sending === true}
            sanitized_html={
              html_blocked ? (plain_text_html ?? "") : effective_html
            }
            set_wrap_source={set_wrap_source}
            viewing_source={viewing_source}
            wrap_source={wrap_source}
          />
        )}

        <div
          className={is_plain_text || html_blocked ? "" : "ps-[52px]"}
          onClick={(e) => e.stopPropagation()}
        >
          <AttachmentList
            has_recipient_key={message.has_recipient_key}
            hint_attachment_count={message.attachments?.length ?? 0}
            inline_cids={inline_cids}
            inline_filenames={inline_filenames}
            is_external={message.is_external}
            is_local={message.is_sending === true}
            mail_item_id={message.id}
          />
        </div>
      </div>

      {!show_inline_reply && (
        <div
          className={`${is_single_message || is_last_in_thread ? "sticky bottom-0 z-10" : ""} bg-[var(--bg-primary)]`}
          onClick={(e) => e.stopPropagation()}
        >
          <ThreadMessageActions
            message={message}
            on_forward={on_forward}
            on_reply={on_reply}
            on_reply_all={on_reply_all}
          />
        </div>
      )}

      {show_inline_reply &&
        on_close_inline_reply &&
        (() => {
          const is_own_msg = message.item_type === "sent";
          const {
            recipient_name: inline_recipient_name,
            recipient_email: inline_recipient_email,
          } = build_reply_recipient_for_message(
            message,
            auth?.user?.email ? [auth.user.email] : undefined,
          );

          const original_cc_emails =
            message.cc_recipients?.map((r) => r.email).filter(Boolean) ?? [];

          const all_to_emails =
            message.to_recipients?.map((r) => r.email).filter(Boolean) ?? [];

          const inline_reply_from = is_own_msg
            ? message.sender_email
            : undefined;

          return (
            <div onClick={(e) => e.stopPropagation()}>
              <InlineReplyComposer
                existing_draft={existing_draft}
                inline_mode={inline_mode}
                is_external={inline_reply_is_external}
                on_close={on_close_inline_reply}
                on_draft_saved={on_draft_saved}
                on_set_inline_mode={on_set_inline_mode}
                original_body={
                  is_ratchet_undecryptable ? "" : message.body || ""
                }
                original_cc={original_cc_emails}
                original_email_id={message.id}
                original_subject={message.subject}
                original_timestamp={message.timestamp}
                original_to={all_to_emails}
                quote_sender_email={
                  is_own_msg ? undefined : message.display_sender_email
                }
                quote_sender_name={
                  !is_own_msg && message.display_sender_email
                    ? message.display_sender_name || message.sender_name
                    : undefined
                }
                recipient_email={inline_recipient_email}
                recipient_name={inline_recipient_name}
                reply_from_address={inline_reply_from}
                sender_email={message.sender_email}
                sender_name={message.sender_name}
                thread_token={inline_reply_thread_token}
              />
            </div>
          );
        })()}
    </div>
  );
}

export { ThreadMessagesList } from "./thread_messages_list";
export type { ThreadMessagesListRef } from "./thread_messages_list";
