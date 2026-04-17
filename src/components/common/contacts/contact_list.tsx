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
  EnvelopeIcon,
  ChevronRightIcon,
  XMarkIcon,
  StarIcon,
  ArrowDownTrayIcon,
  ArrowUpTrayIcon,
  FunnelIcon,
  BarsArrowDownIcon,
  BarsArrowUpIcon,
  ClipboardDocumentIcon,
  CheckIcon,
  UserPlusIcon,
  Squares2X2Icon,
  ListBulletIcon,
  CakeIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { StarIcon as StarIconSolid } from "@heroicons/react/24/solid";
import { Button } from "@aster/ui";
import { Checkbox } from "@aster/ui";

import { ProfileAvatar } from "@/components/ui/profile_avatar";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown_menu";
import { Skeleton } from "@/components/ui/skeleton";
import { MobileMenuButton } from "@/components/layout/sidebar";
import { get_days_until_birthday } from "@/utils/contact_utils";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ#".split("");

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
  on_toggle_select_all: () => void;
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
  is_loading,
  is_importing,
  import_progress,
  error,
  view_mode,
  set_view_mode,
  sort_by,
  set_sort_by,
  filter_by,
  set_filter_by,
  filter_label,
  sort_label,
  focused_index,
  copied_field,
  selection_state,
  has_selection,
  selected_all_favorited,
  alphabetical_index,
  upcoming_birthdays_count,
  search_input_ref,
  list_container_ref,
  contact_refs,
  on_mobile_menu_toggle,
  on_add_click,
  on_import_modal_open,
  on_toggle_select,
  on_toggle_select_all,
  on_compose_to_selected,
  on_toggle_favorite_selected,
  on_copy_emails,
  on_export_contacts,
  on_delete_selected,
  on_compose_email,
  on_copy,
  on_scroll_to_letter,
}: ContactListProps) {
  return (
    <div className="w-full md:w-1/2 flex-shrink-0 flex flex-col border-r border-edge-primary">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-edge-primary">
        <div className="md:hidden">
          <MobileMenuButton on_click={on_mobile_menu_toggle} />
        </div>
        <h1 className="text-[15px] font-semibold flex-1 text-txt-primary">
          {t("common.contacts")}
        </h1>
        {is_loading ? (
          <Skeleton className="w-4 h-4 rounded" />
        ) : (
          <span className="text-[12px] tabular-nums text-txt-muted">
            {contacts.length}
          </span>
        )}
        <Button
          className="h-8 w-8"
          disabled={is_importing}
          size="icon"
          variant="ghost"
          onClick={() => on_import_modal_open()}
        >
          <ArrowUpTrayIcon className="w-4 h-4 text-txt-secondary" />
        </Button>
        <div className="hidden sm:flex items-center rounded-md p-0.5 bg-surf-secondary">
          <button
            className={`p-1.5 rounded transition-colors ${view_mode === "list" ? "bg-surf-primary text-txt-primary" : "text-txt-muted"}`}
            onClick={() => set_view_mode("list")}
          >
            <ListBulletIcon className="w-3.5 h-3.5" />
          </button>
          <button
            className={`p-1.5 rounded transition-colors ${view_mode === "compact" ? "bg-surf-primary text-txt-primary" : "text-txt-muted"}`}
            onClick={() => set_view_mode("compact")}
          >
            <Squares2X2Icon className="w-3.5 h-3.5" />
          </button>
        </div>
        <Button size="md" variant="depth" onClick={on_add_click}>
          <PlusIcon className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">{t("common.add")}</span>
        </Button>
      </div>

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

      <div className="px-3 py-2">
        <div className="relative">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-txt-muted" />
          <Input
            ref={search_input_ref}
            className="pl-9 h-9 text-[13px] bg-surf-secondary"
            placeholder={t("common.search_contacts")}
            value={search_query}
            onChange={(e) => set_search_query(e.target.value)}
          />
          {search_query && (
            <button
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-black/5 dark:hover:bg-white/5"
              onClick={() => set_search_query("")}
            >
              <XMarkIcon className="w-3.5 h-3.5 text-txt-muted" />
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 px-3 py-2 border-b border-edge-primary">
        <div className="flex-shrink-0">
          <Checkbox
            checked={selection_state.all_selected}
            indeterminate={selection_state.some_selected}
            onCheckedChange={on_toggle_select_all}
          />
        </div>

        {has_selection ? (
          <div className="flex items-center gap-1 flex-1">
            <span className="text-[12px] font-medium mr-1 text-txt-primary">
              {selection_state.selected_count}
            </span>

            <Button
              className="h-7 w-7"
              size="icon"
              variant="ghost"
              onClick={on_compose_to_selected}
            >
              <EnvelopeIcon className="h-3.5 w-3.5 text-txt-secondary" />
            </Button>

            <Button
              className="h-7 w-7"
              size="icon"
              variant="ghost"
              onClick={on_toggle_favorite_selected}
            >
              {selected_all_favorited ? (
                <StarIconSolid className="h-3.5 w-3.5 text-amber-400" />
              ) : (
                <StarIcon className="h-3.5 w-3.5 text-txt-secondary" />
              )}
            </Button>

            <Button
              className="h-7 w-7"
              size="icon"
              variant="ghost"
              onClick={on_copy_emails}
            >
              {copied_field === "bulk-emails" ? (
                <CheckIcon className="h-3.5 w-3.5 text-green-500" />
              ) : (
                <ClipboardDocumentIcon className="h-3.5 w-3.5 text-txt-secondary" />
              )}
            </Button>

            <Button
              className="h-7 w-7"
              size="icon"
              variant="ghost"
              onClick={() => on_export_contacts(true)}
            >
              <ArrowDownTrayIcon className="h-3.5 w-3.5 text-txt-secondary" />
            </Button>

            <Button
              className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10"
              size="icon"
              variant="ghost"
              onClick={on_delete_selected}
            >
              <TrashIcon className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : (
          <div className="flex items-center justify-between flex-1">
            <span className="text-[12px] text-txt-muted">
              {filtered_contacts.length === contacts.length
                ? `${contacts.length}`
                : `${filtered_contacts.length}/${contacts.length}`}
            </span>

            <div className="flex items-center gap-0.5">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    className="h-7 px-2 gap-1 text-[11px]"
                    size="md"
                    variant="ghost"
                  >
                    <FunnelIcon
                      className={`h-3.5 w-3.5 ${filter_by !== "all" ? "text-txt-primary" : "text-txt-muted"}`}
                    />
                    <span
                      className={
                        filter_by !== "all"
                          ? "text-txt-primary"
                          : "text-txt-muted"
                      }
                    >
                      {filter_label}
                    </span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-40">
                  <DropdownMenuItem onClick={() => set_filter_by("all")}>
                    {t("mail.all")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => set_filter_by("favorites")}>
                    <StarIconSolid className="h-3.5 w-3.5 mr-2 text-amber-400" />
                    {t("common.favorites")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => set_filter_by("upcoming_birthdays")}
                  >
                    <CakeIcon className="h-3.5 w-3.5 mr-2 text-txt-muted" />
                    {t("common.birthday")}
                    {upcoming_birthdays_count > 0 && (
                      <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-500">
                        {upcoming_birthdays_count}
                      </span>
                    )}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => set_filter_by("has_email")}>
                    {t("common.has_email")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => set_filter_by("has_phone")}>
                    {t("common.has_phone")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => set_filter_by("has_company")}
                  >
                    {t("common.has_company")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    className="h-7 px-2 gap-1 text-[11px]"
                    size="md"
                    variant="ghost"
                  >
                    {sort_by === "name_desc" ? (
                      <BarsArrowUpIcon className="h-3.5 w-3.5 text-txt-muted" />
                    ) : (
                      <BarsArrowDownIcon className="h-3.5 w-3.5 text-txt-muted" />
                    )}
                    <span className="text-txt-muted">{sort_label}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-36">
                  <DropdownMenuItem onClick={() => set_sort_by("name_asc")}>
                    {t("common.name")} A-Z
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => set_sort_by("name_desc")}>
                    {t("common.name")} Z-A
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => set_sort_by("company")}>
                    {t("common.company")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => set_sort_by("recent")}>
                    {t("common.recently_added")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button className="h-7 w-7" size="icon" variant="ghost">
                    <ArrowDownTrayIcon className="h-3.5 w-3.5 text-txt-muted" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-40">
                  <DropdownMenuItem onClick={() => on_export_contacts(false)}>
                    {t("common.export_all")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="mx-3 mt-2 p-2 rounded-lg bg-red-500/10 border border-red-500/20">
          <p className="text-[12px] text-red-500">{error}</p>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        <div ref={list_container_ref} className="flex-1 overflow-y-auto">
          {is_loading ? (
            <div>
              {Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 px-3 py-2 border-b border-edge-secondary"
                >
                  <Skeleton className="w-4 h-4 rounded" />
                  <Skeleton className="w-8 h-8 rounded-full" />
                  <div className="flex-1 min-w-0">
                    <Skeleton className="h-4 w-32 mb-1" />
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
              <Button size="md" variant="depth" onClick={on_add_click}>
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
            filtered_contacts.map((contact, index) => {
              const name = `${contact.first_name} ${contact.last_name}`.trim();
              const primary_email = contact.emails[0];
              const is_selected_item = selected_ids.has(contact.id);
              const is_active = selected_contact?.id === contact.id;
              const is_focused = focused_index === index;
              const days_until_birthday = contact.birthday
                ? get_days_until_birthday(contact.birthday)
                : null;

              return (
                <div
                  key={contact.id}
                  ref={(el) => {
                    if (el) contact_refs.current?.set(contact.id, el);
                    else contact_refs.current?.delete(contact.id);
                  }}
                  className={`group flex items-center gap-3 px-3 cursor-pointer transition-colors border-b border-edge-secondary -outline-offset-2 ${view_mode === "compact" ? "py-1.5" : "py-2"} ${is_active || is_focused ? "bg-[var(--bg-hover)]" : is_selected_item ? "bg-[rgba(59,130,246,0.06)]" : ""} ${is_focused && !is_active ? "outline-2 outline-[rgba(59,130,246,0.5)]" : "outline-none"}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => set_selected_contact(contact)}
                  onKeyDown={(e) => {
                    if (e["key"] === "Enter" || e["key"] === " ") {
                      e.preventDefault();
                      set_selected_contact(contact);
                    }
                  }}
                  onMouseEnter={(e) => {
                    if (!is_active && !is_selected_item && !is_focused) {
                      e.currentTarget.style.backgroundColor = "var(--bg-hover)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "";
                  }}
                >
                  <div
                    className="flex-shrink-0"
                    role="button"
                    tabIndex={0}
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => {
                      if (e["key"] === "Enter" || e["key"] === " ") {
                        e.stopPropagation();
                      }
                    }}
                  >
                    <Checkbox
                      checked={is_selected_item}
                      onCheckedChange={() => on_toggle_select(contact.id)}
                    />
                  </div>
                  <ProfileAvatar
                    className="flex-shrink-0"
                    email={primary_email}
                    image_url={contact.avatar_url}
                    name={name}
                    size={view_mode === "compact" ? "xs" : "sm"}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`font-medium truncate text-txt-primary ${view_mode === "compact" ? "text-[12px]" : "text-[13px]"}`}
                      >
                        {name || t("common.unnamed")}
                      </span>
                      {contact.is_favorite && (
                        <StarIconSolid className="w-3 h-3 text-amber-400 flex-shrink-0" />
                      )}
                      {days_until_birthday !== null &&
                        days_until_birthday <= 7 && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-pink-500/10 text-pink-500 flex-shrink-0">
                            {days_until_birthday === 0
                              ? t("common.birthday_today")
                              : days_until_birthday === 1
                                ? t("common.birthday_tomorrow")
                                : `${days_until_birthday}d`}
                          </span>
                        )}
                    </div>
                    {primary_email && view_mode !== "compact" && (
                      <p className="text-[11px] truncate text-txt-muted">
                        {primary_email}
                      </p>
                    )}
                  </div>
                  <div
                    className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                    role="button"
                    tabIndex={0}
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => {
                      if (e["key"] === "Enter" || e["key"] === " ") {
                        e.stopPropagation();
                      }
                    }}
                  >
                    {primary_email && (
                      <button
                        className="p-1.5 rounded hover:bg-black/5 dark:hover:bg-white/5"
                        onClick={() => on_compose_email(primary_email)}
                      >
                        <EnvelopeIcon className="w-3.5 h-3.5 text-txt-muted" />
                      </button>
                    )}
                    <button
                      className="p-1.5 rounded hover:bg-black/5 dark:hover:bg-white/5"
                      onClick={() =>
                        primary_email &&
                        on_copy(primary_email, `quick-${contact.id}`)
                      }
                    >
                      {copied_field === `quick-${contact.id}` ? (
                        <CheckIcon className="w-3.5 h-3.5 text-green-500" />
                      ) : (
                        <ClipboardDocumentIcon className="w-3.5 h-3.5 text-txt-muted" />
                      )}
                    </button>
                  </div>
                  <ChevronRightIcon className="w-4 h-4 flex-shrink-0 opacity-30 group-hover:opacity-0 text-txt-muted" />
                </div>
              );
            })
          )}
        </div>

        {!is_loading &&
          filtered_contacts.length > 10 &&
          sort_by === "name_asc" && (
            <div className="hidden sm:flex flex-col items-center justify-center w-6 py-2 border-l border-edge-secondary">
              {ALPHABET.map((letter) => {
                const has_contacts = alphabetical_index.has(letter);

                return (
                  <button
                    key={letter}
                    className={`text-[11px] leading-tight py-0.5 w-full text-center transition-colors ${has_contacts ? "hover:bg-black/5 dark:hover:bg-white/5 text-txt-secondary" : "text-txt-muted opacity-30"}`}
                    disabled={!has_contacts}
                    onClick={() => on_scroll_to_letter(letter)}
                  >
                    {letter}
                  </button>
                );
              })}
            </div>
          )}
      </div>
    </div>
  );
}
