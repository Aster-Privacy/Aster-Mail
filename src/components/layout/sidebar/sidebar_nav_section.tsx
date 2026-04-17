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
import type { RefObject } from "react";

import { memo } from "react";
import {
  InboxIcon,
  StarIcon,
  PaperAirplaneIcon,
  DocumentTextIcon,
  ClockIcon,
  BellSnoozeIcon,
  ArchiveBoxIcon,
  ExclamationTriangleIcon,
  TrashIcon,
  UsersIcon,
  EnvelopeIcon,
  EnvelopeOpenIcon,
  ChevronDownIcon,
  ChevronRightIcon,
} from "@heroicons/react/24/outline";

import { CountBadge } from "@/components/common/count_badge";
import { use_i18n } from "@/lib/i18n/context";

interface SidebarNavSectionProps {
  is_collapsed: boolean;
  effective_selected: string | null;
  stats: {
    inbox: number;
    unread: number;
    drafts: number;
    scheduled: number;
    snoozed: number;
    total_items: number;
    archived: number;
    spam: number;
    trash: number;
    contacts: number;
  };
  stats_loading?: boolean;
  section_collapsed: boolean;
  on_toggle_section: () => void;
  handle_nav_click: (callback: () => void) => void;
  set_selected_item: (item: string) => void;
  navigate: (path: string) => void;
  inbox_ref: RefObject<HTMLButtonElement>;
  sent_ref: RefObject<HTMLButtonElement>;
  scheduled_ref: RefObject<HTMLButtonElement>;
  snoozed_ref: RefObject<HTMLButtonElement>;
  drafts_ref: RefObject<HTMLButtonElement>;
  starred_ref: RefObject<HTMLButtonElement>;
  all_mail_ref: RefObject<HTMLButtonElement>;
  archive_ref: RefObject<HTMLButtonElement>;
  spam_ref: RefObject<HTMLButtonElement>;
  trash_ref: RefObject<HTMLButtonElement>;
  contacts_ref: RefObject<HTMLButtonElement>;
  subscriptions_ref: RefObject<HTMLButtonElement>;
}

export const SidebarNavSection = memo(function SidebarNavSection({
  is_collapsed,
  effective_selected,
  stats,
  stats_loading = false,
  section_collapsed,
  on_toggle_section,
  handle_nav_click,
  set_selected_item,
  navigate,
  inbox_ref,
  sent_ref,
  scheduled_ref,
  snoozed_ref,
  drafts_ref,
  starred_ref,
  all_mail_ref,
  archive_ref,
  spam_ref,
  trash_ref,
  contacts_ref,
  subscriptions_ref,
}: SidebarNavSectionProps) {
  const { t } = use_i18n();

  return (
    <>
      {!is_collapsed && (
        <div className="mb-1 px-2.5">
          <span className="text-[10px] font-semibold uppercase tracking-[0.05em] text-txt-muted opacity-70">
            {t("common.mail")}
          </span>
        </div>
      )}

      <button
        ref={inbox_ref}
        className={`sidebar-nav-btn group relative w-full flex items-center ${is_collapsed ? "justify-center" : "gap-2.5"} rounded-md ${is_collapsed ? "px-0" : "px-2.5"} h-8 text-[14px]  ${effective_selected === "inbox" ? "sidebar-active" : ""} ${is_collapsed && effective_selected === "inbox" ? "sidebar-selected" : ""}`}
        style={{
          zIndex: 1,
          color:
            effective_selected === "inbox"
              ? "var(--text-primary)"
              : "var(--text-secondary)",
          backgroundColor:
            is_collapsed && effective_selected === "inbox"
              ? "var(--indicator-bg)"
              : undefined,
        }}
        title={is_collapsed ? t("mail.inbox") : undefined}
        onClick={() =>
          handle_nav_click(() => {
            set_selected_item("inbox");
            navigate("/");
          })
        }
      >
        <InboxIcon
          className={`${is_collapsed ? "w-5 h-5" : "w-4 h-4"} `}
          style={{
            color:
              effective_selected === "inbox"
                ? "var(--text-primary)"
                : "var(--text-muted)",
          }}
        />
        {!is_collapsed && (
          <>
            <span className="flex-1 text-left">{t("mail.inbox")}</span>
            <CountBadge
              count={stats.unread}
              is_active={effective_selected === "inbox"}
              is_loading={stats_loading}
            />
          </>
        )}
      </button>

      <button
        ref={sent_ref}
        className={`sidebar-nav-btn group relative w-full flex items-center ${is_collapsed ? "justify-center" : "gap-2.5"} rounded-md ${is_collapsed ? "px-0" : "px-2.5"} h-8 text-[14px]  ${effective_selected === "sent" ? "sidebar-active" : ""} ${is_collapsed && effective_selected === "sent" ? "sidebar-selected" : ""}`}
        style={{
          zIndex: 1,
          color:
            effective_selected === "sent"
              ? "var(--text-primary)"
              : "var(--text-secondary)",
          backgroundColor:
            is_collapsed && effective_selected === "sent"
              ? "var(--indicator-bg)"
              : undefined,
        }}
        title={is_collapsed ? t("mail.sent") : undefined}
        onClick={() =>
          handle_nav_click(() => {
            set_selected_item("sent");
            navigate("/sent");
          })
        }
      >
        <PaperAirplaneIcon
          className={`${is_collapsed ? "w-5 h-5" : "w-4 h-4"} `}
          style={{
            color:
              effective_selected === "sent"
                ? "var(--text-primary)"
                : "var(--text-muted)",
          }}
        />
        {!is_collapsed && (
          <span className="flex-1 text-left">{t("mail.sent")}</span>
        )}
      </button>

      <button
        ref={scheduled_ref}
        className={`sidebar-nav-btn group relative w-full flex items-center ${is_collapsed ? "justify-center" : "gap-2.5"} rounded-md ${is_collapsed ? "px-0" : "px-2.5"} h-8 text-[14px]  ${effective_selected === "scheduled" ? "sidebar-active" : ""} ${is_collapsed && effective_selected === "scheduled" ? "sidebar-selected" : ""}`}
        style={{
          zIndex: 1,
          color:
            effective_selected === "scheduled"
              ? "var(--text-primary)"
              : "var(--text-secondary)",
          backgroundColor:
            is_collapsed && effective_selected === "scheduled"
              ? "var(--indicator-bg)"
              : undefined,
        }}
        title={is_collapsed ? t("mail.scheduled") : undefined}
        onClick={() =>
          handle_nav_click(() => {
            set_selected_item("scheduled");
            navigate("/scheduled");
          })
        }
      >
        <ClockIcon
          className={`${is_collapsed ? "w-5 h-5" : "w-4 h-4"} `}
          style={{
            color:
              effective_selected === "scheduled"
                ? "var(--text-primary)"
                : "var(--text-muted)",
          }}
        />
        {!is_collapsed && (
          <>
            <span className="flex-1 text-left">{t("mail.scheduled")}</span>
            <CountBadge
              count={stats.scheduled}
              is_active={effective_selected === "scheduled"}
              is_loading={stats_loading}
            />
          </>
        )}
      </button>

      <button
        ref={snoozed_ref}
        className={`sidebar-nav-btn group relative w-full flex items-center ${is_collapsed ? "justify-center" : "gap-2.5"} rounded-md ${is_collapsed ? "px-0" : "px-2.5"} h-8 text-[14px]  ${effective_selected === "snoozed" ? "sidebar-active" : ""} ${is_collapsed && effective_selected === "snoozed" ? "sidebar-selected" : ""}`}
        style={{
          zIndex: 1,
          color:
            effective_selected === "snoozed"
              ? "var(--text-primary)"
              : "var(--text-secondary)",
          backgroundColor:
            is_collapsed && effective_selected === "snoozed"
              ? "var(--indicator-bg)"
              : undefined,
        }}
        title={is_collapsed ? t("mail.snoozed") : undefined}
        onClick={() =>
          handle_nav_click(() => {
            set_selected_item("snoozed");
            navigate("/snoozed");
          })
        }
      >
        <BellSnoozeIcon
          className={`${is_collapsed ? "w-5 h-5" : "w-4 h-4"} `}
          style={{
            color:
              effective_selected === "snoozed"
                ? "var(--text-primary)"
                : "var(--text-muted)",
          }}
        />
        {!is_collapsed && (
          <>
            <span className="flex-1 text-left">{t("mail.snoozed")}</span>
            <CountBadge
              count={stats.snoozed}
              is_active={effective_selected === "snoozed"}
              is_loading={stats_loading}
            />
          </>
        )}
      </button>

      <button
        ref={drafts_ref}
        className={`sidebar-nav-btn group relative w-full flex items-center ${is_collapsed ? "justify-center" : "gap-2.5"} rounded-md ${is_collapsed ? "px-0" : "px-2.5"} h-8 text-[14px]  ${effective_selected === "drafts" ? "sidebar-active" : ""} ${is_collapsed && effective_selected === "drafts" ? "sidebar-selected" : ""}`}
        style={{
          zIndex: 1,
          color:
            effective_selected === "drafts"
              ? "var(--text-primary)"
              : "var(--text-secondary)",
          backgroundColor:
            is_collapsed && effective_selected === "drafts"
              ? "var(--indicator-bg)"
              : undefined,
        }}
        title={is_collapsed ? t("mail.drafts") : undefined}
        onClick={() =>
          handle_nav_click(() => {
            set_selected_item("drafts");
            navigate("/drafts");
          })
        }
      >
        <DocumentTextIcon
          className={`${is_collapsed ? "w-5 h-5" : "w-4 h-4"} `}
          style={{
            color:
              effective_selected === "drafts"
                ? "var(--text-primary)"
                : "var(--text-muted)",
          }}
        />
        {!is_collapsed && (
          <>
            <span className="flex-1 text-left">{t("mail.drafts")}</span>
            <CountBadge
              count={stats.drafts}
              is_active={effective_selected === "drafts"}
              is_loading={stats_loading}
            />
          </>
        )}
      </button>

      {!is_collapsed && (
        <div className="mt-5 mb-1 px-2.5">
          <button
            className="w-full flex items-center gap-1 py-1 text-txt-muted opacity-70 hover:opacity-100"
            onClick={on_toggle_section}
          >
            {section_collapsed ? (
              <ChevronRightIcon className="w-3 h-3" />
            ) : (
              <ChevronDownIcon className="w-3 h-3" />
            )}
            <span className="text-[10px] font-semibold uppercase tracking-[0.05em]">
              {t("common.more")}
            </span>
          </button>
        </div>
      )}

      {is_collapsed && <div className="mt-3" />}

      {(!section_collapsed || is_collapsed) && (
        <>
          <button
            ref={starred_ref}
            className={`sidebar-nav-btn group relative w-full flex items-center ${is_collapsed ? "justify-center" : "gap-2.5"} rounded-md ${is_collapsed ? "px-0" : "px-2.5"} h-8 text-[14px]  ${effective_selected === "starred" ? "sidebar-active" : ""} ${is_collapsed && effective_selected === "starred" ? "sidebar-selected" : ""}`}
            style={{
              zIndex: 1,
              color:
                effective_selected === "starred"
                  ? "var(--text-primary)"
                  : "var(--text-secondary)",
              backgroundColor:
                is_collapsed && effective_selected === "starred"
                  ? "var(--indicator-bg)"
                  : undefined,
            }}
            title={is_collapsed ? t("mail.starred") : undefined}
            onClick={() =>
              handle_nav_click(() => {
                set_selected_item("starred");
                navigate("/starred");
              })
            }
          >
            <StarIcon
              className={`${is_collapsed ? "w-5 h-5" : "w-4 h-4"} `}
              style={{
                color:
                  effective_selected === "starred"
                    ? "var(--text-primary)"
                    : "var(--text-muted)",
              }}
            />
            {!is_collapsed && (
              <span className="flex-1 text-left">{t("mail.starred")}</span>
            )}
          </button>

          <button
            ref={all_mail_ref}
            className={`sidebar-nav-btn group relative w-full flex items-center ${is_collapsed ? "justify-center" : "gap-2.5"} rounded-md ${is_collapsed ? "px-0" : "px-2.5"} h-8 text-[14px]  ${effective_selected === "all" ? "sidebar-active" : ""} ${is_collapsed && effective_selected === "all" ? "sidebar-selected" : ""}`}
            style={{
              zIndex: 1,
              color:
                effective_selected === "all"
                  ? "var(--text-primary)"
                  : "var(--text-secondary)",
              backgroundColor:
                is_collapsed && effective_selected === "all"
                  ? "var(--indicator-bg)"
                  : undefined,
            }}
            title={is_collapsed ? t("mail.all_mail") : undefined}
            onClick={() =>
              handle_nav_click(() => {
                set_selected_item("all");
                navigate("/all");
              })
            }
          >
            <EnvelopeIcon
              className={`${is_collapsed ? "w-5 h-5" : "w-4 h-4"} `}
              style={{
                color:
                  effective_selected === "all"
                    ? "var(--text-primary)"
                    : "var(--text-muted)",
              }}
            />
            {!is_collapsed && (
              <span className="flex-1 text-left">{t("mail.all_mail")}</span>
            )}
          </button>

          <button
            ref={archive_ref}
            className={`sidebar-nav-btn group relative w-full flex items-center ${is_collapsed ? "justify-center" : "gap-2.5"} rounded-md ${is_collapsed ? "px-0" : "px-2.5"} h-8 text-[14px]  ${effective_selected === "archive" ? "sidebar-active" : ""} ${is_collapsed && effective_selected === "archive" ? "sidebar-selected" : ""}`}
            style={{
              zIndex: 1,
              color:
                effective_selected === "archive"
                  ? "var(--text-primary)"
                  : "var(--text-secondary)",
              backgroundColor:
                is_collapsed && effective_selected === "archive"
                  ? "var(--indicator-bg)"
                  : undefined,
            }}
            title={is_collapsed ? t("mail.archive") : undefined}
            onClick={() =>
              handle_nav_click(() => {
                set_selected_item("archive");
                navigate("/archive");
              })
            }
          >
            <ArchiveBoxIcon
              className={`${is_collapsed ? "w-5 h-5" : "w-4 h-4"} `}
              style={{
                color:
                  effective_selected === "archive"
                    ? "var(--text-primary)"
                    : "var(--text-muted)",
              }}
            />
            {!is_collapsed && (
              <span className="flex-1 text-left">{t("mail.archive")}</span>
            )}
          </button>

          <button
            ref={spam_ref}
            className={`sidebar-nav-btn group relative w-full flex items-center ${is_collapsed ? "justify-center" : "gap-2.5"} rounded-md ${is_collapsed ? "px-0" : "px-2.5"} h-8 text-[14px]  ${effective_selected === "spam" ? "sidebar-active" : ""} ${is_collapsed && effective_selected === "spam" ? "sidebar-selected" : ""}`}
            style={{
              zIndex: 1,
              color:
                effective_selected === "spam"
                  ? "var(--text-primary)"
                  : "var(--text-secondary)",
              backgroundColor:
                is_collapsed && effective_selected === "spam"
                  ? "var(--indicator-bg)"
                  : undefined,
            }}
            title={is_collapsed ? t("mail.spam") : undefined}
            onClick={() =>
              handle_nav_click(() => {
                set_selected_item("spam");
                navigate("/spam");
              })
            }
          >
            <ExclamationTriangleIcon
              className={`${is_collapsed ? "w-5 h-5" : "w-4 h-4"} `}
              style={{
                color:
                  effective_selected === "spam"
                    ? "var(--text-primary)"
                    : "var(--text-muted)",
              }}
            />
            {!is_collapsed && (
              <>
                <span className="flex-1 text-left">{t("mail.spam")}</span>
                <CountBadge
                  count={stats.spam}
                  is_active={effective_selected === "spam"}
                  is_loading={stats_loading}
                />
              </>
            )}
          </button>

          <button
            ref={trash_ref}
            className={`sidebar-nav-btn group relative w-full flex items-center ${is_collapsed ? "justify-center" : "gap-2.5"} rounded-md ${is_collapsed ? "px-0" : "px-2.5"} h-8 text-[14px]  ${effective_selected === "trash" ? "sidebar-active" : ""} ${is_collapsed && effective_selected === "trash" ? "sidebar-selected" : ""}`}
            style={{
              zIndex: 1,
              color:
                effective_selected === "trash"
                  ? "var(--text-primary)"
                  : "var(--text-secondary)",
              backgroundColor:
                is_collapsed && effective_selected === "trash"
                  ? "var(--indicator-bg)"
                  : undefined,
            }}
            title={is_collapsed ? t("mail.trash") : undefined}
            onClick={() =>
              handle_nav_click(() => {
                set_selected_item("trash");
                navigate("/trash");
              })
            }
          >
            <TrashIcon
              className={`${is_collapsed ? "w-5 h-5" : "w-4 h-4"} `}
              style={{
                color:
                  effective_selected === "trash"
                    ? "var(--text-primary)"
                    : "var(--text-muted)",
              }}
            />
            {!is_collapsed && (
              <>
                <span className="flex-1 text-left">{t("mail.trash")}</span>
                <CountBadge
                  count={stats.trash}
                  is_active={effective_selected === "trash"}
                  is_loading={stats_loading}
                />
              </>
            )}
          </button>

          <button
            ref={contacts_ref}
            className={`sidebar-nav-btn group relative w-full flex items-center ${is_collapsed ? "justify-center" : "gap-2.5"} rounded-md ${is_collapsed ? "px-0" : "px-2.5"} h-8 text-[14px]  ${effective_selected === "contacts" ? "sidebar-active" : ""} ${is_collapsed && effective_selected === "contacts" ? "sidebar-selected" : ""}`}
            style={{
              zIndex: 1,
              color:
                effective_selected === "contacts"
                  ? "var(--text-primary)"
                  : "var(--text-secondary)",
              backgroundColor:
                is_collapsed && effective_selected === "contacts"
                  ? "var(--indicator-bg)"
                  : undefined,
            }}
            title={is_collapsed ? t("common.contacts") : undefined}
            onClick={() =>
              handle_nav_click(() => {
                set_selected_item("contacts");
                navigate("/contacts");
              })
            }
          >
            <UsersIcon
              className={`${is_collapsed ? "w-5 h-5" : "w-4 h-4"} `}
              style={{
                color:
                  effective_selected === "contacts"
                    ? "var(--text-primary)"
                    : "var(--text-muted)",
              }}
            />
            {!is_collapsed && (
              <span className="flex-1 text-left">{t("common.contacts")}</span>
            )}
          </button>

          <button
            ref={subscriptions_ref}
            className={`sidebar-nav-btn group relative w-full flex items-center ${is_collapsed ? "justify-center" : "gap-2.5"} rounded-md ${is_collapsed ? "px-0" : "px-2.5"} h-8 text-[14px]  ${effective_selected === "subscriptions" ? "sidebar-active" : ""} ${is_collapsed && effective_selected === "subscriptions" ? "sidebar-selected" : ""}`}
            style={{
              zIndex: 1,
              color:
                effective_selected === "subscriptions"
                  ? "var(--text-primary)"
                  : "var(--text-secondary)",
              backgroundColor:
                is_collapsed && effective_selected === "subscriptions"
                  ? "var(--indicator-bg)"
                  : undefined,
            }}
            title={is_collapsed ? t("common.subscriptions") : undefined}
            onClick={() =>
              handle_nav_click(() => {
                set_selected_item("subscriptions");
                navigate("/subscriptions");
              })
            }
          >
            <EnvelopeOpenIcon
              className={`${is_collapsed ? "w-5 h-5" : "w-4 h-4"} `}
              style={{
                color:
                  effective_selected === "subscriptions"
                    ? "var(--text-primary)"
                    : "var(--text-muted)",
              }}
            />
            {!is_collapsed && (
              <span className="flex-1 text-left">
                {t("common.subscriptions")}
              </span>
            )}
          </button>
        </>
      )}
    </>
  );
});
