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

import { motion } from "framer-motion";
import {
  XMarkIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  ChevronRightIcon,
  EnvelopeIcon,
  PhoneIcon,
  BuildingOffice2Icon,
  TrashIcon,
  StarIcon,
  ClipboardDocumentIcon,
  CheckIcon,
  UserPlusIcon,
  ArrowDownTrayIcon,
  FunnelIcon,
  BarsArrowDownIcon,
  BarsArrowUpIcon,
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
import { use_should_reduce_motion } from "@/provider";

interface ModalContactListProps {
  contacts: DecryptedContact[];
  filtered_contacts: DecryptedContact[];
  search_query: string;
  set_search_query: (query: string) => void;
  search_input_ref: RefObject<HTMLInputElement>;
  selected_ids: Set<string>;
  set_selected_ids: React.Dispatch<React.SetStateAction<Set<string>>>;
  selection_state: {
    selected_count: number;
    all_selected: boolean;
    some_selected: boolean;
  };
  has_selection: boolean;
  selected_all_favorited: boolean;
  copied_field: string | null;
  is_loading: boolean;
  error: string | null;
  sort_by: "name_asc" | "name_desc" | "company" | "recent";
  set_sort_by: (sort: "name_asc" | "name_desc" | "company" | "recent") => void;
  filter_by: "all" | "favorites" | "has_email" | "has_phone" | "has_company";
  set_filter_by: (
    filter: "all" | "favorites" | "has_email" | "has_phone" | "has_company",
  ) => void;
  filter_label: string;
  sort_label: string;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
  on_close: () => void;
  on_add: () => void;
  on_select_contact: (contact: DecryptedContact) => void;
  on_toggle_select: (id: string) => void;
  on_toggle_select_all: () => void;
  on_compose_to_selected: () => void;
  on_toggle_favorite_selected: () => void;
  on_copy_emails: () => void;
  on_export_contacts: (export_selected: boolean) => void;
  on_delete_selected: () => void;
}

export function ModalContactList({
  contacts,
  filtered_contacts,
  search_query,
  set_search_query,
  search_input_ref,
  selected_ids,
  set_selected_ids,
  selection_state,
  has_selection,
  selected_all_favorited,
  copied_field,
  is_loading,
  error,
  sort_by,
  set_sort_by,
  filter_by,
  set_filter_by,
  filter_label,
  sort_label,
  t,
  on_close,
  on_add,
  on_select_contact,
  on_toggle_select,
  on_toggle_select_all,
  on_compose_to_selected,
  on_toggle_favorite_selected,
  on_copy_emails,
  on_export_contacts,
  on_delete_selected,
}: ModalContactListProps) {
  const reduce_motion = use_should_reduce_motion();

  return (
    <motion.div
      key="list"
      animate={{ opacity: 1, x: 0 }}
      className="flex flex-col max-h-[75vh]"
      exit={{ opacity: 0, x: 10 }}
      initial={reduce_motion ? false : { opacity: 0, x: -10 }}
      transition={{ duration: reduce_motion ? 0 : 0.15 }}
    >
      <div className="px-5 pt-5 pb-4 border-b border-edge-secondary">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-baseline gap-2.5">
            <h2 className="text-[17px] font-semibold text-txt-primary">
              {t("common.contacts")}
            </h2>
            {contacts.length > 0 && (
              <span className="text-[13px] px-2 py-0.5 rounded-full bg-surf-secondary text-txt-muted">
                {contacts.length}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button className="h-10" variant="depth" onClick={on_add}>
              <PlusIcon className="w-4 h-4" />
              {t("common.add")}
            </Button>
            <motion.button
              className="p-2 rounded-lg text-txt-muted"
              whileHover={{
                backgroundColor: "rgba(0,0,0,0.05)",
              }}
              onClick={on_close}
            >
              <XMarkIcon className="w-5 h-5" />
            </motion.button>
          </div>
        </div>

        <div className="relative">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-[16px] h-[16px] pointer-events-none text-txt-muted" />
          <Input
            ref={search_input_ref}
            className="w-full pl-9 pr-4"
            placeholder={t("common.search_contacts")}
            value={search_query}
            onChange={(e) => set_search_query(e.target.value)}
          />
          {search_query && (
            <motion.button
              animate={{ opacity: 1, scale: 1 }}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md"
              initial={reduce_motion ? false : { opacity: 0, scale: 0.8 }}
              whileHover={{ backgroundColor: "rgba(0,0,0,0.05)" }}
              onClick={() => set_search_query("")}
            >
              <XMarkIcon className="w-3.5 h-3.5 text-txt-muted" />
            </motion.button>
          )}
        </div>
      </div>

      {contacts.length > 0 && (
        <div className="flex items-center gap-2 px-5 py-2 border-b border-edge-secondary">
          <div className="flex-shrink-0">
            <Checkbox
              checked={selection_state.all_selected}
              indeterminate={selection_state.some_selected}
              onCheckedChange={on_toggle_select_all}
            />
          </div>

          {has_selection ? (
            <div className="flex items-center gap-1 ml-1 flex-1">
              <span className="text-[13px] font-medium mr-2 text-txt-primary">
                {t("common.selected_count", {
                  count: selection_state.selected_count,
                })}
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
              <span className="text-[13px] ml-1 text-txt-muted">
                {filtered_contacts.length === contacts.length
                  ? contacts.length === 1
                    ? t("common.contact_count_one", {
                        count: contacts.length,
                      })
                    : t("common.contact_count_other", {
                        count: contacts.length,
                      })
                  : t("common.n_of_n_contacts", {
                      filtered: filtered_contacts.length,
                      total: contacts.length,
                    })}
              </span>

              <div className="flex items-center gap-1">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      className="h-7 px-2 gap-1 text-[12px]"
                      size="md"
                      variant="ghost"
                    >
                      <FunnelIcon
                        className="h-3.5 w-3.5"
                        style={{
                          color:
                            filter_by !== "all"
                              ? "var(--text-primary)"
                              : "var(--text-muted)",
                        }}
                      />
                      <span
                        className="hidden sm:inline"
                        style={{
                          color:
                            filter_by !== "all"
                              ? "var(--text-primary)"
                              : "var(--text-muted)",
                        }}
                      >
                        {filter_label}
                      </span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-40">
                    <DropdownMenuItem
                      className={filter_by === "all" ? "font-medium" : ""}
                      onClick={() => set_filter_by("all")}
                    >
                      {t("mail.all")}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className={filter_by === "favorites" ? "font-medium" : ""}
                      onClick={() => set_filter_by("favorites")}
                    >
                      <StarIconSolid className="h-3.5 w-3.5 mr-2 text-amber-400" />
                      {t("common.favorites")}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className={filter_by === "has_email" ? "font-medium" : ""}
                      onClick={() => set_filter_by("has_email")}
                    >
                      <EnvelopeIcon className="h-3.5 w-3.5 mr-2" />
                      {t("common.has_email")}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className={filter_by === "has_phone" ? "font-medium" : ""}
                      onClick={() => set_filter_by("has_phone")}
                    >
                      <PhoneIcon className="h-3.5 w-3.5 mr-2" />
                      {t("common.has_phone")}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className={
                        filter_by === "has_company" ? "font-medium" : ""
                      }
                      onClick={() => set_filter_by("has_company")}
                    >
                      <BuildingOffice2Icon className="h-3.5 w-3.5 mr-2" />
                      {t("common.has_company")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      className="h-7 px-2 gap-1 text-[12px]"
                      size="md"
                      variant="ghost"
                    >
                      {sort_by === "name_desc" ? (
                        <BarsArrowUpIcon className="h-3.5 w-3.5 text-txt-muted" />
                      ) : (
                        <BarsArrowDownIcon className="h-3.5 w-3.5 text-txt-muted" />
                      )}
                      <span className="hidden sm:inline text-txt-muted">
                        {sort_label}
                      </span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-40">
                    <DropdownMenuItem
                      className={sort_by === "name_asc" ? "font-medium" : ""}
                      onClick={() => set_sort_by("name_asc")}
                    >
                      {t("common.name")} A-Z
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className={sort_by === "name_desc" ? "font-medium" : ""}
                      onClick={() => set_sort_by("name_desc")}
                    >
                      {t("common.name")} Z-A
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className={sort_by === "company" ? "font-medium" : ""}
                      onClick={() => set_sort_by("company")}
                    >
                      {t("common.company")}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className={sort_by === "recent" ? "font-medium" : ""}
                      onClick={() => set_sort_by("recent")}
                    >
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
                  <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuItem onClick={() => on_export_contacts(false)}>
                      {t("common.export_all_contacts")}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={filtered_contacts.length === contacts.length}
                      onClick={() => {
                        const filtered_ids = new Set(
                          filtered_contacts.map((c) => c.id),
                        );

                        set_selected_ids(filtered_ids);
                        on_export_contacts(true);
                      }}
                    >
                      {t("common.export_filtered_count", {
                        count: filtered_contacts.length,
                      })}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          )}
        </div>
      )}

      {error && (
        <motion.div
          animate={{ opacity: 1, y: 0 }}
          className="mx-5 mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20"
          initial={reduce_motion ? false : { opacity: 0, y: -10 }}
        >
          <p className="text-[13px] text-red-500">{error}</p>
        </motion.div>
      )}

      <div className="flex-1 overflow-y-auto min-h-0">
        {is_loading ? (
          <div className="flex items-center justify-center py-20">
            <motion.div
              animate={{ rotate: 360 }}
              className="w-6 h-6 border-2 rounded-full"
              style={{
                borderColor: "var(--border-secondary)",
                borderTopColor: "var(--text-muted)",
              }}
              transition={{
                duration: reduce_motion ? 0 : 1,
                repeat: Infinity,
                ease: "linear",
              }}
            />
          </div>
        ) : contacts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 px-8">
            <UserPlusIcon className="w-10 h-10 mb-4 text-txt-muted" />
            <h3 className="text-[15px] font-medium mb-1 text-txt-primary">
              {t("common.no_contacts_yet")}
            </h3>
            <p className="text-[13px] text-center mb-5 max-w-[240px] text-txt-muted">
              {t("common.add_contacts_quick_email_hint")}
            </p>
            <Button className="h-10" variant="depth" onClick={on_add}>
              <PlusIcon className="w-3.5 h-3.5" />
              {t("common.add_contact")}
            </Button>
          </div>
        ) : filtered_contacts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <MagnifyingGlassIcon className="w-8 h-8 mb-3 text-txt-muted" />
            <p className="text-[14px] font-medium mb-0.5 text-txt-primary">
              {t("common.no_results")}
            </p>
            <p className="text-[13px] text-txt-muted">
              {t("common.no_contacts_match", { query: search_query })}
            </p>
          </div>
        ) : (
          <div>
            {filtered_contacts.map((contact) => {
              const name = `${contact.first_name} ${contact.last_name}`.trim();
              const primary_email = contact.emails[0];
              const is_selected = selected_ids.has(contact.id);

              return (
                <div
                  key={contact.id}
                  className="flex items-center gap-3 px-5 py-2.5 cursor-pointer transition-colors border-b border-edge-secondary"
                  role="button"
                  style={{
                    backgroundColor: is_selected
                      ? "rgba(59, 130, 246, 0.08)"
                      : "transparent",
                  }}
                  tabIndex={0}
                  onClick={() => on_select_contact(contact)}
                  onKeyDown={(e) => {
                    if (e["key"] === "Enter" || e["key"] === " ") {
                      e.preventDefault();
                      on_select_contact(contact);
                    }
                  }}
                  onMouseEnter={(e) => {
                    if (!is_selected) {
                      e.currentTarget.style.backgroundColor =
                        "var(--bg-secondary)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!is_selected) {
                      e.currentTarget.style.backgroundColor = "transparent";
                    }
                  }}
                >
                  <div
                    className="flex-shrink-0"
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
                    <Checkbox
                      checked={is_selected}
                      onCheckedChange={() => on_toggle_select(contact.id)}
                    />
                  </div>
                  <ProfileAvatar name={name} size="md" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[14px] font-medium truncate text-txt-primary">
                        {name || t("common.unnamed")}
                      </span>
                      {contact.is_favorite && (
                        <StarIcon className="w-3.5 h-3.5 fill-amber-400 text-amber-400 flex-shrink-0" />
                      )}
                    </div>
                    {primary_email && (
                      <p className="text-[12px] truncate text-txt-muted">
                        {primary_email}
                      </p>
                    )}
                  </div>
                  <span className="text-[13px] truncate max-w-[100px] hidden sm:block text-txt-secondary">
                    {contact.company}
                  </span>
                  <ChevronRightIcon className="w-4 h-4 flex-shrink-0 opacity-40 text-txt-muted" />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </motion.div>
  );
}
