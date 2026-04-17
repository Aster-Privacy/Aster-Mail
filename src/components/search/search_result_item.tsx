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
import type { DecryptedContact } from "@/types/contacts";
import type { DecryptedFolder } from "@/hooks/use_folders";

import { useState, useMemo, forwardRef } from "react";
import { FolderIcon, UserIcon } from "@heroicons/react/24/outline";

import { ProfileAvatar } from "@/components/ui/profile_avatar";
import { strip_html_tags } from "@/lib/html_sanitizer";
import { format_relative_time } from "@/utils/date_utils";
import { use_i18n } from "@/lib/i18n/context";
import {
  type SearchResultItem,
  type TextHighlight,
  compute_highlight_ranges,
  apply_highlights,
} from "@/hooks/use_search";

export interface QuickActionHandlers {
  on_archive?: (result: SearchResultItem) => void;
  on_delete?: (result: SearchResultItem) => void;
  on_toggle_star?: (result: SearchResultItem) => void;
  on_toggle_read?: (result: SearchResultItem) => void;
}

export function HighlightedText({
  text,
  highlights,
}: {
  text: string;
  highlights: TextHighlight[];
}) {
  if (highlights.length === 0) {
    return <span>{text}</span>;
  }

  return (
    <>
      {highlights.map((segment, idx) =>
        segment.is_match ? (
          <mark key={idx} className="rounded px-0.5 bg-brand text-white">
            {segment.text}
          </mark>
        ) : (
          <span key={idx}>{segment.text}</span>
        ),
      )}
    </>
  );
}

export function ContactResultRow({
  contact,
  on_click,
  on_profile_click,
  search_query,
}: {
  contact: DecryptedContact;
  on_click: () => void;
  on_profile_click: () => void;
  search_query?: string;
}) {
  const { t } = use_i18n();
  const display_name =
    `${contact.first_name} ${contact.last_name}`.trim() || t("common.unknown");
  const primary_email = contact.emails?.[0] || "";

  const get_match_context = () => {
    if (!search_query || search_query.length < 2) return null;
    const q = search_query.toLowerCase();
    const name_lower = display_name.toLowerCase();
    const email_lower = primary_email.toLowerCase();

    if (name_lower.includes(q) || email_lower.includes(q)) return null;

    if (contact.company?.toLowerCase().includes(q)) {
      return contact.company;
    }
    if (contact.job_title?.toLowerCase().includes(q)) {
      return contact.job_title;
    }
    if (contact.phone?.toLowerCase().includes(q)) {
      return contact.phone;
    }
    if (contact.address?.city?.toLowerCase().includes(q)) {
      return contact.address.city;
    }
    if (contact.address?.country?.toLowerCase().includes(q)) {
      return contact.address.country;
    }

    return null;
  };

  const match_context = get_match_context();

  return (
    <div
      className="group flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors cursor-pointer hover:bg-[var(--bg-hover)]"
      role="button"
      tabIndex={0}
      onClick={on_click}
      onKeyDown={(e: React.KeyboardEvent) => {
        if (e["key"] === "Enter" || e["key"] === " ") {
          e.preventDefault();
          on_click();
        }
      }}
    >
      <ProfileAvatar
        use_domain_logo
        email={primary_email}
        image_url={contact.avatar_url}
        name={display_name}
        size="sm"
      />
      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium block truncate text-txt-primary">
          {display_name}
        </span>
        <span className="text-xs block truncate text-txt-muted">
          {match_context
            ? `${primary_email} · ${match_context}`
            : primary_email}
        </span>
      </div>
      <button
        className="p-1.5 rounded-md opacity-0 group-hover:opacity-100 transition-opacity hover:bg-[var(--bg-tertiary)]"
        title={t("mail.view_contact_profile")}
        onClick={(e) => {
          e.stopPropagation();
          on_profile_click();
        }}
      >
        <UserIcon className="w-4 h-4 text-[var(--text-muted)]" />
      </button>
      <span className="text-[10px] px-1.5 py-0.5 rounded group-hover:hidden bg-surf-tertiary text-txt-muted">
        {t("mail.contact")}
      </span>
    </div>
  );
}

export function FolderResultRow({
  folder,
  on_click,
}: {
  folder: DecryptedFolder;
  on_click: () => void;
}) {
  const { t } = use_i18n();
  const [is_hovered, set_is_hovered] = useState(false);

  return (
    <button
      className="flex items-center gap-2.5 w-full px-3 py-2 text-left transition-colors rounded-md"
      style={{
        backgroundColor: is_hovered ? "var(--bg-hover)" : "transparent",
      }}
      onClick={on_click}
      onMouseEnter={() => set_is_hovered(true)}
      onMouseLeave={() => set_is_hovered(false)}
    >
      <FolderIcon
        className="w-4 h-4 flex-shrink-0"
        style={{ color: folder.color || "var(--text-secondary)" }}
      />
      <div className="flex-1 min-w-0">
        <span className="text-[13px] font-medium text-txt-primary">
          {folder.name}
        </span>
        {folder.item_count !== undefined && folder.item_count > 0 && (
          <span className="text-[11px] ml-2 text-txt-muted">
            {folder.item_count} item{folder.item_count !== 1 ? "s" : ""}
          </span>
        )}
      </div>
      <span className="text-[10px] text-txt-muted">{t("mail.folder")}</span>
    </button>
  );
}

export const SearchResultRow = forwardRef<
  HTMLButtonElement,
  {
    result: SearchResultItem;
    on_click: () => void;
    query_terms?: string[];
    quick_actions?: QuickActionHandlers;
  }
>(function SearchResultRow(
  { result, on_click, query_terms = [], quick_actions },
  ref,
) {
  const { t } = use_i18n();
  const [is_hovered, set_is_hovered] = useState(false);

  const preview_lines = useMemo(() => {
    const raw_preview = result.preview || "";
    const plain_text = strip_html_tags(raw_preview);
    const lines = plain_text
      .split(/\n/)
      .filter((l) => l.trim())
      .slice(0, 2);

    return lines.length > 0 ? lines.join(" ") : plain_text;
  }, [result.preview]);

  const subject_highlights = useMemo(() => {
    if (query_terms.length === 0 || !result.subject) return [];

    const ranges = compute_highlight_ranges(result.subject, query_terms);

    return apply_highlights(result.subject, ranges);
  }, [result.subject, query_terms]);

  const preview_highlights = useMemo(() => {
    if (query_terms.length === 0 || !preview_lines) return [];

    const ranges = compute_highlight_ranges(preview_lines, query_terms);

    return apply_highlights(preview_lines, ranges);
  }, [preview_lines, query_terms]);

  return (
    <button
      ref={ref}
      className="flex items-center gap-3 w-full px-3 py-2.5 text-left transition-all rounded-lg group"
      style={{
        backgroundColor: is_hovered ? "var(--bg-hover)" : "transparent",
      }}
      onClick={on_click}
      onMouseEnter={() => set_is_hovered(true)}
      onMouseLeave={() => set_is_hovered(false)}
    >
      <ProfileAvatar
        use_domain_logo
        email={result.sender_email}
        image_url={result.avatar_url}
        name={result.sender_name}
        size="sm"
      />
      <div className="flex-1 min-w-0 flex items-center gap-1.5">
        <span className="text-[13px] font-medium truncate text-txt-primary flex-shrink-0 max-w-[30%]">
          {result.sender_name}
        </span>
        <span className="text-[11px] text-txt-muted flex-shrink-0">·</span>
        <span
          className="text-[12px] truncate flex-shrink-0 max-w-[40%]"
          style={{
            color: result.is_read
              ? "var(--text-muted)"
              : "var(--text-secondary)",
            fontWeight: result.is_read ? 400 : 500,
          }}
        >
          {subject_highlights.length > 0 ? (
            <HighlightedText
              highlights={subject_highlights}
              text={result.subject}
            />
          ) : (
            result.subject
          )}
        </span>
        <span className="text-[11px] truncate flex-1 text-txt-muted">
          {preview_highlights.length > 0 ? (
            <HighlightedText
              highlights={preview_highlights}
              text={preview_lines}
            />
          ) : (
            preview_lines
          )}
        </span>
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0 relative">
        {quick_actions && is_hovered && (
          <div
            className="absolute right-0 top-0 bottom-0 w-36 pointer-events-none bg-gradient-to-r from-transparent to-[var(--bg-hover)]"
            style={{
              ["--tw-gradient-via-position" as string]: "30%",
              ["--tw-gradient-to-position" as string]: "100%",
            }}
          />
        )}
        {quick_actions && (
          <div
            className="flex items-center gap-0.5 absolute right-0 transition-opacity duration-75"
            style={{
              opacity: is_hovered ? 1 : 0,
              pointerEvents: is_hovered ? "auto" : "none",
            }}
          >
            <button
              className="p-1.5 rounded-md transition-colors hover:bg-black/10 dark:hover:bg-white/10 text-txt-muted"
              title={
                result.is_read
                  ? t("mail.mark_unread_title")
                  : t("mail.mark_read_title")
              }
              onClick={(e) => {
                e.stopPropagation();
                quick_actions.on_toggle_read?.(result);
              }}
            >
              <svg
                className="w-3.5 h-3.5"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                {result.is_read ? (
                  <path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z" />
                ) : (
                  <path d="M22 8.98V18c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2h10.1c-.06.32-.1.66-.1 1 0 1.48.65 2.79 1.67 3.71L12 11 4 6v2l8 5 5.3-3.32c.54.2 1.1.32 1.7.32 1.13 0 2.16-.39 3-1.02zM19 3c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z" />
                )}
              </svg>
            </button>
            <button
              className="p-1.5 rounded-md transition-colors hover:bg-black/10 dark:hover:bg-white/10"
              style={{
                color: result.is_starred
                  ? "var(--color-warning)"
                  : "var(--text-muted)",
              }}
              title={
                result.is_starred
                  ? t("mail.unstar_title")
                  : t("mail.star_title")
              }
              onClick={(e) => {
                e.stopPropagation();
                quick_actions.on_toggle_star?.(result);
              }}
            >
              <svg
                className="w-3.5 h-3.5"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
              </svg>
            </button>
            <button
              className="p-1.5 rounded-md transition-colors hover:bg-black/10 dark:hover:bg-white/10 text-txt-muted"
              title={t("mail.archive")}
              onClick={(e) => {
                e.stopPropagation();
                quick_actions.on_archive?.(result);
              }}
            >
              <svg
                className="w-3.5 h-3.5"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M20.54 5.23l-1.39-1.68C18.88 3.21 18.47 3 18 3H6c-.47 0-.88.21-1.16.55L3.46 5.23C3.17 5.57 3 6.02 3 6.5V19c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6.5c0-.48-.17-.93-.46-1.27zM12 17.5L6.5 12H10v-2h4v2h3.5L12 17.5zM5.12 5l.81-1h12l.94 1H5.12z" />
              </svg>
            </button>
            <button
              className="p-1.5 rounded-md transition-colors hover:bg-black/10 dark:hover:bg-white/10 text-txt-muted"
              title={t("common.delete")}
              onClick={(e) => {
                e.stopPropagation();
                quick_actions.on_delete?.(result);
              }}
            >
              <svg
                className="w-3.5 h-3.5"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
              </svg>
            </button>
          </div>
        )}
        <div
          className="flex items-center gap-1.5 transition-opacity duration-75"
          style={{
            opacity: is_hovered && quick_actions ? 0 : 1,
          }}
        >
          {result.is_starred && (
            <svg className="w-3 h-3" fill="#f59e0b" viewBox="0 0 24 24">
              <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
            </svg>
          )}
          {result.has_attachment && (
            <svg
              className="w-3 h-3 text-txt-muted"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M16.5 6v11.5c0 2.21-1.79 4-4 4s-4-1.79-4-4V5c0-1.38 1.12-2.5 2.5-2.5s2.5 1.12 2.5 2.5v10.5c0 .55-.45 1-1 1s-1-.45-1-1V6H10v9.5c0 1.38 1.12 2.5 2.5 2.5s2.5-1.12 2.5-2.5V5c0-2.21-1.79-4-4-4S7 2.79 7 5v12.5c0 3.04 2.46 5.5 5.5 5.5s5.5-2.46 5.5-5.5V6h-1.5z" />
            </svg>
          )}
          <span className="text-[10px] text-txt-muted">
            {format_relative_time(result.timestamp, t)}
          </span>
        </div>
      </div>
    </button>
  );
});
