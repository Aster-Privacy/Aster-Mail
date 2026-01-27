import type { InboxEmail } from "@/types/email";

import { forwardRef, useMemo } from "react";
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
  TrashIcon,
} from "@heroicons/react/24/outline";

import { strip_html_tags } from "@/lib/html_sanitizer";
import { Checkbox } from "@/components/ui/checkbox";
import { ProfileAvatar } from "@/components/ui/profile_avatar";
import {
  EmailTag,
  hex_to_variant,
  type TagIconName,
} from "@/components/ui/email_tag";
import { SnoozeBadge } from "@/components/ui/snooze_badge";
import { cn, is_astermail_sender } from "@/lib/utils";

interface InboxEmailListItemProps extends React.HTMLAttributes<HTMLDivElement> {
  email: InboxEmail;
  density: string;
  show_profile_pictures: boolean;
  show_email_preview: boolean;
  current_view?: string;
  is_active?: boolean;
  is_focused?: boolean;
  on_toggle_select: (id: string) => void;
  on_email_click: (id: string) => void;
  on_archive?: (email: InboxEmail) => void;
  on_spam?: (email: InboxEmail) => void;
  on_delete?: (email: InboxEmail) => void;
  on_toggle_read?: (email: InboxEmail) => void;
  on_restore?: (email: InboxEmail) => void;
  on_move_to_inbox?: (email: InboxEmail) => void;
  on_mark_not_spam?: (email: InboxEmail) => void;
}

function get_density_classes(density: string): string {
  if (density === "Compact") return "py-2";
  if (density === "Spacious") return "py-4";

  return "py-3";
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

export const InboxEmailListItem = forwardRef<
  HTMLDivElement,
  InboxEmailListItemProps
>(function InboxEmailListItem(
  {
    email,
    density,
    show_profile_pictures,
    show_email_preview,
    current_view,
    is_active,
    is_focused: _is_focused,
    on_toggle_select,
    on_email_click,
    on_archive,
    on_spam,
    on_delete,
    on_toggle_read,
    on_restore,
    on_move_to_inbox,
    on_mark_not_spam,
    className,
    ...props
  },
  ref,
) {
  const is_trash_view = current_view === "trash";
  const is_spam_view = current_view === "spam";
  const is_archive_view = current_view === "archive";
  const show_hover_actions =
    on_archive ||
    on_spam ||
    on_delete ||
    on_toggle_read ||
    on_restore ||
    on_move_to_inbox ||
    on_mark_not_spam;

  const plain_preview = useMemo(() => {
    if (!email.preview) return "";

    return strip_html_tags(email.preview);
  }, [email.preview]);

  return (
    <div
      ref={ref}
      className={cn(
        "group relative flex items-center gap-2 sm:gap-3 px-3 sm:px-4 border-b cursor-pointer transition-colors",
        get_density_classes(density),
        is_active
          ? "bg-[var(--bg-hover)]"
          : email.is_selected === true
            ? "bg-[var(--bg-tertiary)]"
            : "hover:bg-[var(--bg-hover)]",
        className,
      )}
      role="button"
      style={{
        borderColor: "var(--border-secondary)",
      }}
      tabIndex={0}
      onClick={() => on_email_click(email.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          on_email_click(email.id);
        }
      }}
      {...props}
    >
      <div
        className="flex items-center gap-2 sm:gap-3 flex-shrink-0"
        role="button"
        tabIndex={0}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.stopPropagation();
          }
        }}
      >
        <div
          className="sm:p-0 p-1.5 -m-1.5 sm:m-0"
          role="button"
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation();
            on_toggle_select(email.id);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              e.stopPropagation();
              on_toggle_select(email.id);
            }
          }}
        >
          <Checkbox
            checked={email.is_selected === true}
            className="pointer-events-none"
          />
        </div>
      </div>

      {email.is_pinned && (
        <MapPinIcon className="w-4 h-4 text-blue-500 flex-shrink-0 -rotate-45 hidden sm:block" />
      )}

      {show_profile_pictures &&
        (is_astermail_sender(email.sender_name, email.sender_email) ? (
          <img
            alt="Aster Mail"
            className="hidden sm:flex w-8 h-8 rounded-full flex-shrink-0 object-cover"
            draggable={false}
            src="/mail_logo.png"
          />
        ) : (
          <ProfileAvatar
            use_domain_logo
            className="hidden sm:flex"
            email={email.sender_email}
            image_url={email.avatar_url}
            name={email.sender_name}
            size="sm"
          />
        ))}

      <div className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-1.5">
        <div className="flex items-center gap-1 sm:contents">
          <span className="flex items-center gap-1 truncate sm:max-w-44">
            <span
              className={cn(
                "truncate text-sm",
                email.is_read
                  ? "font-normal text-[var(--text-tertiary)]"
                  : "font-semibold text-[var(--text-primary)]",
              )}
            >
              {email.sender_name}
            </span>
            {email.thread_message_count && email.thread_message_count > 1 && (
              <span
                className={cn(
                  "text-xs flex-shrink-0",
                  email.is_read
                    ? "text-[var(--text-muted)]"
                    : "text-[var(--text-secondary)]",
                )}
              >
                {email.thread_message_count}
              </span>
            )}
          </span>

          {email.item_type === "scheduled" && (
            <EmailTag
              className="flex-shrink-0 hidden sm:inline-flex"
              label="Scheduled"
              muted={email.is_read}
              size="default"
              variant="scheduled"
            />
          )}

          {email.item_type === "draft" && (
            <EmailTag
              className="flex-shrink-0 hidden sm:inline-flex"
              label="Draft"
              muted={email.is_read}
              size="default"
              variant="draft"
            />
          )}

          {email.item_type === "sent" && current_view !== "sent" && (
            <EmailTag
              className="flex-shrink-0 hidden sm:inline-flex"
              label="Sent"
              muted={email.is_read}
              size="default"
              variant="sent"
            />
          )}

          {email.is_archived && (
            <EmailTag
              className="flex-shrink-0 hidden sm:inline-flex"
              label="Archived"
              muted={email.is_read}
              size="default"
              variant="archived"
            />
          )}

          {email.is_trashed && (
            <EmailTag
              className="flex-shrink-0 hidden sm:inline-flex"
              label="Trashed"
              muted={email.is_read}
              size="default"
              variant="trashed"
            />
          )}

          {email.is_spam && (
            <EmailTag
              className="flex-shrink-0 hidden sm:inline-flex"
              label="Spam"
              muted={email.is_read}
              size="default"
              variant="spam"
            />
          )}

          {email.snoozed_until && (
            <SnoozeBadge
              className="flex-shrink-0 hidden sm:inline-flex"
              muted={email.is_read}
              size="default"
              snoozed_until={email.snoozed_until}
            />
          )}

          {email.folders && email.folders.filter((f) => f.name).length > 0 && (
            <>
              {email.folders
                .filter((f) => f.name)
                .slice(0, 2)
                .map((folder) => (
                  <EmailTag
                    key={folder.folder_token}
                    className="flex-shrink-0 hidden sm:inline-flex"
                    custom_color={folder.color}
                    icon={(folder.icon as TagIconName) || "folder"}
                    label={folder.name}
                    muted={email.is_read}
                    size="default"
                    variant={
                      folder.color ? hex_to_variant(folder.color) : "neutral"
                    }
                  />
                ))}
              {email.folders.filter((f) => f.name).length > 2 && (
                <span className="text-[11px] text-[var(--text-muted)] hidden sm:inline">
                  +{email.folders.filter((f) => f.name).length - 2}
                </span>
              )}
            </>
          )}

          <span className="text-[11px] text-[var(--text-muted)] tabular-nums whitespace-nowrap sm:hidden ml-auto">
            {format_mobile_timestamp(email.timestamp)}
          </span>
        </div>

        <div className="flex items-center gap-1.5 sm:contents min-w-0">
          {!email.is_read && (
            <span className="w-2 h-2 rounded-full bg-[var(--accent-blue)] flex-shrink-0" />
          )}
          <span
            className={cn(
              "truncate text-sm",
              email.is_read
                ? "font-normal text-[var(--text-tertiary)]"
                : "font-medium text-[var(--text-primary)]",
            )}
          >
            {email.subject || "(No subject)"}
          </span>

          {show_email_preview && plain_preview && (
            <span className="hidden lg:block truncate text-sm text-[var(--text-muted)] flex-1">
              — {plain_preview}
            </span>
          )}
        </div>
      </div>

      {show_hover_actions && (
        <div
          className={cn(
            "absolute right-0 top-0 bottom-0 w-52 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-150 hidden sm:block",
            email.is_selected === true
              ? "bg-gradient-to-r from-transparent via-[var(--bg-tertiary)] to-[var(--bg-tertiary)]"
              : "bg-gradient-to-r from-transparent via-[var(--bg-primary)] to-[var(--bg-primary)]",
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
              "w-4 h-4 text-[var(--text-muted)] hidden md:block transition-opacity duration-150",
              show_hover_actions && "group-hover:opacity-0",
            )}
          />
        )}

        <span
          className={cn(
            "text-xs text-[var(--text-muted)] tabular-nums whitespace-nowrap transition-opacity duration-150",
            show_hover_actions && "group-hover:opacity-0",
          )}
        >
          {email.timestamp}
        </span>

        {show_hover_actions && (
          <div
            className="absolute right-3 sm:right-4 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150"
            role="button"
            tabIndex={0}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.stopPropagation();
              }
            }}
          >
            {on_toggle_read && (
              <button
                className="p-1.5 rounded-md hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
                onClick={() => on_toggle_read(email)}
              >
                {email.is_read ? (
                  <EnvelopeIcon className="w-4 h-4 text-[var(--text-muted)]" />
                ) : (
                  <EnvelopeOpenIcon className="w-4 h-4 text-[var(--text-muted)]" />
                )}
              </button>
            )}

            {is_trash_view && on_restore && (
              <button
                className="p-1.5 rounded-md hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
                onClick={() => on_restore(email)}
              >
                <ArrowUturnLeftIcon className="w-4 h-4 text-[var(--text-muted)]" />
              </button>
            )}

            {is_archive_view && on_move_to_inbox && (
              <button
                className="p-1.5 rounded-md hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
                onClick={() => on_move_to_inbox(email)}
              >
                <InboxIcon className="w-4 h-4 text-[var(--text-muted)]" />
              </button>
            )}

            {is_spam_view && on_mark_not_spam && (
              <button
                className="p-1.5 rounded-md hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
                onClick={() => on_mark_not_spam(email)}
              >
                <CheckCircleIcon className="w-4 h-4 text-[var(--text-muted)]" />
              </button>
            )}

            {!is_trash_view && !is_archive_view && on_archive && (
              <button
                className="p-1.5 rounded-md hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
                onClick={() => on_archive(email)}
              >
                <ArchiveBoxArrowDownIcon className="w-4 h-4 text-[var(--text-muted)]" />
              </button>
            )}

            {!is_trash_view && !is_spam_view && on_spam && (
              <button
                className="p-1.5 rounded-md hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
                onClick={() => on_spam(email)}
              >
                <ExclamationTriangleIcon className="w-4 h-4 text-[var(--text-muted)]" />
              </button>
            )}

            {on_delete && (
              <button
                className="p-1.5 rounded-md hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
                onClick={() => on_delete(email)}
              >
                <TrashIcon className="w-4 h-4 text-[var(--text-muted)]" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
});
