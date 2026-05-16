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
import type { AttachmentPreviewEntry } from "@/hooks/use_attachment_previews";

import { forwardRef, memo, useMemo, useState, useRef, useEffect } from "react";
import {
  ArchiveBoxArrowDownIcon,
  ArrowUturnLeftIcon,
  CheckCircleIcon,
  EnvelopeIcon,
  EnvelopeOpenIcon,
  ExclamationTriangleIcon,
  InboxIcon,
  MapPinIcon,
  PaperClipIcon,
  StarIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { CheckIcon, StarIcon as StarIconSolid } from "@heroicons/react/24/solid";
import { Tooltip } from "@aster/ui";

import { use_i18n } from "@/lib/i18n/context";
import { ProfileAvatar } from "@/components/ui/profile_avatar";
import { AvatarRing } from "@/components/ui/avatar_ring";
import { BadgeChip } from "@/components/ui/badge_chip";
import { use_peer_profile } from "@/hooks/use_peer_profile";
import {
  EmailTag,
  hex_to_variant,
  type TagIconName,
} from "@/components/ui/email_tag";
import { SnoozeBadge } from "@/components/ui/snooze_badge";
import { ExpirationCountdown } from "@/components/email/expiration_countdown";
import { AttachmentChip } from "@/components/email/attachment_chip";
import { cn, is_system_email } from "@/lib/utils";
import {
  get_alias_hash_by_address,
  subscribe_aliases,
} from "@/hooks/use_sidebar_aliases";

interface InboxEmailListItemProps extends React.HTMLAttributes<HTMLDivElement> {
  email: InboxEmail;
  density: string;
  show_profile_pictures: boolean;
  show_email_preview: boolean;
  show_message_size?: boolean;
  show_thread_count?: boolean;
  search_preview_node?: React.ReactNode;
  current_view?: string;
  is_active?: boolean;
  is_focused?: boolean;
  selected_ids?: string[];
  selected_folder_tokens?: string[];
  selected_tag_tokens?: string[];
  on_toggle_select: (id: string) => void;
  on_email_click: (id: string) => void;
  on_archive?: (email: InboxEmail) => void;
  on_spam?: (email: InboxEmail) => void;
  on_delete?: (email: InboxEmail) => void;
  on_toggle_read?: (email: InboxEmail) => void;
  on_toggle_star?: (email: InboxEmail) => void;
  on_restore?: (email: InboxEmail) => void;
  on_move_to_inbox?: (email: InboxEmail) => void;
  on_mark_not_spam?: (email: InboxEmail) => void;
  attachment_previews?: AttachmentPreviewEntry;
}

function format_email_size(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function get_density_classes(density: string): string {
  if (density === "Compact") return "py-2";
  if (density === "Spacious") return "py-3.5";

  return "py-2.5";
}

function truncate_preview(preview: string, subject_length: number): string {
  const char_budget = Math.max(30, 100 - subject_length);

  if (preview.length <= char_budget) return preview;

  return preview.slice(0, char_budget).trimEnd() + "\u2026";
}

function format_mobile_timestamp(timestamp: string): string {
  if (timestamp.includes("/") || timestamp.includes("-")) {
    const parts = timestamp.split(/[/\-]/);

    if (parts.length >= 2) {
      return `${parts[0]}/${parts[1]}`;
    }
  }

  return timestamp;
}

function StarToggleButton({
  email,
  on_toggle_star,
}: {
  email: InboxEmail;
  on_toggle_star: (email: InboxEmail) => void;
}) {
  const { t } = use_i18n();
  const star_ref = useRef<HTMLButtonElement>(null);

  const handle_click = () => {
    on_toggle_star(email);
    const el = star_ref.current;

    if (el) {
      el.style.transform = "scale(1.35)";
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          el.style.transform = "scale(1)";
        });
      });
    }
  };

  return (
    <Tooltip tip={email.is_starred ? t("mail.unstar") : t("mail.star")}>
      <button
        ref={star_ref}
        className="p-1.5 rounded-[14px] hover:bg-black/10 dark:hover:bg-white/10"
        onClick={handle_click}
      >
        {email.is_starred ? (
          <StarIconSolid className="w-4 h-4 text-amber-400" />
        ) : (
          <StarIcon className="w-4 h-4 text-txt-muted" />
        )}
      </button>
    </Tooltip>
  );
}

export const InboxEmailListItem = memo(
  forwardRef<HTMLDivElement, InboxEmailListItemProps>(
    function InboxEmailListItem(
      {
        email,
        density,
        show_profile_pictures,
        show_email_preview,
        show_message_size,
        show_thread_count = true,
        search_preview_node,
        current_view,
        is_active,
        is_focused: _is_focused,
        selected_ids,
        selected_folder_tokens,
        selected_tag_tokens,
        on_toggle_select,
        on_email_click,
        on_archive,
        on_spam,
        on_delete,
        on_toggle_read,
        on_toggle_star,
        on_restore,
        on_move_to_inbox,
        on_mark_not_spam,
        attachment_previews,
        className,
        ...props
      },
      ref,
    ) {
      const { t } = use_i18n();
      const peer_profile = use_peer_profile(
        is_system_email(email.sender_email) ? null : email.sender_email,
      );
      const peer_badge = peer_profile?.active_badge ?? null;
      const show_sender_ring =
        (peer_profile?.show_badge_ring ?? false) && !!peer_badge;
      const show_sender_badge =
        (peer_profile?.show_badge_profile ?? false) && !!peer_badge;
      const is_trash_view = current_view === "trash";
      const is_spam_view = current_view === "spam";
      const is_archive_view = current_view === "archive";
      const show_hover_actions =
        on_archive ||
        on_spam ||
        on_delete ||
        on_toggle_read ||
        on_toggle_star ||
        on_restore ||
        on_move_to_inbox ||
        on_mark_not_spam;

      const named_folders = useMemo(
        () => email.folders?.filter((f) => f.name) ?? [],
        [email.folders],
      );

      const named_tags = useMemo(
        () => email.tags?.filter((t) => t.name) ?? [],
        [email.tags],
      );

      const [is_dragging, set_is_dragging] = useState(false);
      const drag_image_ref = useRef<HTMLDivElement | null>(null);
      const [, set_alias_version] = useState(0);

      useEffect(() => {
        return subscribe_aliases(() => set_alias_version((v) => v + 1));
      }, []);

      useEffect(() => {
        const sweep = () => {
          document
            .querySelectorAll('[data-astermail-drag-image="1"]')
            .forEach((n) => n.remove());
        };

        window.addEventListener("dragend", sweep);
        window.addEventListener("drop", sweep);

        return () => {
          window.removeEventListener("dragend", sweep);
          window.removeEventListener("drop", sweep);
          if (drag_image_ref.current) {
            drag_image_ref.current.remove();
            drag_image_ref.current = null;
          }
        };
      }, []);

      const handle_drag_start = (e: React.DragEvent<HTMLDivElement>) => {
        document
          .querySelectorAll('[data-astermail-drag-image="1"]')
          .forEach((n) => n.remove());

        const is_multi =
          email.is_selected && selected_ids && selected_ids.length > 1;
        const ids = is_multi ? selected_ids : [email.id];
        const count = ids.length;

        const drag_el = document.createElement("div");

        drag_el.setAttribute("data-astermail-drag-image", "1");
        drag_el.style.cssText =
          "position:fixed;top:-1000px;left:-1000px;display:flex;align-items:center;gap:8px;padding:8px 14px;border-radius:8px;font-size:13px;font-weight:500;font-family:system-ui,sans-serif;white-space:nowrap;pointer-events:none;z-index:99999;background:var(--accent-color,#3b82f6);color:#fff;box-shadow:0 4px 12px rgba(0,0,0,0.3);";

        const icon = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "svg",
        );

        icon.setAttribute("viewBox", "0 0 24 24");
        icon.setAttribute("fill", "none");
        icon.setAttribute("stroke", "currentColor");
        icon.setAttribute("stroke-width", "2");
        icon.style.cssText = "width:16px;height:16px;flex-shrink:0;";
        const path = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "path",
        );

        path.setAttribute("stroke-linecap", "round");
        path.setAttribute("stroke-linejoin", "round");
        path.setAttribute(
          "d",
          "M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75",
        );
        icon.appendChild(path);
        drag_el.appendChild(icon);

        const label = document.createElement("span");

        label.textContent =
          count === 1
            ? t("mail.move_1_conversation")
            : t("mail.move_n_conversations", { count: String(count) });
        drag_el.appendChild(label);

        document.body.appendChild(drag_el);
        drag_image_ref.current = drag_el;

        e.dataTransfer.setDragImage(
          drag_el,
          drag_el.offsetWidth / 2,
          drag_el.offsetHeight,
        );

        e.dataTransfer.setData(
          "application/x-astermail-emails",
          JSON.stringify(ids),
        );

        const folder_tokens = is_multi
          ? selected_folder_tokens || []
          : (email.folders || []).map((f) => f.folder_token);
        const tag_tokens = is_multi
          ? selected_tag_tokens || []
          : (email.tags || []).map((t) => t.id);

        e.dataTransfer.setData(
          "application/x-astermail-folders",
          JSON.stringify(folder_tokens),
        );
        e.dataTransfer.setData(
          "application/x-astermail-tags",
          JSON.stringify(tag_tokens),
        );
        e.dataTransfer.effectAllowed = "move";
        set_is_dragging(true);
      };

      const handle_drag_end = () => {
        set_is_dragging(false);
        if (drag_image_ref.current) {
          drag_image_ref.current.remove();
          drag_image_ref.current = null;
        }
        document
          .querySelectorAll('[data-astermail-drag-image="1"]')
          .forEach((n) => n.remove());
      };

      return (
        <div
          ref={ref}
          draggable
          className={cn(
            "group relative flex items-center gap-2 sm:gap-3 px-3 sm:px-4 cursor-pointer w-full",
            get_density_classes(density),
            is_active
              ? "bg-surf-hover"
              : email.is_selected === true
                ? "bg-surf-tertiary"
                : "dark:hover:bg-surf-hover",
            is_dragging && "opacity-50",
            className,
          )}
          role="button"
          tabIndex={0}
          onClick={() => on_email_click(email.id)}
          onDragEnd={handle_drag_end}
          onDragStart={handle_drag_start}
          onKeyDown={(e) => {
            if (e["key"] === "Enter" || e["key"] === " ") {
              e.preventDefault();
              on_email_click(email.id);
            }
          }}
          {...props}
        >
          <Tooltip delay={600} tip={t("mail.select")}>
            <div
              className="group/avatar relative flex-shrink-0 w-8 h-8 flex items-center justify-center cursor-pointer"
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                on_toggle_select(email.id);
              }}
              onKeyDown={(e) => {
                if (e["key"] === "Enter" || e["key"] === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                  on_toggle_select(email.id);
                }
              }}
            >
              <div
                className={cn(
                  "w-8 h-8 transition-opacity duration-150",
                  email.is_selected
                    ? "opacity-0"
                    : "group-hover/avatar:opacity-0",
                )}
              >
                {is_system_email(email.sender_email) ? (
                  <img
                    alt={t("common.aster_mail")}
                    className="w-8 h-8 rounded-full object-cover"
                    draggable={false}
                    src="/mail_logo.webp"
                  />
                ) : (
                  <AvatarRing
                    badge_slug={peer_badge?.slug}
                    enabled={show_sender_ring}
                    thickness={2}
                  >
                    <ProfileAvatar
                      use_domain_logo={show_profile_pictures}
                      email={email.sender_email}
                      image_url={peer_profile?.profile_picture ?? email.avatar_url}
                      name={peer_profile?.display_name ?? email.sender_name}
                      size="sm"
                    />
                  </AvatarRing>
                )}
              </div>
              <div
                className={cn(
                  "absolute inset-0 rounded-full flex items-center justify-center transition-opacity duration-150",
                  email.is_selected
                    ? "opacity-100 bg-[var(--accent-color,#3b82f6)]"
                    : "opacity-0 group-hover/avatar:opacity-100 bg-black/20 dark:bg-white/20",
                )}
              >
                <CheckIcon className="w-4 h-4 text-white" />
              </div>
            </div>
          </Tooltip>

          {email.is_pinned && (
            <MapPinIcon className="w-4 h-4 text-blue-500 flex-shrink-0 -rotate-45 hidden sm:block" />
          )}

          {!email.is_read && (
            <span className="w-2 h-2 rounded-full bg-[var(--accent-blue)] flex-shrink-0 hidden sm:block" />
          )}

          <div className="flex-1 min-w-0 flex items-center gap-3 sm:gap-10 overflow-hidden">
            <div className="flex items-center gap-1.5 min-w-0 sm:max-w-[45%] overflow-hidden pr-px">
              {show_thread_count &&
                email.thread_message_count != null &&
                email.thread_message_count > 1 && (
                  <span
                    className={cn(
                      "text-[11px] font-medium flex-shrink-0 min-w-[18px] h-[18px] flex items-center justify-center rounded border",
                      email.is_read
                        ? "border-txt-muted text-txt-muted"
                        : "border-txt-secondary text-txt-secondary",
                    )}
                  >
                    {email.thread_message_count}
                  </span>
                )}

              <span
                className={cn(
                  "truncate text-sm",
                  email.is_read
                    ? "font-normal text-txt-muted"
                    : "font-semibold text-txt-primary",
                )}
              >
                {email.thread_participant_names &&
                email.thread_participant_names.length > 0
                  ? email.thread_participant_names.join(", ")
                  : (peer_profile?.display_name ?? email.sender_name)}
              </span>

              {show_sender_badge && peer_badge && (
                <BadgeChip
                  badge={peer_badge}
                  className="flex-shrink-0 hidden sm:inline-flex"
                  show_find_order={false}
                  size="sm"
                />
              )}

            </div>

            <div className="flex-1 min-w-0 overflow-hidden flex items-center gap-1.5">
              {is_system_email(email.sender_email) && (
                <EmailTag
                  className="flex-shrink-0 hidden sm:inline-flex"
                  icon="info"
                  label={t("common.system")}
                  muted={email.is_read}
                  variant="blue"
                />
              )}

              {email.item_type === "scheduled" && (
                <EmailTag
                  className="flex-shrink-0 hidden sm:inline-flex"
                  label={t("mail.scheduled_label")}
                  muted={email.is_read}
                  variant="scheduled"
                />
              )}

              {email.item_type === "draft" && (
                <EmailTag
                  className="flex-shrink-0 hidden sm:inline-flex"
                  label={t("mail.draft")}
                  muted={email.is_read}
                  variant="draft"
                />
              )}

              {email.item_type === "sent" && current_view !== "sent" && (
                <EmailTag
                  className="flex-shrink-0 hidden sm:inline-flex"
                  label={t("mail.sent_label")}
                  muted={email.is_read}
                  variant="sent"
                />
              )}

              {email.send_status === "bounced" && (
                <EmailTag
                  className="flex-shrink-0"
                  icon="warning"
                  label={t("common.bounced_label")}
                  variant="red"
                />
              )}

              {email.send_status === "failed" && (
                <EmailTag
                  className="flex-shrink-0"
                  icon="warning"
                  label={t("common.failed_label")}
                  variant="red"
                />
              )}

              {email.is_archived && (
                <EmailTag
                  className="flex-shrink-0 hidden sm:inline-flex"
                  label={t("mail.archived_label")}
                  muted={email.is_read}
                  variant="archived"
                />
              )}

              {email.is_trashed && (
                <EmailTag
                  className="flex-shrink-0 hidden sm:inline-flex"
                  label={t("mail.trashed_label")}
                  muted={email.is_read}
                  variant="trashed"
                />
              )}

              {email.is_spam && (
                <EmailTag
                  className="flex-shrink-0 hidden sm:inline-flex"
                  label={t("mail.spam_label")}
                  muted={email.is_read}
                  variant="spam"
                />
              )}

              {(() => {
                const custom_domain = email.recipient_addresses?.find((a) => {
                  const lower = a.toLowerCase();
                  const d = lower.split("@")[1];

                  if (
                    !d ||
                    d === "astermail.org" ||
                    d === "aster.cx" ||
                    d === "gs-cloud.space"
                  ) {
                    return false;
                  }

                  return get_alias_hash_by_address(lower) !== null;
                });

                return custom_domain ? (
                  <EmailTag
                    show_icon
                    className="flex-shrink-0 hidden sm:inline-flex"
                    icon="globe"
                    label={custom_domain.split("@")[1]}
                    muted={email.is_read}
                    variant="blue"
                  />
                ) : null;
              })()}

              {email.phishing_level === "suspicious" && (
                <span className="flex-shrink-0 hidden sm:inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold leading-none text-white bg-[#d97706]">
                  {t("common.suspicious")}
                </span>
              )}

              {email.phishing_level === "dangerous" && (
                <span className="flex-shrink-0 hidden sm:inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold leading-none text-white bg-[#dc2626]">
                  {t("common.dangerous")}
                </span>
              )}

              {email.snoozed_until && (
                <SnoozeBadge
                  className="flex-shrink-0 hidden sm:inline-flex"
                  muted={email.is_read}
                  snoozed_until={email.snoozed_until}
                />
              )}

              {email.expires_at && (
                <ExpirationCountdown
                  expires_at={email.expires_at}
                  show_label={false}
                  size="md"
                />
              )}

              {named_folders.length > 0 && (
                <div className="hidden sm:flex items-center gap-1.5 flex-shrink-0">
                  {named_folders.slice(0, 3).map((folder) => {
                    const folder_color = folder.color || "#3b82f6";
                    return (
                      <EmailTag
                        key={folder.folder_token}
                        className="flex-shrink-0"
                        custom_color={folder_color}
                        icon={(folder.icon as TagIconName) || "folder"}
                        label={folder.name}
                        muted={email.is_read}
                        variant={hex_to_variant(folder_color)}
                      />
                    );
                  })}
                  {named_folders.length > 3 && (
                    <span className="text-[11px] text-txt-muted">
                      +{named_folders.length - 3}
                    </span>
                  )}
                </div>
              )}

              {named_tags.length > 0 && (
                <div className="hidden sm:flex items-center gap-1.5 flex-shrink-0">
                  {named_tags.slice(0, 3).map((tag) => (
                    <EmailTag
                      key={tag.id}
                      className="flex-shrink-0"
                      custom_color={tag.color}
                      icon={tag.icon as TagIconName}
                      label={tag.name}
                      muted={email.is_read}
                      show_icon={!!tag.icon}
                      variant={
                        tag.color ? hex_to_variant(tag.color) : "neutral"
                      }
                    />
                  ))}
                  {named_tags.length > 3 && (
                    <span className="text-[11px] text-txt-muted">
                      +{named_tags.length - 3}
                    </span>
                  )}
                </div>
              )}

              <div className="whitespace-nowrap text-sm min-w-0 truncate flex-1">
                <span
                  className={cn(
                    email.is_read
                      ? "font-normal text-txt-tertiary"
                      : "font-medium text-txt-primary",
                  )}
                >
                  {email.subject || t("mail.no_subject")}
                </span>
                {show_email_preview &&
                  (search_preview_node || email.preview) && (
                    <span className="text-txt-muted">
                      {" \u2014 "}
                      {search_preview_node ||
                        truncate_preview(
                          email.preview,
                          (email.subject || "").length,
                        )}
                    </span>
                  )}
              </div>
              {attachment_previews?.state === "loaded" &&
                attachment_previews.attachments.length > 0 && (
                  <div
                    className="hidden md:flex items-center gap-1 mt-1 mb-0.5"
                    data-testid="attachment-chips-container"
                  >
                    {attachment_previews.attachments.slice(0, 3).map((att) => (
                      <AttachmentChip
                        key={att.id}
                        filename={att.filename}
                        muted={email.is_read}
                        type_color={att.type_color}
                        type_label={att.type_label}
                      />
                    ))}
                    {attachment_previews.attachments.length > 3 && (
                      <span className="text-[10px] text-txt-muted">
                        {t("mail.attachment_chips_more", {
                          count: String(
                            attachment_previews.attachments.length - 3,
                          ),
                        })}
                      </span>
                    )}
                  </div>
                )}
            </div>

            <span className="text-[11px] text-txt-muted tabular-nums whitespace-nowrap sm:hidden shrink-0">
              {format_mobile_timestamp(email.timestamp)}
              {show_message_size &&
                email.size_bytes != null &&
                email.size_bytes > 0 && (
                  <span className="ml-1.5">
                    {"\u2022 "}
                    {format_email_size(email.size_bytes)}
                  </span>
                )}
            </span>
          </div>

          {show_hover_actions && (
            <div
              className={cn(
                "absolute right-0 top-0 bottom-0 w-64 pointer-events-none opacity-0 group-hover:opacity-100 hidden sm:block",
                is_active
                  ? "bg-gradient-to-r from-transparent via-surf-hover to-surf-hover"
                  : email.is_selected === true
                    ? "bg-gradient-to-r from-transparent via-surf-tertiary to-surf-tertiary"
                    : "bg-gradient-to-r from-transparent via-surf-primary to-surf-primary dark:group-hover:via-surf-hover dark:group-hover:to-surf-hover",
              )}
              style={{
                ["--tw-gradient-via-position" as string]: "35%",
                ["--tw-gradient-to-position" as string]: "100%",
              }}
            />
          )}

          <div className="hidden sm:flex items-center gap-2 flex-shrink-0 ml-auto">
            {email.has_attachment && (
              <PaperClipIcon
                className={cn(
                  "w-4 h-4 text-txt-muted",
                  show_hover_actions && "group-hover:opacity-0",
                  attachment_previews?.state === "loaded" &&
                    attachment_previews.attachments.length > 0
                    ? "hidden"
                    : "hidden md:block",
                )}
              />
            )}

            {email.is_starred && (
              <StarIconSolid
                className={cn(
                  "w-3.5 h-3.5 text-amber-400 flex-shrink-0",
                  show_hover_actions && "group-hover:opacity-0",
                )}
              />
            )}

            <span
              className={cn(
                "text-xs text-txt-muted tabular-nums whitespace-nowrap",
                show_hover_actions && "group-hover:opacity-0",
              )}
            >
              {email.timestamp}
              {show_message_size &&
                email.size_bytes != null &&
                email.size_bytes > 0 && (
                  <span className="ml-1.5">
                    {"\u2022 "}
                    {format_email_size(email.size_bytes)}
                  </span>
                )}
            </span>

            {show_hover_actions && (
              <div
                className={cn(
                  "absolute right-3 sm:right-4 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 pl-10",
                  is_active
                    ? "bg-gradient-to-r from-transparent to-surf-hover"
                    : email.is_selected === true
                      ? "bg-gradient-to-r from-transparent to-surf-tertiary"
                      : "bg-gradient-to-r from-transparent to-surf-primary dark:group-hover:to-surf-hover",
                )}
                role="button"
                tabIndex={0}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  if (e["key"] === "Enter" || e["key"] === " ") {
                    e.stopPropagation();
                  }
                }}
              >
                {on_toggle_read && (
                  <Tooltip
                    tip={
                      email.is_read
                        ? t("mail.mark_as_unread")
                        : t("mail.mark_as_read")
                    }
                  >
                    <button
                      className="p-1.5 rounded-[14px] hover:bg-black/10 dark:hover:bg-white/10"
                      onClick={() => on_toggle_read(email)}
                    >
                      {email.is_read ? (
                        <EnvelopeIcon className="w-4 h-4 text-txt-muted" />
                      ) : (
                        <EnvelopeOpenIcon className="w-4 h-4 text-txt-muted" />
                      )}
                    </button>
                  </Tooltip>
                )}

                {on_toggle_star && (
                  <StarToggleButton
                    email={email}
                    on_toggle_star={on_toggle_star}
                  />
                )}

                {is_trash_view && on_restore && (
                  <Tooltip tip={t("mail.restore")}>
                    <button
                      className="p-1.5 rounded-[14px] hover:bg-black/10 dark:hover:bg-white/10"
                      onClick={() => on_restore(email)}
                    >
                      <ArrowUturnLeftIcon className="w-4 h-4 text-txt-muted" />
                    </button>
                  </Tooltip>
                )}

                {is_archive_view && on_move_to_inbox && (
                  <Tooltip tip={t("mail.move_to_inbox")}>
                    <button
                      className="p-1.5 rounded-[14px] hover:bg-black/10 dark:hover:bg-white/10"
                      onClick={() => on_move_to_inbox(email)}
                    >
                      <InboxIcon className="w-4 h-4 text-txt-muted" />
                    </button>
                  </Tooltip>
                )}

                {is_spam_view && on_mark_not_spam && (
                  <Tooltip tip={t("mail.not_spam")}>
                    <button
                      className="p-1.5 rounded-[14px] hover:bg-black/10 dark:hover:bg-white/10"
                      onClick={() => on_mark_not_spam(email)}
                    >
                      <CheckCircleIcon className="w-4 h-4 text-txt-muted" />
                    </button>
                  </Tooltip>
                )}

                {!is_trash_view && !is_archive_view && on_archive && (
                  <Tooltip tip={t("mail.archive")}>
                    <button
                      className="p-1.5 rounded-[14px] hover:bg-black/10 dark:hover:bg-white/10"
                      onClick={() => on_archive(email)}
                    >
                      <ArchiveBoxArrowDownIcon className="w-4 h-4 text-txt-muted" />
                    </button>
                  </Tooltip>
                )}

                {!is_trash_view && !is_spam_view && on_spam && (
                  <Tooltip tip={t("mail.report_spam")}>
                    <button
                      className="p-1.5 rounded-[14px] hover:bg-black/10 dark:hover:bg-white/10"
                      onClick={() => on_spam(email)}
                    >
                      <ExclamationTriangleIcon className="w-4 h-4 text-txt-muted" />
                    </button>
                  </Tooltip>
                )}

                {on_delete && (
                  <Tooltip tip={is_trash_view ? t("mail.delete_permanently") : t("mail.move_to_trash")}>
                    <button
                      className="p-1.5 rounded-[14px] hover:bg-black/10 dark:hover:bg-white/10"
                      onClick={() => on_delete(email)}
                    >
                      <TrashIcon className="w-4 h-4 text-txt-muted" />
                    </button>
                  </Tooltip>
                )}
              </div>
            )}
          </div>
        </div>
      );
    },
  ),
);
