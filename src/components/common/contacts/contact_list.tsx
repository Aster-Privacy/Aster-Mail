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
import type {
  ContactFormData,
  ContactGroup,
  DecryptedContact,
} from "@/types/contacts";
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
  ArrowUpTrayIcon,
  UserPlusIcon,
  CheckIcon,
  StarIcon,
  ClipboardDocumentIcon,
  ArrowDownTrayIcon,
  TrashIcon,
  PrinterIcon,
  BarsArrowDownIcon,
  BarsArrowUpIcon,
  Bars2Icon,
  Bars3Icon,
  ChevronDownIcon,
  EllipsisHorizontalIcon,
  CakeIcon,
  XMarkIcon,
  SparklesIcon,
  UserCircleIcon,
  EnvelopeIcon,
} from "@heroicons/react/24/outline";
import { StarIcon as StarIconSolid } from "@heroicons/react/24/solid";
import { Button, Switch, Tooltip } from "@aster/ui";
import { useCallback, useMemo, useState } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { ContactGroupsPane } from "@/components/common/contacts/contact_groups_pane";
import { ContactTrashPane } from "@/components/common/contacts/contact_trash_pane";
import { ContactMergeModal } from "@/components/contacts/contact_merge_modal";
import { ContactBulkCreateModal } from "@/components/contacts/contact_bulk_create_modal";
import { ContactGroupChips } from "@/components/contacts/contact_group_chips";
import { ManageGroupsMenu } from "@/components/contacts/manage_groups_menu";
import { use_contact_groups } from "@/hooks/use_contact_groups";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown_menu";
import {
  count_duplicate_contacts,
  find_duplicate_clusters,
} from "@/lib/contact_duplicates";
import { MobileMenuButton } from "@/components/layout/sidebar";
import { use_preferences } from "@/contexts/preferences_context";
import { EncryptionInfoDropdown } from "@/components/common/encryption_info_dropdown";
import { ContactAvatar } from "@/components/common/contacts/contact_avatar";
import { cn, format_number } from "@/lib/utils";

interface ContactListProps {
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
  contacts: DecryptedContact[];
  filtered_contacts: DecryptedContact[];
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
  search_query: string;
  trashed_contacts: DecryptedContact[];
  on_print_contacts: () => void;
  on_restore_contact: (contact: DecryptedContact) => void;
  on_delete_forever: (contact: DecryptedContact) => void;
  on_empty_trash: () => void;
  on_contacts_refresh: () => void;
  on_add_selected_to_group: (group: ContactGroup) => void;
  group_filter: string | null;
  on_set_group_filter: (group_id: string | null) => void;
  on_set_group_membership: (group_id: string, should_add: boolean) => void;
  selected_contacts: DecryptedContact[];
  on_compose_to_recipients: (recipients: string) => void;
  on_bulk_create: (entries: ContactFormData[]) => Promise<void>;
}

type ContactTab = "contacts" | "frequent" | "other" | "groups" | "trash";

interface GroupDotsProps {
  groups: { id: string; name: string; color?: string | null }[];
  label: string;
}

const GROUP_DOT_FALLBACK = "#94a3b8";

function GroupDots({ groups, label }: GroupDotsProps) {
  if (groups.length === 0) return null;

  const shown = groups.slice(0, 3);
  const names = groups.map((group) => group.name).join(", ");

  return (
    <span
      aria-label={`${label}: ${names}`}
      className="flex items-center gap-0.5 flex-shrink-0"
      title={`${label}: ${names}`}
    >
      {shown.map((group) => (
        <span
          key={group.id}
          className="w-1.5 h-1.5 rounded-full"
          style={{ backgroundColor: group.color || GROUP_DOT_FALLBACK }}
        />
      ))}
      {groups.length > shown.length && (
        <span className="text-[10px] leading-none text-txt-muted">
          +{groups.length - shown.length}
        </span>
      )}
    </span>
  );
}

const BIRTHDAY_CARD_STORAGE_KEY = "aster_contacts_birthday_card_dismissed";

function read_birthday_card_dismissed(): boolean {
  try {
    return localStorage.getItem(BIRTHDAY_CARD_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function write_birthday_card_dismissed(): void {
  try {
    localStorage.setItem(BIRTHDAY_CARD_STORAGE_KEY, "1");
  } catch {
    return;
  }
}

function parse_timestamp(value?: string): number {
  if (!value) return 0;
  const parsed = Date.parse(value);

  return Number.isNaN(parsed) ? 0 : parsed;
}

function has_display_name(contact: DecryptedContact): boolean {
  return Boolean(
    (contact.first_name || "").trim() || (contact.last_name || "").trim(),
  );
}

export function ContactList({
  t,
  contacts,
  filtered_contacts,
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
  search_query,
  trashed_contacts,
  on_print_contacts,
  on_restore_contact,
  on_delete_forever,
  on_empty_trash,
  on_contacts_refresh,
  on_compose_to_recipients,
  on_compose_to_selected,
  on_bulk_create,
  upcoming_birthdays_count,
  sort_by,
  set_sort_by,
  sort_label,
  view_mode,
  set_view_mode,
  filter_by,
  set_filter_by,
  group_filter,
  on_set_group_filter,
  on_set_group_membership,
  selected_contacts,
}: ContactListProps) {
  const { preferences, update_preference } = use_preferences();
  const auto_save = !!preferences.auto_save_recent_recipients;
  const { groups: all_groups } = use_contact_groups();
  const group_by_id = useMemo(
    () => new Map(all_groups.map((group) => [group.id, group])),
    [all_groups],
  );
  const is_compact = view_mode === "compact";
  const avatar_px = is_compact ? 32 : 40;
  const [tab, set_tab] = useState<ContactTab>("contacts");
  const [is_bulk_create_open, set_is_bulk_create_open] = useState(false);
  const [birthday_card_dismissed, set_birthday_card_dismissed] = useState(() =>
    read_birthday_card_dismissed(),
  );
  const [group_count, set_group_count] = useState(0);
  const [is_group_modal_open, set_is_group_modal_open] = useState(false);
  const handle_group_count_change = useCallback((count: number) => {
    set_group_count(count);
  }, []);
  const [merge_targets, set_merge_targets] = useState<DecryptedContact[]>([]);
  const duplicate_clusters = useMemo(
    () => find_duplicate_clusters(contacts),
    [contacts],
  );
  const duplicate_count = useMemo(
    () => count_duplicate_contacts(duplicate_clusters),
    [duplicate_clusters],
  );

  const frequent_contacts = useMemo(
    () =>
      filtered_contacts
        .filter((contact) => (contact.email_count ?? 0) > 0)
        .sort(
          (a, b) =>
            (b.email_count ?? 0) - (a.email_count ?? 0) ||
            parse_timestamp(b.last_contacted) -
              parse_timestamp(a.last_contacted),
        ),
    [filtered_contacts],
  );

  const other_contacts = useMemo(
    () => filtered_contacts.filter((contact) => !has_display_name(contact)),
    [filtered_contacts],
  );

  const is_list_tab =
    tab === "contacts" || tab === "frequent" || tab === "other";

  const visible_contacts =
    tab === "frequent"
      ? frequent_contacts
      : tab === "other"
        ? other_contacts
        : filtered_contacts;

  const has_any_birthday = useMemo(
    () => contacts.some((contact) => Boolean(contact.birthday)),
    [contacts],
  );

  const show_birthday_card =
    tab === "contacts" &&
    !has_selection &&
    !birthday_card_dismissed &&
    contacts.length > 0 &&
    (upcoming_birthdays_count > 0 || !has_any_birthday);

  const dismiss_birthday_card = useCallback(() => {
    set_birthday_card_dismissed(true);
    write_birthday_card_dismissed();
  }, []);

  const open_merge_review = useCallback(() => {
    set_merge_targets(duplicate_clusters[0]?.contacts ?? []);
  }, [duplicate_clusters]);

  const sort_options: { key: SortOption; label: string }[] = [
    { key: "name_asc", label: `${t("common.name")} A-Z` },
    { key: "name_desc", label: `${t("common.name")} Z-A` },
    { key: "last_name_asc", label: `${t("common.last_name")} A-Z` },
    { key: "last_name_desc", label: `${t("common.last_name")} Z-A` },
    { key: "company", label: t("common.company") },
    { key: "recent", label: t("common.recently_added") },
  ];

  const tab_items: { key: ContactTab; label: string; count: number }[] = [
    {
      key: "contacts",
      label: t("common.contacts"),
      count: filtered_contacts.length,
    },
    {
      key: "frequent",
      label: t("common.frequent_contacts"),
      count: frequent_contacts.length,
    },
    {
      key: "other",
      label: t("common.other_contacts"),
      count: other_contacts.length,
    },
    { key: "groups", label: t("common.groups"), count: group_count },
    { key: "trash", label: t("mail.trash"), count: trashed_contacts.length },
  ];

  return (
    <div className="w-full md:w-1/2 md:flex-shrink-0 md:min-w-0 md:border-e md:border-edge-primary min-h-0 flex flex-col">
      <div className="flex items-center gap-2 px-4 pt-4 pb-2">
        <div className="md:hidden">
          <MobileMenuButton on_click={on_mobile_menu_toggle} />
        </div>
        <h1 className="text-[20px] font-semibold leading-none text-txt-primary">
          {t("common.contacts")}
        </h1>
        <div className="flex-1" />
        <div className="h-8 w-8 flex items-center justify-center">
          <EncryptionInfoDropdown
            description_key="common.only_you_can_read_contacts"
            has_pq_protection={true}
            is_external={false}
            size={20}
          />
        </div>
        <div className="flex items-center gap-1.5">
          <DropdownMenu>
            <Tooltip tip={`${t("common.sort")}: ${sort_label}`}>
              <DropdownMenuTrigger asChild>
                <Button
                  aria-label={`${t("common.sort")}: ${sort_label}`}
                  className="h-9 gap-1.5 rounded-[10px] px-2.5 text-[13px] font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                  disabled={!is_list_tab}
                  size="sm"
                  variant="ghost"
                >
                  {sort_by === "name_desc" || sort_by === "last_name_desc" ? (
                    <BarsArrowUpIcon className="w-[18px] h-[18px]" />
                  ) : (
                    <BarsArrowDownIcon className="w-[18px] h-[18px]" />
                  )}
                  <span className="hidden lg:inline">{sort_label}</span>
                  <ChevronDownIcon className="hidden lg:inline-block w-3.5 h-3.5 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
            </Tooltip>
            <DropdownMenuContent align="end" className="w-52">
              {sort_options.map((option) => (
                <DropdownMenuItem
                  key={option.key}
                  onClick={() => set_sort_by(option.key)}
                >
                  <CheckIcon
                    className={cn(
                      "w-4 h-4",
                      sort_by === option.key ? "opacity-100" : "opacity-0",
                    )}
                  />
                  {option.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <Tooltip tip={t("settings.density")}>
            <Button
              aria-label={
                is_compact
                  ? t("settings.density_comfortable")
                  : t("settings.density_compact")
              }
              aria-pressed={is_compact}
              className="h-9 w-9 rounded-[10px] hover:bg-[var(--bg-hover)] text-[var(--icon-secondary)] hover:text-[var(--icon-active)]"
              size="icon"
              variant="ghost"
              onClick={() => set_view_mode(is_compact ? "list" : "compact")}
            >
              {is_compact ? (
                <Bars3Icon className="w-[18px] h-[18px]" />
              ) : (
                <Bars2Icon className="w-[18px] h-[18px]" />
              )}
            </Button>
          </Tooltip>

          <DropdownMenu>
            <Tooltip tip={t("common.manage_contacts")}>
              <DropdownMenuTrigger asChild>
                <Button
                  aria-label={t("common.manage_contacts")}
                  className="h-9 w-9 rounded-[10px] hover:bg-[var(--bg-hover)] text-[var(--icon-secondary)] hover:text-[var(--icon-active)]"
                  size="icon"
                  variant="ghost"
                >
                  <EllipsisHorizontalIcon className="w-[18px] h-[18px]" />
                </Button>
              </DropdownMenuTrigger>
            </Tooltip>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem
                disabled={duplicate_count === 0}
                onClick={open_merge_review}
              >
                <SparklesIcon className="w-4 h-4" />
                {duplicate_count === 0
                  ? t("common.no_duplicates_found")
                  : t("common.merge_and_fix")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                disabled={is_importing}
                onClick={on_import_modal_open}
              >
                <ArrowUpTrayIcon className="w-4 h-4" />
                {t("common.import_contacts")}
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={contacts.length === 0}
                onClick={() => on_export_contacts(false)}
              >
                <ArrowDownTrayIcon className="w-4 h-4" />
                {t("common.export_all")}
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={contacts.length === 0}
                onClick={on_print_contacts}
              >
                <PrinterIcon className="w-4 h-4" />
                {t("common.print_contacts")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => set_tab("trash")}>
                <TrashIcon className="w-4 h-4" />
                {t("mail.trash")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <Tooltip tip={t("common.create_contact")}>
              <DropdownMenuTrigger asChild>
                <Button
                  aria-label={t("common.create_contact")}
                  className="h-9 gap-1.5 rounded-[10px] px-3 text-[13px] font-medium"
                  size="sm"
                  variant="primary"
                >
                  <PlusIcon className="w-[18px] h-[18px]" />
                  <span className="hidden sm:inline">
                    {t("common.create_contact")}
                  </span>
                  <ChevronDownIcon className="hidden sm:inline-block w-3.5 h-3.5 opacity-70" />
                </Button>
              </DropdownMenuTrigger>
            </Tooltip>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem
                onClick={() => {
                  set_tab("contacts");
                  on_add_click();
                }}
              >
                <UserPlusIcon className="w-4 h-4" />
                {t("common.create_contact")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => set_is_bulk_create_open(true)}>
                <UserCircleIcon className="w-4 h-4" />
                {t("common.create_multiple_contacts")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => {
                  set_tab("groups");
                  set_is_group_modal_open(true);
                }}
              >
                <PlusIcon className="w-4 h-4" />
                {t("common.add_group")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="contact_tab_strip px-4 pb-2" role="tablist">
        {tab_items.map((item) => (
          <button
            key={item.key}
            aria-selected={tab === item.key}
            className="contact_tab_pill"
            data-selected={tab === item.key}
            role="tab"
            type="button"
            onClick={() => set_tab(item.key)}
          >
            {item.label}
            {item.count > 0 && (
              <span className="contact_tab_pill_count tabular-nums">
                {format_number(item.count)}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === "contacts" && (
        <ContactGroupChips
          filter_by={filter_by}
          group_filter={group_filter}
          on_set_group_filter={on_set_group_filter}
          set_filter_by={set_filter_by}
          upcoming_birthdays_count={upcoming_birthdays_count}
        />
      )}

      <div
        className={cn(
          "flex min-h-0 flex-1 flex-col",
          tab === "trash" ? "" : "hidden",
        )}
      >
        <ContactTrashPane
          contacts={trashed_contacts}
          on_delete_forever={on_delete_forever}
          on_empty_trash={on_empty_trash}
          on_restore={on_restore_contact}
          search_query={search_query}
          t={t}
        />
      </div>

      <div
        className={cn(
          "flex min-h-0 flex-1 flex-col",
          tab === "groups" ? "" : "hidden",
        )}
      >
        <ContactGroupsPane
          contacts={contacts}
          is_modal_open={is_group_modal_open}
          on_compose_to={on_compose_to_recipients}
          on_count_change={handle_group_count_change}
          on_modal_close={() => set_is_group_modal_open(false)}
          on_modal_open={() => set_is_group_modal_open(true)}
          on_open_contact={set_selected_contact}
          search_query={search_query}
          t={t}
        />
      </div>

      <div
        className={cn(
          "flex min-h-0 flex-1 flex-col",
          is_list_tab ? "" : "hidden",
        )}
      >
        {show_birthday_card && (
          <div className="contact_suggestion_card mx-4 mt-1 mb-1 flex flex-shrink-0 items-start gap-2.5">
            <CakeIcon className="mt-[1px] h-4 w-4 flex-shrink-0 text-[var(--accent-color)]" />
            <div className="min-w-0 flex-1">
              <p className="text-[12.5px] font-medium text-txt-primary">
                {upcoming_birthdays_count > 0
                  ? t("common.birthdays_upcoming", {
                      count: upcoming_birthdays_count,
                    })
                  : t("common.add_birthdays")}
              </p>
              <p className="mt-0.5 text-[12px] leading-relaxed text-txt-muted">
                {t("common.add_birthdays_hint")}
              </p>
            </div>
            <button
              aria-label={t("common.dismiss")}
              className="quick_contacts_notice_link flex-shrink-0"
              type="button"
              onClick={dismiss_birthday_card}
            >
              <XMarkIcon className="h-4 w-4" />
            </button>
          </div>
        )}
        {tab === "contacts" && !has_selection && duplicate_count > 0 && (
          <div className="quick_contacts_notice mx-4 mt-1 mb-1 flex flex-shrink-0 items-center gap-2 rounded-[10px] px-3 py-2 text-[12.5px]">
            <span className="min-w-0 flex-1 truncate">
              {t("common.duplicates_found", { count: duplicate_count })}
            </span>
            <button
              className="quick_contacts_notice_link flex-shrink-0"
              type="button"
              onClick={open_merge_review}
            >
              {t("common.review_duplicates")}
            </button>
          </div>
        )}
        {has_selection ? (
          <div className="flex items-center gap-1 px-4 py-2 border-b border-edge-primary">
            <span className="text-[12px] tabular-nums font-medium text-txt-primary pe-2">
              {t("common.selected_count", {
                count: selection_state.selected_count,
              })}
            </span>
            <Tooltip tip={t("common.favorite")}>
              <button
                aria-label={t("common.favorite")}
                className="h-8 w-8 inline-flex items-center justify-center rounded-[8px] text-txt-secondary hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                type="button"
                onClick={on_toggle_favorite_selected}
              >
                {selected_all_favorited ? (
                  <StarIconSolid className="w-4 h-4 text-yellow-500" />
                ) : (
                  <StarIcon className="w-4 h-4" />
                )}
              </button>
            </Tooltip>
            <ManageGroupsMenu
              on_set_membership={on_set_group_membership}
              selected_contacts={selected_contacts}
            />
            <Tooltip tip={t("common.send_email")}>
              <button
                aria-label={t("common.send_email")}
                className="h-8 w-8 inline-flex items-center justify-center rounded-[8px] text-txt-secondary hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                type="button"
                onClick={on_compose_to_selected}
              >
                <EnvelopeIcon className="w-4 h-4" />
              </button>
            </Tooltip>
            <Tooltip tip={t("common.copy")}>
              <button
                aria-label={t("common.copy")}
                className="h-8 w-8 inline-flex items-center justify-center rounded-[8px] text-txt-secondary hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                type="button"
                onClick={on_copy_emails}
              >
                <ClipboardDocumentIcon className="w-4 h-4" />
              </button>
            </Tooltip>
            <Tooltip tip={t("common.export_all")}>
              <button
                aria-label={t("common.export_all")}
                className="h-8 w-8 inline-flex items-center justify-center rounded-[8px] text-txt-secondary hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                type="button"
                onClick={() => on_export_contacts(true)}
              >
                <ArrowDownTrayIcon className="w-4 h-4" />
              </button>
            </Tooltip>
            <Tooltip tip={t("common.delete")}>
              <button
                aria-label={t("common.delete")}
                className="h-8 w-8 inline-flex items-center justify-center rounded-[8px] text-red-500 hover:bg-red-500/10 transition-colors"
                type="button"
                onClick={on_delete_selected}
              >
                <TrashIcon className="w-4 h-4" />
              </button>
            </Tooltip>
          </div>
        ) : (
          <div className="flex items-center justify-between px-4 py-2 border-b border-edge-primary">
            <p className="text-[12px] text-txt-muted pe-3 flex-1">
              {t("settings.auto_save_recipients_to_contacts")}
            </p>
            <Switch
              aria-label={t("settings.auto_save_recipients_to_contacts")}
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
                  width: `${import_progress.total > 0 ? (import_progress.current / import_progress.total) * 100 : 0}%`,
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

        <div
          ref={list_container_ref}
          className="flex-1 overflow-y-auto px-2 py-2"
        >
          {is_loading ? (
            <div>
              {Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 px-3 py-1.5 my-0.5"
                >
                  <Skeleton className="w-10 h-10 flex-shrink-0 rounded-full" />
                  <div className="flex-1 min-w-0">
                    <Skeleton className="h-[14px] w-32 mb-1.5 rounded-[6px]" />
                    <Skeleton className="h-3 w-44 rounded-[6px]" />
                  </div>
                </div>
              ))}
            </div>
          ) : tab === "contacts" && contacts.length === 0 ? (
            <div className="contact_empty_state">
              <span className="contact_empty_state_glyph">
                <UserPlusIcon className="w-8 h-8" strokeWidth={1.25} />
              </span>
              <p className="text-[14px] font-medium mb-1 text-txt-primary">
                {t("common.no_contacts")}
              </p>
              <p className="text-[12.5px] max-w-[280px] mb-4 text-txt-muted">
                {t("common.add_contacts_hint")}
              </p>
              <Button size="md" onClick={on_add_click}>
                <PlusIcon className="w-3.5 h-3.5" />
                {t("common.add_contact")}
              </Button>
            </div>
          ) : visible_contacts.length === 0 ? (
            <div className="contact_empty_state">
              <span className="contact_empty_state_glyph">
                {search_query.trim() ? (
                  <MagnifyingGlassIcon className="w-8 h-8" strokeWidth={1.25} />
                ) : tab === "frequent" ? (
                  <SparklesIcon className="w-8 h-8" strokeWidth={1.25} />
                ) : (
                  <UserCircleIcon className="w-8 h-8" strokeWidth={1.25} />
                )}
              </span>
              <p className="text-[14px] font-medium mb-1 text-txt-primary">
                {search_query.trim()
                  ? t("common.no_results")
                  : tab === "frequent"
                    ? t("common.no_frequent_contacts")
                    : tab === "other"
                      ? t("common.no_other_contacts")
                      : t("common.no_results")}
              </p>
              <p className="text-[12.5px] max-w-[280px] text-txt-muted">
                {search_query.trim()
                  ? t("settings.try_different_search")
                  : tab === "frequent"
                    ? t("common.frequent_contacts_hint")
                    : tab === "other"
                      ? t("common.other_contacts_hint")
                      : t("settings.try_different_search")}
              </p>
            </div>
          ) : (
            visible_contacts.map((contact) => {
              const name = `${contact.first_name} ${contact.last_name}`.trim();
              const primary_email = contact.emails[0];
              const is_active = selected_contact?.id === contact.id;
              const is_selected = selected_ids.has(contact.id);
              const member_groups = (contact.groups || [])
                .map((group_id) => group_by_id.get(group_id))
                .filter((group): group is NonNullable<typeof group> => !!group);

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
                    "contact_row group/contact w-full flex items-center gap-3 px-3 my-0.5 rounded-[12px] text-start",
                    is_compact ? "py-1" : "py-1.5",
                  )}
                  data-active={is_active}
                  data-selected={is_selected}
                  onClick={() =>
                    set_selected_contact(is_active ? null : contact)
                  }
                >
                  <div
                    aria-label={t("mail.select")}
                    aria-pressed={is_selected}
                    className={cn(
                      "group/avatar aster_select_focus relative flex-shrink-0 cursor-pointer",
                      is_compact ? "w-8 h-8" : "w-10 h-10",
                    )}
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
                      size_px={avatar_px}
                    />
                    <div
                      className={cn(
                        "absolute inset-0 rounded-full flex items-center justify-center transition-opacity duration-150",
                        is_selected
                          ? "opacity-100 bg-[var(--accent-color)]"
                          : "opacity-0 group-hover/avatar:opacity-100 bg-black/30 dark:bg-white/20",
                      )}
                    >
                      <CheckIcon
                        className={cn(
                          "text-white",
                          is_compact ? "w-4 h-4" : "w-5 h-5",
                        )}
                      />
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    {name ? (
                      <>
                        <div className="flex items-center gap-1.5 min-w-0">
                          <p className="contact_row_name text-[14px] font-medium truncate text-txt-primary">
                            {name}
                          </p>
                          {contact.is_favorite && (
                            <StarIconSolid
                              aria-label={t("common.favorite")}
                              className="w-3.5 h-3.5 text-amber-400 flex-shrink-0"
                            />
                          )}
                          <GroupDots
                            groups={member_groups}
                            label={t("common.contact_groups")}
                          />
                        </div>
                        {primary_email && !is_compact && (
                          <p className="contact_row_sub text-[12px] truncate text-txt-muted">
                            {primary_email}
                          </p>
                        )}
                      </>
                    ) : (
                      <div className="flex items-center gap-1.5 min-w-0">
                        <p className="contact_row_name text-[14px] font-medium truncate text-txt-primary">
                          {primary_email || t("common.unnamed")}
                        </p>
                        <GroupDots
                          groups={member_groups}
                          label={t("common.contact_groups")}
                        />
                        {contact.is_favorite && (
                          <StarIconSolid
                            aria-label={t("common.favorite")}
                            className="w-3.5 h-3.5 text-amber-400 flex-shrink-0"
                          />
                        )}
                      </div>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      <ContactBulkCreateModal
        is_open={is_bulk_create_open}
        on_close={() => set_is_bulk_create_open(false)}
        on_create={on_bulk_create}
      />

      {merge_targets.length > 1 && (
        <ContactMergeModal
          contacts={merge_targets}
          on_close={() => set_merge_targets([])}
          on_merged={() => {
            set_merge_targets([]);
            on_contacts_refresh();
          }}
        />
      )}
    </div>
  );
}
