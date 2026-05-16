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
import type { DecryptedContact } from "@/types/contacts";

import { motion, AnimatePresence } from "framer-motion";
import {
  MagnifyingGlassIcon,
  UsersIcon,
  PlusIcon,
  StarIcon as StarOutline,
  XMarkIcon,
  EnvelopeIcon,
  ClipboardIcon,
  TrashIcon,
  ChevronRightIcon,
  ArrowPathIcon,
} from "@heroicons/react/24/outline";
import {
  StarIcon as StarSolid,
  CheckCircleIcon,
} from "@heroicons/react/24/solid";
import { Capacitor } from "@capacitor/core";

import { use_i18n } from "@/lib/i18n/context";
import { use_should_reduce_motion } from "@/provider";
import { MobileHeader } from "@/components/mobile/mobile_header";
import { ProfileAvatar } from "@/components/ui/profile_avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";

interface MobileContactListProps {
  contacts: DecryptedContact[];
  filtered_contacts: DecryptedContact[];
  grouped: [string, DecryptedContact[]][];
  is_loading: boolean;
  search_query: string;
  set_search_query: (v: string) => void;
  filter: "all" | "favorites";
  set_filter: (v: "all" | "favorites") => void;
  favorites_count: number;
  is_select_mode: boolean;
  set_is_select_mode: (v: boolean) => void;
  selected_ids: Set<string>;
  is_syncing: boolean;
  on_open_drawer: () => void;
  on_open_create: () => void;
  on_show_sync_confirm: () => void;
  on_contact_press: (contact: DecryptedContact) => void;
  on_long_press_start: (id: string) => void;
  on_long_press_end: () => void;
  toggle_select: (id: string) => void;
  select_all: () => void;
  deselect_all: () => void;
  exit_select_mode: () => void;
  on_mass_email: () => void;
  on_mass_favorite: () => void;
  on_mass_copy_emails: () => void;
  on_show_delete_confirm: () => void;
}

export function MobileContactList({
  contacts,
  filtered_contacts,
  grouped,
  is_loading,
  search_query,
  set_search_query,
  filter,
  set_filter,
  favorites_count,
  is_select_mode,
  set_is_select_mode,
  selected_ids,
  is_syncing,
  on_open_drawer,
  on_open_create,
  on_show_sync_confirm,
  on_contact_press,
  on_long_press_start,
  on_long_press_end,
  toggle_select,
  select_all,
  deselect_all,
  exit_select_mode,
  on_mass_email,
  on_mass_favorite,
  on_mass_copy_emails,
  on_show_delete_confirm,
}: MobileContactListProps) {
  const { t } = use_i18n();
  const reduce_motion = use_should_reduce_motion();

  return (
    <>
      {is_select_mode ? (
        <div className="flex items-center gap-2 border-b border-[var(--border-primary)] px-3 py-2 safe-area-pt">
          <button
            className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--text-secondary)] active:bg-[var(--bg-tertiary)]"
            type="button"
            onClick={exit_select_mode}
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
          <span className="flex-1 text-[16px] font-semibold text-[var(--text-primary)]">
            {t("common.selected_count", { count: selected_ids.size })}
          </span>
          <button
            className="rounded-[12px] px-3 py-1.5 text-[13px] font-medium text-[var(--accent-color,#3b82f6)] active:opacity-70"
            type="button"
            onClick={
              selected_ids.size === filtered_contacts.length
                ? deselect_all
                : select_all
            }
          >
            {selected_ids.size === filtered_contacts.length
              ? t("common.deselect_all")
              : t("common.select_all")}
          </button>
        </div>
      ) : (
        <MobileHeader
          on_menu={on_open_drawer}
          right_actions={
            <div className="flex items-center gap-2">
              {contacts.length > 0 && (
                <button
                  className="rounded-[12px] px-3 py-1.5 text-[13px] font-medium text-[var(--text-secondary)] active:opacity-70"
                  type="button"
                  onClick={() => set_is_select_mode(true)}
                >
                  {t("common.select_all")}
                </button>
              )}
              {Capacitor.isNativePlatform() && (
                <button
                  className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--text-secondary)] active:bg-[var(--bg-tertiary)] disabled:opacity-40"
                  disabled={is_syncing}
                  type="button"
                  onClick={on_show_sync_confirm}
                >
                  <ArrowPathIcon
                    className={`h-4.5 w-4.5 ${is_syncing ? "animate-spin" : ""}`}
                    strokeWidth={2}
                  />
                </button>
              )}
              <button
                className="flex h-8 w-8 items-center justify-center rounded-full text-white active:brightness-90"
                style={{
                  background:
                    "linear-gradient(to bottom, #6b8aff 0%, #4f6ef7 50%, #3b5ae8 100%)",
                  border: "1px solid rgba(255, 255, 255, 0.15)",
                  borderBottom: "1px solid rgba(0, 0, 0, 0.15)",
                  boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
                }}
                type="button"
                onClick={on_open_create}
              >
                <PlusIcon className="h-4.5 w-4.5" strokeWidth={2.5} />
              </button>
            </div>
          }
          title={t("common.contacts")}
        />
      )}

      <div className="px-4 py-2">
        <div className="flex items-center gap-2 rounded-xl bg-[var(--bg-tertiary)] px-3 py-2">
          <MagnifyingGlassIcon className="h-4.5 w-4.5 shrink-0 text-[var(--text-muted)]" />
          <Input
            className="min-w-0 flex-1 bg-transparent"
            placeholder={t("common.search_contacts")}
            type="text"
            value={search_query}
            onChange={(e) => set_search_query(e.target.value)}
          />
          {search_query && (
            <button
              className="shrink-0 text-[var(--text-muted)]"
              type="button"
              onClick={() => set_search_query("")}
            >
              <XMarkIcon className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <div className="flex gap-2 px-4 pb-2">
        <button
          className={`rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors ${
            filter === "all"
              ? "text-white"
              : "bg-[var(--bg-tertiary)] text-[var(--text-secondary)]"
          }`}
          style={
            filter === "all"
              ? {
                  background:
                    "linear-gradient(to bottom, #6b8aff 0%, #4f6ef7 50%, #3b5ae8 100%)",
                  border: "1px solid rgba(255, 255, 255, 0.15)",
                  borderBottom: "1px solid rgba(0, 0, 0, 0.15)",
                  boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
                }
              : undefined
          }
          type="button"
          onClick={() => set_filter("all")}
        >
          {t("common.contacts")} ({contacts.length})
        </button>
        {favorites_count > 0 && (
          <button
            className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors ${
              filter === "favorites"
                ? "text-white"
                : "bg-[var(--bg-tertiary)] text-[var(--text-secondary)]"
            }`}
            style={
              filter === "favorites"
                ? {
                    background:
                      "linear-gradient(to bottom, #6b8aff 0%, #4f6ef7 50%, #3b5ae8 100%)",
                    border: "1px solid rgba(255, 255, 255, 0.15)",
                    borderBottom: "1px solid rgba(0, 0, 0, 0.15)",
                    boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
                  }
                : undefined
            }
            type="button"
            onClick={() => set_filter("favorites")}
          >
            {filter === "favorites" ? (
              <StarSolid className="h-3.5 w-3.5" />
            ) : (
              <StarOutline className="h-3.5 w-3.5" />
            )}
            {t("common.favorites")} ({favorites_count})
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {is_loading && (
          <div className="space-y-1 px-4 pt-2">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 py-2.5">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-2/3 rounded" />
                  <Skeleton className="h-3 w-1/2 rounded" />
                </div>
              </div>
            ))}
          </div>
        )}

        {!is_loading && filtered_contacts.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-3 px-8 pt-20">
            <UsersIcon
              className="h-14 w-14 text-[var(--text-muted)]"
              strokeWidth={1}
            />
            <p className="text-center text-[15px] font-medium text-[var(--text-primary)]">
              {search_query ? t("common.no_results") : t("common.no_contacts")}
            </p>
          </div>
        )}

        {!is_loading &&
          grouped.map(([letter, group_contacts]) => (
            <div key={letter}>
              <div className="sticky top-0 z-10 bg-[var(--bg-primary)] px-4 py-1">
                <span className="text-[12px] font-semibold text-[var(--text-muted)]">
                  {letter}
                </span>
              </div>
              {group_contacts.map((contact) => {
                const display_name =
                  [contact.first_name, contact.last_name]
                    .filter(Boolean)
                    .join(" ") ||
                  contact.emails[0] ||
                  "";
                const primary_email = contact.emails[0] ?? "";
                const subtitle = contact.company
                  ? contact.job_title
                    ? `${contact.job_title} · ${contact.company}`
                    : contact.company
                  : primary_email;

                const is_selected = selected_ids.has(contact.id);

                return (
                  <button
                    key={contact.id}
                    className={`flex w-full items-center gap-3 px-4 py-2.5 text-left active:bg-[var(--bg-tertiary)] ${is_select_mode && is_selected ? "bg-[var(--bg-selected,rgba(59,130,246,0.08))]" : ""}`}
                    type="button"
                    onClick={() => {
                      if (is_select_mode) {
                        toggle_select(contact.id);
                      } else {
                        on_contact_press(contact);
                      }
                    }}
                    onContextMenu={(e) => e.preventDefault()}
                    onTouchCancel={on_long_press_end}
                    onTouchEnd={on_long_press_end}
                    onTouchStart={() => on_long_press_start(contact.id)}
                  >
                    {is_select_mode ? (
                      <div className="h-10 w-10 shrink-0 flex items-center justify-center">
                        {is_selected ? (
                          <CheckCircleIcon className="h-6 w-6 text-[var(--accent-color,#3b82f6)]" />
                        ) : (
                          <div className="h-6 w-6 rounded-full border-2 border-[var(--border-secondary)]" />
                        )}
                      </div>
                    ) : (
                      <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full">
                        <ProfileAvatar
                          use_domain_logo
                          email={primary_email}
                          name={display_name}
                          size="md"
                        />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <p className="truncate text-[15px] font-medium text-[var(--text-primary)]">
                          {display_name}
                        </p>
                        {contact.is_favorite && (
                          <StarSolid className="h-3.5 w-3.5 shrink-0 text-amber-400" />
                        )}
                      </div>
                      {subtitle && (
                        <p className="truncate text-[13px] text-[var(--text-muted)]">
                          {subtitle}
                        </p>
                      )}
                    </div>
                    {!is_select_mode && (
                      <ChevronRightIcon className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
                    )}
                  </button>
                );
              })}
            </div>
          ))}
      </div>

      <AnimatePresence>
        {is_select_mode && selected_ids.size > 0 && (
          <motion.div
            animate={{ y: 0, opacity: 1 }}
            className="border-t border-[var(--border-primary)] bg-[var(--bg-primary)] px-4 py-3 safe-area-pb"
            exit={{ y: 80, opacity: 0 }}
            initial={{ y: 80, opacity: 0 }}
            transition={
              reduce_motion ? { duration: 0 } : { type: "tween", duration: 0.2 }
            }
          >
            <div className="flex items-center justify-around">
              <button
                className="flex flex-col items-center gap-1"
                type="button"
                onClick={on_mass_email}
              >
                <EnvelopeIcon className="h-5 w-5 text-[var(--text-secondary)]" />
                <span className="text-[11px] font-medium text-[var(--text-muted)]">
                  {t("common.email_section")}
                </span>
              </button>
              <button
                className="flex flex-col items-center gap-1"
                type="button"
                onClick={on_mass_favorite}
              >
                <StarOutline className="h-5 w-5 text-[var(--text-secondary)]" />
                <span className="text-[11px] font-medium text-[var(--text-muted)]">
                  {t("common.favorite")}
                </span>
              </button>
              <button
                className="flex flex-col items-center gap-1"
                type="button"
                onClick={on_mass_copy_emails}
              >
                <ClipboardIcon className="h-5 w-5 text-[var(--text-secondary)]" />
                <span className="text-[11px] font-medium text-[var(--text-muted)]">
                  {t("common.copy")}
                </span>
              </button>
              <button
                className="flex flex-col items-center gap-1"
                type="button"
                onClick={on_show_delete_confirm}
              >
                <TrashIcon className="h-5 w-5 text-red-500" />
                <span className="text-[11px] font-medium text-red-500">
                  {t("common.delete")}
                </span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
