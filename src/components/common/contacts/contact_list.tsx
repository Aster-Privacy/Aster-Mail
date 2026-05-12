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
import type { TranslationKey } from "@/lib/i18n";
import type { RefObject } from "react";
import type {
  SortOption,
  FilterOption,
  ViewMode,
} from "@/components/common/hooks/use_contacts_state";

import {
  MagnifyingGlassIcon,
  PlusIcon,
  XMarkIcon,
  ArrowUpTrayIcon,
  UserPlusIcon,
  CheckIcon,
  StarIcon,
  ClipboardDocumentIcon,
  ArrowDownTrayIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { StarIcon as StarIconSolid } from "@heroicons/react/24/solid";
import { Button } from "@aster/ui";
import { Switch } from "@aster/ui";

import { Skeleton } from "@/components/ui/skeleton";
import { MobileMenuButton } from "@/components/layout/sidebar";
import { use_preferences } from "@/contexts/preferences_context";
import { EncryptionInfoDropdown } from "@/components/common/encryption_info_dropdown";
import { ContactAvatar } from "@/components/common/contacts/contact_avatar";
import { cn } from "@/lib/utils";

interface ContactListProps {
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
  contacts: DecryptedContact[];
  filtered_contacts: DecryptedContact[];
  search_query: string;
  set_search_query: (query: string) => void;
  selected_contact: DecryptedContact | null;
  set_selected_contact: (contact: DecryptedContact | null) => void;
  selected_ids: Set<string>;
  is_loading: boolean;
  is_importing: boolean;
  import_progress: { current: number; total: number } | null;
  error: string | null;
  view_mode: ViewMode;
  set_view_mode: (mode: ViewMode) => void;
  sort_by: SortOption;
  set_sort_by: (sort: SortOption) => void;
  filter_by: FilterOption;
  set_filter_by: (filter: FilterOption) => void;
  filter_label: string;
  sort_label: string;
  focused_index: number;
  copied_field: string | null;
  selection_state: {
    selected_count: number;
    all_selected: boolean;
    some_selected: boolean;
  };
  has_selection: boolean;
  selected_all_favorited: boolean;
  alphabetical_index: Map<string, number>;
  upcoming_birthdays_count: number;
  search_input_ref: RefObject<HTMLInputElement>;
  list_container_ref: RefObject<HTMLDivElement>;
  contact_refs: RefObject<Map<string, HTMLDivElement>>;
  on_mobile_menu_toggle: () => void;
  on_add_click: () => void;
  on_import_modal_open: () => void;
  on_toggle_select: (id: string) => void;
  on_compose_to_selected: () => void;
  on_toggle_favorite_selected: () => void;
  on_copy_emails: () => void;
  on_export_contacts: (export_selected: boolean) => void;
  on_delete_selected: () => void;
  on_compose_email: (email: string) => void;
  on_copy: (text: string, field: string) => void;
  on_scroll_to_letter: (letter: string) => void;
}

export function ContactList({
  t,
  contacts,
  filtered_contacts,
  search_query,
  set_search_query,
  selected_contact,
  set_selected_contact,
  selected_ids,
  selection_state,
  has_selection,
  selected_all_favorited,
  is_loading,
  is_importing,
  import_progress,
  error,
  search_input_ref,
  list_container_ref,
  contact_refs,
  on_mobile_menu_toggle,
  on_add_click,
  on_import_modal_open,
  on_toggle_select,
  on_toggle_favorite_selected,
  on_copy_emails,
  on_export_contacts,
  on_delete_selected,
}: ContactListProps) {
  const { preferences, update_preference } = use_preferences();
  const auto_save = !!preferences.auto_save_recent_recipients;

  return (
    <div className="w-full md:w-1/2 md:flex-shrink-0 md:min-w-0 md:border-r md:border-edge-primary min-h-0 flex flex-col">
      <div className="flex items-center gap-2 px-4 pt-4 pb-2">
        <div className="md:hidden">
          <MobileMenuButton on_click={on_mobile_menu_toggle} />
        </div>
        <h1 className="text-[20px] font-semibold text-txt-primary">
          {t("common.contacts")}
        </h1>
        {!is_loading && contacts.length > 0 && (
          <span className="text-[20px] tabular-nums font-semibold text-blue-500 leading-none">
            {contacts.length}
          </span>
        )}
        <div className="flex-1" />
        <div className="h-8 w-8 flex items-center justify-center">
          <EncryptionInfoDropdown
            description_key="common.only_you_can_read_contacts"
            has_pq_protection={true}
            is_external={false}
            size={20}
          />
        </div>
        <Button
          className="h-8 w-8"
          disabled={is_importing}
          size="icon"
          variant="outline"
          onClick={on_import_modal_open}
        >
          <ArrowUpTrayIcon className="w-4 h-4 text-txt-secondary" />
        </Button>
        <Button
          className="h-8 w-8"
          size="icon"
          variant="outline"
          onClick={on_add_click}
        >
          <PlusIcon className="w-4 h-4 text-txt-secondary" />
        </Button>
      </div>

      <div className="px-4 py-2">
        <div className="flex items-center gap-2 h-9 px-3 rounded-lg border bg-[var(--bg-primary)] border-[var(--border-secondary)]">
          <MagnifyingGlassIcon className="w-4 h-4 text-[var(--text-muted)] flex-shrink-0" />
          <input
            ref={search_input_ref}
            className="flex-1 min-w-0 bg-transparent outline-none border-0 ring-0 focus:outline-none focus:ring-0 focus:border-0 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
            placeholder={`${t("common.search_contacts")}`}
            type="text"
            value={search_query}
            onChange={(e) => set_search_query(e.target.value)}
          />
          {search_query && (
            <button
              aria-label={t("common.clear")}
              className="p-1.5 rounded-full text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
              type="button"
              onClick={() => set_search_query("")}
            >
              <XMarkIcon className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {has_selection ? (
        <div className="flex items-center justify-center gap-1 px-4 py-2 border-b border-edge-primary">
          <span className="text-[12px] tabular-nums font-medium text-txt-primary pr-2">
            {t("common.selected_count", {
              count: selection_state.selected_count,
            })}
          </span>
          <button
            aria-label={
              selected_all_favorited
                ? t("common.removed_from_favorites")
                : t("common.added_to_favorites")
            }
            className="h-8 w-8 inline-flex items-center justify-center rounded-md text-txt-secondary hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
            type="button"
            onClick={on_toggle_favorite_selected}
          >
            {selected_all_favorited ? (
              <StarIconSolid className="w-4 h-4 text-yellow-500" />
            ) : (
              <StarIcon className="w-4 h-4" />
            )}
          </button>
          <button
            aria-label={t("common.copy")}
            className="h-8 w-8 inline-flex items-center justify-center rounded-md text-txt-secondary hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
            type="button"
            onClick={on_copy_emails}
          >
            <ClipboardDocumentIcon className="w-4 h-4" />
          </button>
          <button
            aria-label={t("common.export_all")}
            className="h-8 w-8 inline-flex items-center justify-center rounded-md text-txt-secondary hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
            type="button"
            onClick={() => on_export_contacts(true)}
          >
            <ArrowDownTrayIcon className="w-4 h-4" />
          </button>
          <button
            aria-label={t("common.delete")}
            className="h-8 w-8 inline-flex items-center justify-center rounded-md text-red-500 hover:bg-red-500/10 transition-colors"
            type="button"
            onClick={on_delete_selected}
          >
            <TrashIcon className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-between px-4 py-2 border-b border-edge-primary">
          <p className="text-[12px] text-txt-muted pr-3 flex-1">
            {t("settings.auto_save_recipients_to_contacts")}
          </p>
          <Switch
            checked={auto_save}
            onCheckedChange={() =>
              update_preference(
                "auto_save_recent_recipients",
                !auto_save,
                true,
              )
            }
          />
        </div>
      )}

      {import_progress && (
        <div className="px-4 py-2 border-b border-edge-primary">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[12px] text-txt-secondary">
              {t("common.importing_contacts")}
            </span>
            <span className="text-[12px] tabular-nums text-txt-muted">
              {import_progress.current}/{import_progress.total}
            </span>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden bg-edge-secondary">
            <div
              className="h-full bg-blue-500 transition-all duration-300"
              style={{
                width: `${(import_progress.current / import_progress.total) * 100}%`,
              }}
            />
          </div>
        </div>
      )}

      {error && (
        <div className="mx-3 mt-2 p-2 rounded-lg bg-red-500/10 border border-red-500/20">
          <p className="text-[12px] text-red-500">{error}</p>
        </div>
      )}

      <div ref={list_container_ref} className="flex-1 overflow-y-auto px-2 py-2">
        {is_loading ? (
          <div>
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-3 px-3 py-2.5"
              >
                <Skeleton className="w-10 h-10 rounded-xl" />
                <div className="flex-1 min-w-0">
                  <Skeleton className="h-4 w-32 mb-1.5" />
                  <Skeleton className="h-3 w-44" />
                </div>
              </div>
            ))}
          </div>
        ) : contacts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-6">
            <UserPlusIcon className="w-8 h-8 mb-3 text-txt-muted" />
            <p className="text-[14px] font-medium mb-1 text-txt-primary">
              {t("common.no_contacts")}
            </p>
            <p className="text-[12px] text-center mb-4 text-txt-muted">
              {t("common.add_contacts_hint")}
            </p>
            <Button size="md" onClick={on_add_click}>
              <PlusIcon className="w-3.5 h-3.5" />
              {t("common.add_contact")}
            </Button>
          </div>
        ) : filtered_contacts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <MagnifyingGlassIcon className="w-8 h-8 mb-3 text-txt-muted" />
            <p className="text-[14px] font-medium text-txt-primary">
              {t("common.no_results")}
            </p>
          </div>
        ) : (
          filtered_contacts.map((contact) => {
            const name = `${contact.first_name} ${contact.last_name}`.trim();
            const primary_email = contact.emails[0];
            const is_active = selected_contact?.id === contact.id;
            const is_selected = selected_ids.has(contact.id);

            return (
              <button
                key={contact.id}
                ref={(el) => {
                  if (el)
                    contact_refs.current?.set(
                      contact.id,
                      el as unknown as HTMLDivElement,
                    );
                  else contact_refs.current?.delete(contact.id);
                }}
                className={cn(
                  "group/contact w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors",
                  is_selected
                    ? "bg-[var(--accent-blue,#3b82f6)]/10"
                    : is_active
                      ? "bg-black/10 dark:bg-white/10"
                      : "hover:bg-black/5 dark:hover:bg-white/5",
                )}
                onClick={() =>
                  set_selected_contact(is_active ? null : contact)
                }
              >
                <div
                  aria-label={t("mail.select")}
                  aria-pressed={is_selected}
                  className="group/avatar relative flex-shrink-0 w-10 h-10 cursor-pointer"
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    on_toggle_select(contact.id);
                  }}
                  onKeyDown={(e) => {
                    if (e["key"] === "Enter" || e["key"] === " ") {
                      e.preventDefault();
                      e.stopPropagation();
                      on_toggle_select(contact.id);
                    }
                  }}
                >
                  <ContactAvatar
                    avatar_url={contact.avatar_url}
                    className={cn(
                      "transition-opacity duration-150",
                      is_selected
                        ? "opacity-0"
                        : "group-hover/avatar:opacity-0",
                    )}
                    email={primary_email}
                    name={`${contact.first_name || ""} ${contact.last_name || ""}`.trim()}
                    profile_color={contact.profile_color}
                    size_px={40}
                  />
                  <div
                    className={cn(
                      "absolute inset-0 rounded-xl flex items-center justify-center transition-opacity duration-150",
                      is_selected
                        ? "opacity-100 bg-[var(--accent-blue,#3b82f6)]"
                        : "opacity-0 group-hover/avatar:opacity-100 bg-black/30 dark:bg-white/20",
                    )}
                  >
                    <CheckIcon className="w-5 h-5 text-white" />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  {name ? (
                    <>
                      <p className="text-[14px] font-medium truncate text-txt-primary">
                        {name}
                      </p>
                      {primary_email && (
                        <p className="text-[12px] truncate text-txt-muted">
                          {primary_email}
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="text-[14px] font-medium truncate text-txt-primary">
                      {primary_email || t("common.unnamed")}
                    </p>
                  )}
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
