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
import type { ExternalKeyInfo } from "@/services/api/keys";
import type { TranslationKey } from "@/lib/i18n/types";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowDownTrayIcon,
  ArrowLeftIcon,
  ArrowUpTrayIcon,
  ArrowsRightLeftIcon,
  MagnifyingGlassIcon,
  EllipsisHorizontalIcon,
  EnvelopeIcon,
  ExclamationTriangleIcon,
  LockClosedIcon,
  LockOpenIcon,
  PencilIcon,
  PlusIcon,
  PrinterIcon,
  Square2StackIcon,
  TrashIcon,
  UserGroupIcon,
  UsersIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import {
  CheckIcon,
  StarIcon as StarSolidIcon,
} from "@heroicons/react/24/solid";
import { Button, Spinner, Tooltip } from "@aster/ui";

import { ContactAvatar } from "@/components/common/contacts/contact_avatar";
import { ContactGroupGlyph } from "@/components/common/contacts/contact_group_glyph";
import { ContactForm } from "@/components/contacts";
import { ContactImportModal } from "@/components/contacts/contact_import_modal";
import { ContactMergeModal } from "@/components/contacts/contact_merge_modal";
import { ContactGroupModal } from "@/components/contacts/contact_group_modal";
import { ContactGroupsPane } from "@/components/contacts/contact_groups_pane";
import { EncryptionInfoDropdown } from "@/components/common/encryption_info_dropdown";
import { ConfirmationModal } from "@/components/modals/confirmation_modal";
import { OpenFullIcon } from "@/components/common/open_full_icon";
import { show_toast } from "@/components/toast/simple_toast";
import { use_i18n } from "@/lib/i18n/context";
import { use_contact_groups } from "@/hooks/use_contact_groups";
import { app_locale } from "@/utils/date_format";
import { format_contact_date } from "@/utils/date_utils";
import { use_escape_layer } from "@/lib/overlay_layer_stack";
import { use_panel_inset } from "@/hooks/use_panel_inset";
import { use_auth } from "@/contexts/auth_context";
import {
  count_duplicate_contacts,
  find_duplicate_clusters,
} from "@/lib/contact_duplicates";
import { apply_server_group_membership } from "@/utils/contact_group_membership";
import { export_contacts_vcard } from "@/utils/contact_export";
import { print_contacts } from "@/utils/contact_print";
import {
  discover_external_keys_batch,
  format_fingerprint,
  get_key_source_label_key,
  has_pgp_key,
} from "@/services/api/keys";
import {
  add_contact_to_group,
  bulk_delete_contacts,
  create_contact_encrypted,
  decrypt_contacts,
  list_contacts,
  update_contact_encrypted,
} from "@/services/api/contacts";
import { is_contact_trashed } from "@/lib/contact_trash";

const RELOAD_INTERVAL_MS = 30000;
const CONTACT_PAGE_LIMIT = 200;
const MAX_CONTACT_PAGES = 25;
const RENDER_PAGE_SIZE = 40;
const RENDER_AHEAD_PX = 600;

type PanelTab = "contacts" | "groups";

interface QuickContactsPanelProps {
  is_open: boolean;
  is_top_inset: boolean;
  on_close: () => void;
  on_compose: (address: string) => void;
}

function display_name(contact: DecryptedContact) {
  const full = `${contact.first_name || ""} ${contact.last_name || ""}`.trim();

  return full || contact.emails[0] || "";
}

function haystack(contact: DecryptedContact) {
  return `${display_name(contact)} ${contact.emails.join(" ")} ${
    contact.company || ""
  }`.toLowerCase();
}

function format_address(contact: DecryptedContact) {
  const address = contact.address;

  if (!address) return "";

  return [
    address.street,
    address.city,
    address.state,
    address.postal_code,
    address.country,
  ]
    .filter(Boolean)
    .join(", ");
}

function ContactKeyLine({
  is_loading,
  key_info,
  t,
}: {
  is_loading: boolean;
  key_info: ExternalKeyInfo | null;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}) {
  if (is_loading) {
    return (
      <span className="mt-1 block text-[11px] text-txt-muted">
        {t("common.checking_for_keys")}
      </span>
    );
  }

  if (!key_info) {
    return (
      <span className="mt-1 flex items-center gap-1.5">
        <LockOpenIcon className="h-3 w-3 flex-shrink-0 text-txt-muted" />
        <span className="text-[11px] text-txt-muted">
          {t("common.no_published_key")}
        </span>
      </span>
    );
  }

  return (
    <span className="mt-1 flex items-start gap-1.5">
      <LockClosedIcon className="mt-0.5 h-3 w-3 flex-shrink-0 text-emerald-500" />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-mono text-[11px] text-txt-secondary">
          {format_fingerprint(key_info.fingerprint)}
        </span>
        <span className="block text-[11px] text-txt-muted">
          {t("settings.pgp_key_discovered_via", {
            source: t(get_key_source_label_key(key_info.source)),
          })}
        </span>
      </span>
    </span>
  );
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-3 py-2">
      <p className="text-[11px] font-medium uppercase tracking-wide text-txt-muted">
        {label}
      </p>
      <p className="mt-0.5 whitespace-pre-wrap break-words text-[13.5px] text-txt-primary">
        {value}
      </p>
    </div>
  );
}

function initial_of(contact: DecryptedContact) {
  const name = display_name(contact).trim();

  return name ? name[0].toUpperCase() : "#";
}

export function QuickContactsPanel({
  is_open,
  is_top_inset,
  on_close,
  on_compose,
}: QuickContactsPanelProps) {
  const { t } = use_i18n();
  const { has_keys } = use_auth();
  const navigate = useNavigate();
  const [contacts, set_contacts] = useState<DecryptedContact[]>([]);
  const [is_loading, set_is_loading] = useState(true);
  const [error, set_error] = useState<string | null>(null);
  const [query, set_query] = useState("");
  const [is_editor_open, set_is_editor_open] = useState(false);
  const [is_saving, set_is_saving] = useState(false);
  const [editor_contact, set_editor_contact] =
    useState<DecryptedContact | null>(null);
  const [is_import_open, set_is_import_open] = useState(false);
  const [detail_id, set_detail_id] = useState<string | null>(null);
  const [detail_keys, set_detail_keys] = useState<
    Record<string, ExternalKeyInfo>
  >({});
  const [is_keys_loading, set_is_keys_loading] = useState(false);
  const {
    groups,
    is_loading: is_groups_loading,
    fetch_groups,
    remove_group,
  } = use_contact_groups();
  const [is_group_modal_open, set_is_group_modal_open] = useState(false);
  const [group_to_edit, set_group_to_edit] = useState<ContactGroup | null>(
    null,
  );
  const [group_to_delete, set_group_to_delete] = useState<ContactGroup | null>(
    null,
  );
  const [is_group_busy, set_is_group_busy] = useState(false);
  const [active_tab, set_active_tab] = useState<PanelTab>("contacts");
  const [group_filter, set_group_filter] = useState<string | null>(null);
  const [selected_ids, set_selected_ids] = useState<Set<string>>(new Set());
  const [is_bulk_menu_open, set_is_bulk_menu_open] = useState(false);
  const [is_group_picker_open, set_is_group_picker_open] = useState(false);
  const [merge_targets, set_merge_targets] = useState<DecryptedContact[]>([]);
  const [is_bulk_busy, set_is_bulk_busy] = useState(false);
  const [is_confirm_delete_open, set_is_confirm_delete_open] = useState(false);
  const search_ref = useRef<HTMLInputElement>(null);
  const panel_ref = useRef<HTMLElement>(null);
  const scroll_ref = useRef<HTMLDivElement>(null);
  const sentinel_ref = useRef<HTMLDivElement>(null);
  const has_loaded_once = useRef(false);
  const is_loading_ref = useRef(false);
  const loaded_at_ref = useRef(0);

  const load = useCallback(async () => {
    if (is_loading_ref.current) return;
    if (!has_keys) {
      set_is_loading(false);
      set_error(t("common.failed_to_load_contacts"));

      return;
    }
    if (!has_loaded_once.current) set_is_loading(true);
    is_loading_ref.current = true;
    set_error(null);
    try {
      const collected: DecryptedContact[] = [];
      let cursor: string | undefined;

      for (let page = 0; page < MAX_CONTACT_PAGES; page += 1) {
        const response = await list_contacts({
          limit: CONTACT_PAGE_LIMIT,
          cursor,
        });

        if (response.error || !response.data) {
          if (page === 0) {
            set_error(response.error || t("common.failed_to_load_contacts"));

            return;
          }
          break;
        }

        collected.push(
          ...(await decrypt_contacts(response.data.items)).filter(
            (contact) => !is_contact_trashed(contact),
          ),
        );
        cursor = response.data.next_cursor ?? undefined;
        if (!response.data.has_more || !cursor) break;
      }

      set_contacts(collected);
      has_loaded_once.current = true;
      loaded_at_ref.current = Date.now();
      void apply_server_group_membership(collected).then((hydrated) => {
        if (hydrated !== collected) set_contacts(hydrated);
      });
    } catch {
      set_error(t("common.failed_to_load_contacts"));
    } finally {
      is_loading_ref.current = false;
      set_is_loading(false);
    }
  }, [has_keys, t]);

  useEffect(() => {
    if (!is_open) return;
    if (
      has_loaded_once.current &&
      Date.now() - loaded_at_ref.current < RELOAD_INTERVAL_MS
    ) {
      return;
    }
    load();
  }, [is_open, load]);

  useEffect(() => {
    if (is_open) return;
    set_is_editor_open(false);
    set_is_import_open(false);
    set_editor_contact(null);
    set_is_saving(false);
    set_query("");
    set_detail_id(null);
    set_is_group_modal_open(false);
    set_group_to_edit(null);
    set_group_to_delete(null);
    set_active_tab("contacts");
    set_group_filter(null);
    set_selected_ids(new Set());
    set_is_bulk_menu_open(false);
    set_is_group_picker_open(false);
    set_merge_targets([]);
  }, [is_open]);

  use_escape_layer(is_open, on_close, "quick_contacts_panel", false);
  use_panel_inset(is_open, panel_ref);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const in_group = group_filter
      ? contacts.filter((c) => (c.groups ?? []).includes(group_filter))
      : contacts;
    const matched = needle
      ? in_group.filter((c) => haystack(c).includes(needle))
      : in_group;

    return [...matched].sort((a, b) =>
      display_name(a).localeCompare(display_name(b)),
    );
  }, [contacts, group_filter, query]);

  const local_group_counts = useMemo(() => {
    const map = new Map<string, number>();

    for (const contact of contacts) {
      for (const group_id of contact.groups ?? []) {
        map.set(group_id, (map.get(group_id) ?? 0) + 1);
      }
    }

    return map;
  }, [contacts]);

  const group_count_of = useCallback(
    (group: ContactGroup) =>
      contacts.length > 0
        ? (local_group_counts.get(group.id) ?? 0)
        : group.contact_count,
    [contacts.length, local_group_counts],
  );

  const [render_limit, set_render_limit] = useState(RENDER_PAGE_SIZE);

  useEffect(() => {
    set_render_limit(RENDER_PAGE_SIZE);
    if (scroll_ref.current) scroll_ref.current.scrollTop = 0;
  }, [active_tab, group_filter, query, is_open, detail_id]);

  const rendered = useMemo(
    () => visible.slice(0, render_limit),
    [visible, render_limit],
  );

  const has_more_rendered = render_limit < visible.length;

  useEffect(() => {
    const root = scroll_ref.current;
    const sentinel = sentinel_ref.current;

    if (!root || !sentinel || !has_more_rendered) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        set_render_limit((limit) => limit + RENDER_PAGE_SIZE);
      },
      { root, rootMargin: `${RENDER_AHEAD_PX}px 0px` },
    );

    observer.observe(sentinel);

    return () => observer.disconnect();
  }, [has_more_rendered, rendered.length]);

  const detail_contact = useMemo(
    () => contacts.find((c) => c.id === detail_id) ?? null,
    [contacts, detail_id],
  );

  const open_detail = useCallback((contact: DecryptedContact) => {
    set_detail_id(contact.id);
  }, []);

  const close_detail = useCallback(() => {
    set_detail_id(null);
  }, []);

  useEffect(() => {
    if (!detail_contact || detail_contact.emails.length === 0) {
      set_detail_keys({});
      set_is_keys_loading(false);

      return;
    }

    let cancelled = false;

    set_detail_keys({});
    set_is_keys_loading(true);

    void discover_external_keys_batch(detail_contact.emails).then(
      (response) => {
        if (cancelled) return;

        const next: Record<string, ExternalKeyInfo> = {};

        for (const key_info of response.data ?? []) {
          if (has_pgp_key(key_info)) {
            next[key_info.email.toLowerCase()] = key_info;
          }
        }

        set_detail_keys(next);
        set_is_keys_loading(false);
      },
      () => {
        if (cancelled) return;

        set_detail_keys({});
        set_is_keys_loading(false);
      },
    );

    return () => {
      cancelled = true;
    };
  }, [detail_contact]);

  const open_new = useCallback(() => {
    set_editor_contact(null);
    set_is_editor_open(true);
  }, []);

  const open_edit = useCallback((contact: DecryptedContact) => {
    set_editor_contact(contact);
    set_is_editor_open(true);
  }, []);

  const close_editor = useCallback(() => {
    set_is_editor_open(false);
    set_editor_contact(null);
  }, []);

  const save_contact = useCallback(
    async (data: ContactFormData) => {
      set_is_saving(true);
      try {
        const response = editor_contact
          ? await update_contact_encrypted(editor_contact.id, data)
          : await create_contact_encrypted(data);

        if (response.error) {
          set_error(response.error);

          return;
        }
        set_is_editor_open(false);
        set_editor_contact(null);
        await load();
      } catch {
        set_error(t("common.failed_to_save_contact"));
      } finally {
        set_is_saving(false);
      }
    },
    [editor_contact, load, t],
  );

  const compose_to = useCallback(
    (address: string) => {
      on_compose(address);
    },
    [on_compose],
  );

  const copy_address = useCallback(
    async (address: string) => {
      try {
        await navigator.clipboard.writeText(address);
        show_toast(t("common.email_copied"), "success");
      } catch {
        show_toast(t("common.failed_to_copy"), "error");
      }
    },
    [t],
  );

  const open_full = useCallback(() => {
    navigate("/contacts");
    on_close();
  }, [navigate, on_close]);

  useEffect(() => {
    if (!is_open) return;
    void fetch_groups();
  }, [is_open, fetch_groups]);

  const duplicate_clusters = useMemo(
    () => find_duplicate_clusters(contacts),
    [contacts],
  );

  const duplicate_count = useMemo(
    () => count_duplicate_contacts(duplicate_clusters),
    [duplicate_clusters],
  );

  const selected_contacts = useMemo(
    () => contacts.filter((contact) => selected_ids.has(contact.id)),
    [contacts, selected_ids],
  );

  const toggle_selected = useCallback((id: string) => {
    set_selected_ids((prev) => {
      const next = new Set(prev);

      if (next.has(id)) next.delete(id);
      else next.add(id);

      return next;
    });
  }, []);

  const clear_selection = useCallback(() => {
    set_selected_ids(new Set());
    set_is_bulk_menu_open(false);
    set_is_group_picker_open(false);
  }, []);

  const select_all_visible = useCallback(() => {
    set_selected_ids((prev) => {
      if (prev.size === visible.length) return new Set();

      return new Set(visible.map((contact) => contact.id));
    });
  }, [visible]);

  const compose_selection = useCallback(() => {
    const addresses = selected_contacts
      .map((contact) => contact.emails[0])
      .filter(Boolean);

    if (addresses.length === 0) return;
    on_compose(addresses.join(", "));
    clear_selection();
  }, [clear_selection, on_compose, selected_contacts]);

  const group_names_by_id = useMemo(() => {
    const names: Record<string, string> = {};

    for (const group of groups) names[group.id] = group.name;

    return names;
  }, [groups]);

  const export_selection = useCallback(() => {
    if (selected_contacts.length === 0) return;
    export_contacts_vcard(selected_contacts, group_names_by_id);
    show_toast(
      t("common.contacts_exported", { count: selected_contacts.length }),
      "success",
    );
    set_is_bulk_menu_open(false);
  }, [group_names_by_id, selected_contacts, t]);

  const print_selection = useCallback(() => {
    if (selected_contacts.length === 0) return;
    print_contacts(selected_contacts, {
      title: t("common.contacts"),
      email: t("common.email"),
      phone: t("common.phone"),
      company: t("common.company"),
      job_title: t("common.job_title"),
      address: t("common.address"),
      birthday: t("common.birthday"),
      notes: t("common.notes"),
    });
    set_is_bulk_menu_open(false);
  }, [selected_contacts, t]);

  const delete_selection = useCallback(async () => {
    if (selected_contacts.length === 0 || is_bulk_busy) return;

    set_is_bulk_busy(true);
    try {
      const response = await bulk_delete_contacts({
        contact_ids: selected_contacts.map((contact) => contact.id),
      });

      if (response.error) {
        show_toast(response.error, "error");

        return;
      }
      show_toast(
        t("common.contacts_deleted", { count: selected_contacts.length }),
        "success",
      );
      clear_selection();
      set_is_confirm_delete_open(false);
      loaded_at_ref.current = 0;
      await load();
    } catch {
      show_toast(t("common.failed_to_delete_contacts"), "error");
    } finally {
      set_is_bulk_busy(false);
    }
  }, [clear_selection, is_bulk_busy, load, selected_contacts, t]);

  const add_selection_to_group = useCallback(
    async (group: ContactGroup) => {
      if (selected_contacts.length === 0 || is_bulk_busy) return;

      set_is_bulk_busy(true);
      try {
        const results = await Promise.all(
          selected_contacts.map((contact) =>
            add_contact_to_group(contact.id, group.id),
          ),
        );

        if (results.some((result) => result.error)) {
          show_toast(t("common.failed_to_add_to_group"), "error");

          return;
        }
        show_toast(
          t("common.added_to_group", {
            count: selected_contacts.length,
            name: group.name,
          }),
          "success",
        );
        clear_selection();
        void fetch_groups();
      } catch {
        show_toast(t("common.failed_to_add_to_group"), "error");
      } finally {
        set_is_bulk_busy(false);
      }
    },
    [clear_selection, fetch_groups, is_bulk_busy, selected_contacts, t],
  );

  const handle_group_created = useCallback(() => {
    show_toast(t("common.group_created"), "success");
    void fetch_groups();
  }, [fetch_groups, t]);

  const active_group = useMemo(
    () => groups.find((group) => group.id === group_filter) ?? null,
    [group_filter, groups],
  );

  const open_group = useCallback((group: ContactGroup) => {
    set_group_filter(group.id);
    set_active_tab("contacts");
    set_query("");
  }, []);

  const select_tab = useCallback(
    (tab: PanelTab) => {
      set_active_tab(tab);
      set_query("");
      clear_selection();
      if (tab === "groups") set_group_filter(null);
    },
    [clear_selection],
  );

  const confirm_delete_group = useCallback(async () => {
    if (!group_to_delete || is_group_busy) return;

    set_is_group_busy(true);

    const removed = await remove_group(group_to_delete.id);

    set_is_group_busy(false);

    if (!removed) {
      show_toast(t("common.failed_to_delete_group"), "error");

      return;
    }

    if (group_filter === group_to_delete.id) set_group_filter(null);
    set_group_to_delete(null);
    show_toast(t("common.group_deleted"), "success");
  }, [group_filter, group_to_delete, is_group_busy, remove_group, t]);

  const is_groups_tab = active_tab === "groups";
  const has_contacts = contacts.length > 0;
  const search_placeholder = is_groups_tab
    ? t("common.search_groups")
    : t("common.search_contacts");
  const selection_count = selected_ids.size;
  const all_visible_selected =
    visible.length > 0 &&
    visible.every((contact) => selected_ids.has(contact.id));
  const is_selecting = selection_count > 0;

  return (
    <>
      <aside
        ref={panel_ref}
        aria-label={t("common.contacts")}
        className={`quick_contacts_panel me-1 mb-1 w-[min(320px,78vw)] flex-shrink-0 flex-col overflow-hidden rounded-lg bg-surf-primary md:me-2 md:mb-2 md:w-[clamp(272px,23vw,320px)] md:rounded-xl ${
          is_open ? "flex" : "hidden"
        } ${is_top_inset ? "mt-1 md:mt-2" : ""}`}
      >
        {detail_contact ? (
          <div className="flex h-12 flex-shrink-0 items-center gap-1 ps-2 pe-2">
            <Tooltip position="bottom" tip={t("common.back")}>
              <Button
                aria-label={t("common.back")}
                className="h-8 w-8 flex-shrink-0 text-[var(--icon-muted)]"
                size="icon"
                variant="ghost"
                onClick={close_detail}
              >
                <ArrowLeftIcon className="h-4 w-4" />
              </Button>
            </Tooltip>
            <h2 className="flex-1 truncate text-[15px] font-medium text-txt-primary">
              {display_name(detail_contact)}
            </h2>
            <Tooltip position="bottom" tip={t("common.edit_contact")}>
              <Button
                aria-label={t("common.edit_contact")}
                className="h-8 w-8 flex-shrink-0 text-[var(--icon-muted)]"
                size="icon"
                variant="ghost"
                onClick={() => open_edit(detail_contact)}
              >
                <PencilIcon className="h-4 w-4" />
              </Button>
            </Tooltip>
            <Tooltip position="bottom" tip={t("common.close")}>
              <Button
                aria-label={t("common.close")}
                className="h-8 w-8 flex-shrink-0 text-[var(--icon-muted)]"
                size="icon"
                variant="ghost"
                onClick={on_close}
              >
                <XMarkIcon className="h-4 w-4" />
              </Button>
            </Tooltip>
          </div>
        ) : is_selecting ? (
          <div className="flex h-12 flex-shrink-0 items-center gap-1 ps-2 pe-2">
            <Tooltip position="bottom" tip={t("common.clear_selection")}>
              <Button
                aria-label={t("common.clear_selection")}
                className="h-8 w-8 flex-shrink-0 text-[var(--icon-muted)]"
                size="icon"
                variant="ghost"
                onClick={clear_selection}
              >
                <XMarkIcon className="h-4 w-4" />
              </Button>
            </Tooltip>
            <span className="flex-1 truncate text-[13.5px] font-medium text-txt-primary">
              {t("common.selected_count", { count: selection_count })}
            </span>
            <Tooltip position="bottom" tip={t("common.compose_to_selection")}>
              <Button
                aria-label={t("common.compose_to_selection")}
                className="h-8 w-8 flex-shrink-0 text-[var(--icon-muted)]"
                size="icon"
                variant="ghost"
                onClick={compose_selection}
              >
                <EnvelopeIcon className="h-4 w-4" />
              </Button>
            </Tooltip>
            <div className="relative">
              <Tooltip position="bottom" tip={t("common.add_to_group")}>
                <Button
                  aria-label={t("common.add_to_group")}
                  className="h-8 w-8 flex-shrink-0 text-[var(--icon-muted)]"
                  size="icon"
                  variant="ghost"
                  onClick={() => {
                    set_is_bulk_menu_open(false);
                    set_is_group_picker_open((open) => !open);
                  }}
                >
                  <UserGroupIcon className="h-4 w-4" />
                </Button>
              </Tooltip>
              {is_group_picker_open && (
                <div className="quick_contacts_menu absolute end-0 top-9 z-20 max-h-64 w-56 overflow-y-auto rounded-xl py-1">
                  {groups.length === 0 ? (
                    <p className="px-3 py-2 text-[12.5px] text-txt-muted">
                      {t("common.no_groups_yet")}
                    </p>
                  ) : (
                    groups.map((group) => (
                      <button
                        key={group.id}
                        className="quick_contacts_menu_item flex w-full items-center gap-2 px-3 py-2 text-start text-[13px]"
                        disabled={is_bulk_busy}
                        type="button"
                        onClick={() => add_selection_to_group(group)}
                      >
                        <ContactGroupGlyph
                          color={group.color}
                          icon={group.icon}
                        />
                        <span className="truncate">{group.name}</span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
            <Tooltip position="bottom" tip={t("common.delete_contacts")}>
              <Button
                aria-label={t("common.delete_contacts")}
                className="h-8 w-8 flex-shrink-0 text-[var(--icon-muted)]"
                disabled={is_bulk_busy}
                size="icon"
                variant="ghost"
                onClick={() => set_is_confirm_delete_open(true)}
              >
                <TrashIcon className="h-4 w-4" />
              </Button>
            </Tooltip>
            <div className="relative">
              <Tooltip position="bottom" tip={t("common.more_actions")}>
                <Button
                  aria-label={t("common.more_actions")}
                  className="h-8 w-8 flex-shrink-0 text-[var(--icon-muted)]"
                  size="icon"
                  variant="ghost"
                  onClick={() => {
                    set_is_group_picker_open(false);
                    set_is_bulk_menu_open((open) => !open);
                  }}
                >
                  <EllipsisHorizontalIcon className="h-4 w-4" />
                </Button>
              </Tooltip>
              {is_bulk_menu_open && (
                <div className="quick_contacts_menu absolute end-0 top-9 z-20 w-56 rounded-xl py-1">
                  <button
                    className="quick_contacts_menu_item flex w-full items-center gap-2 px-3 py-2 text-start text-[13px] disabled:opacity-40"
                    disabled={selection_count < 2}
                    type="button"
                    onClick={() => {
                      set_merge_targets(selected_contacts);
                      set_is_bulk_menu_open(false);
                    }}
                  >
                    <ArrowsRightLeftIcon className="h-4 w-4 flex-shrink-0" />
                    {t("common.merge_contacts")}
                  </button>
                  <button
                    className="quick_contacts_menu_item flex w-full items-center gap-2 px-3 py-2 text-start text-[13px]"
                    type="button"
                    onClick={export_selection}
                  >
                    <ArrowDownTrayIcon className="h-4 w-4 flex-shrink-0" />
                    {t("common.export_selection_vcf")}
                  </button>
                  <button
                    className="quick_contacts_menu_item flex w-full items-center gap-2 px-3 py-2 text-start text-[13px]"
                    type="button"
                    onClick={print_selection}
                  >
                    <PrinterIcon className="h-4 w-4 flex-shrink-0" />
                    {t("common.print_contacts")}
                  </button>
                  <button
                    className="quick_contacts_menu_item flex w-full items-center gap-2 px-3 py-2 text-start text-[13px]"
                    data-destructive="true"
                    disabled={is_bulk_busy}
                    type="button"
                    onClick={() => {
                      set_is_bulk_menu_open(false);
                      set_is_confirm_delete_open(true);
                    }}
                  >
                    <TrashIcon className="h-4 w-4 flex-shrink-0" />
                    {t("common.delete_contacts")}
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex h-12 flex-shrink-0 items-center gap-1 ps-3 pe-2">
            <div className="quick_contacts_search flex h-8 min-w-0 flex-1 items-center gap-2 rounded-full px-3">
              <MagnifyingGlassIcon className="h-4 w-4 flex-shrink-0 text-txt-muted" />
              <input
                ref={search_ref}
                aria-label={search_placeholder}
                className="min-w-0 flex-1 bg-transparent text-[13.5px] text-txt-primary outline-none placeholder:text-txt-muted"
                placeholder={search_placeholder}
                type="text"
                value={query}
                onChange={(e) => set_query(e.target.value)}
              />
              {query.length > 0 && (
                <button
                  aria-label={t("common.clear")}
                  className="quick_contacts_search_clear flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full"
                  type="button"
                  onClick={() => set_query("")}
                >
                  <XMarkIcon className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center">
              <EncryptionInfoDropdown
                description_key="common.only_you_can_read_contacts"
                has_pq_protection={true}
                is_external={false}
                size={15}
              />
            </span>
            <Tooltip
              position="bottom"
              tip={
                is_groups_tab ? t("common.new_group") : t("common.add_contact")
              }
            >
              <Button
                aria-label={
                  is_groups_tab
                    ? t("common.new_group")
                    : t("common.add_contact")
                }
                className="h-8 w-8 flex-shrink-0 text-[var(--icon-muted)]"
                size="icon"
                variant="ghost"
                onClick={() => {
                  if (!is_groups_tab) {
                    open_new();

                    return;
                  }
                  set_group_to_edit(null);
                  set_is_group_modal_open(true);
                }}
              >
                <PlusIcon className="h-4 w-4" />
              </Button>
            </Tooltip>
            <Tooltip position="bottom" tip={t("common.close")}>
              <Button
                aria-label={t("common.close")}
                className="h-8 w-8 flex-shrink-0 text-[var(--icon-muted)]"
                size="icon"
                variant="ghost"
                onClick={on_close}
              >
                <XMarkIcon className="h-4 w-4" />
              </Button>
            </Tooltip>
          </div>
        )}

        {!detail_contact && (
          <div className="quick_contacts_tabs flex h-10 flex-shrink-0 items-stretch gap-2 px-3">
            <button
              aria-selected={!is_groups_tab}
              className="quick_contacts_tab flex items-center gap-1.5 px-1.5 text-[13px] font-medium"
              role="tab"
              type="button"
              onClick={() => select_tab("contacts")}
            >
              {t("common.contacts")}
              {has_contacts && (
                <span className="quick_contacts_tab_count text-[13px] font-extrabold">
                  {contacts.length.toLocaleString(app_locale())}
                </span>
              )}
            </button>
            <button
              aria-selected={is_groups_tab}
              className="quick_contacts_tab flex items-center gap-1.5 px-1.5 text-[13px] font-medium"
              role="tab"
              type="button"
              onClick={() => select_tab("groups")}
            >
              {t("common.groups")}
              {groups.length > 0 && (
                <span className="quick_contacts_tab_count text-[13px] font-extrabold">
                  {groups.length.toLocaleString(app_locale())}
                </span>
              )}
            </button>
            <span className="flex-1" />
            {!is_groups_tab && has_contacts && (
              <span className="flex items-center">
                <Tooltip
                  position="bottom"
                  tip={
                    all_visible_selected
                      ? t("common.clear_selection")
                      : t("common.select_all")
                  }
                >
                  <button
                    aria-checked={all_visible_selected}
                    aria-label={
                      all_visible_selected
                        ? t("common.clear_selection")
                        : t("common.select_all")
                    }
                    className="quick_contacts_select_all flex h-8 w-8 items-center justify-center rounded-full"
                    role="checkbox"
                    type="button"
                    onClick={
                      all_visible_selected
                        ? clear_selection
                        : select_all_visible
                    }
                  >
                    <span
                      aria-hidden
                      className="quick_contacts_select_box flex h-[18px] w-[18px] items-center justify-center rounded-[5px]"
                      data-checked={all_visible_selected}
                    >
                      {all_visible_selected && (
                        <CheckIcon className="h-3 w-3" strokeWidth={3} />
                      )}
                    </span>
                  </button>
                </Tooltip>
              </span>
            )}
          </div>
        )}

        {!detail_contact && active_group && (
          <div className="quick_contacts_notice mx-2 mt-2 flex flex-shrink-0 items-center gap-2 rounded-lg px-2.5 py-1.5 text-[12.5px]">
            <ContactGroupGlyph
              color={active_group.color}
              icon={active_group.icon}
            />
            <span className="min-w-0 flex-1 truncate">{active_group.name}</span>
            <button
              className="quick_contacts_notice_link flex-shrink-0"
              type="button"
              onClick={() => set_group_filter(null)}
            >
              {t("common.clear")}
            </button>
          </div>
        )}

        {!detail_contact &&
          !is_groups_tab &&
          !is_selecting &&
          duplicate_count > 0 && (
            <div className="quick_contacts_notice mx-2 mt-2 flex flex-shrink-0 items-center gap-2 rounded-lg px-2.5 py-1.5 text-[12.5px]">
              <span className="min-w-0 flex-1 truncate">
                {t("common.duplicates_found", { count: duplicate_count })}
              </span>
              <button
                className="quick_contacts_notice_link flex-shrink-0"
                type="button"
                onClick={() =>
                  set_merge_targets(duplicate_clusters[0]?.contacts ?? [])
                }
              >
                {t("common.review_duplicates")}
              </button>
            </div>
          )}

        <div
          ref={scroll_ref}
          className="flex min-h-0 flex-1 flex-col overflow-y-auto px-2"
        >
          {is_groups_tab && !detail_contact ? (
            <ContactGroupsPane
              count_of={group_count_of}
              groups={groups}
              is_loading={is_groups_loading}
              on_create={() => {
                set_group_to_edit(null);
                set_is_group_modal_open(true);
              }}
              on_delete={set_group_to_delete}
              on_edit={(group) => {
                set_group_to_edit(group);
                set_is_group_modal_open(true);
              }}
              on_open={open_group}
              query={query}
            />
          ) : detail_contact ? (
            <div className="pb-2">
              <div className="flex flex-col items-center px-3 pt-4 text-center">
                <ContactAvatar
                  avatar_url={detail_contact.avatar_url}
                  email={detail_contact.emails[0]}
                  name={display_name(detail_contact)}
                  profile_color={detail_contact.profile_color}
                  size_px={64}
                />
                <div className="mt-3 flex items-center gap-1.5">
                  <p className="truncate text-[15px] font-medium text-txt-primary">
                    {display_name(detail_contact)}
                  </p>
                  {detail_contact.is_favorite && (
                    <StarSolidIcon
                      className="h-3.5 w-3.5 flex-shrink-0"
                      style={{ color: "var(--star-color, #f5b301)" }}
                    />
                  )}
                </div>
                {(detail_contact.job_title || detail_contact.company) && (
                  <p className="mt-0.5 text-[12.5px] text-txt-muted">
                    {[detail_contact.job_title, detail_contact.company]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                )}
                {detail_contact.emails[0] && (
                  <div className="mt-3 flex items-center gap-1.5">
                    <button
                      className="quick_contacts_cta flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-medium"
                      type="button"
                      onClick={() => compose_to(detail_contact.emails[0])}
                    >
                      <EnvelopeIcon className="h-3.5 w-3.5" />
                      {t("common.compose_new_email")}
                    </button>
                  </div>
                )}
              </div>
              <div className="mt-4">
                {detail_contact.emails.length > 0 && (
                  <div className="flex items-center gap-1.5 px-3 pb-1">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-txt-muted">
                      {t("settings.encryption")}
                    </span>
                    <EncryptionInfoDropdown
                      description_key="common.contact_encryption_info"
                      has_pq_protection={true}
                      is_external={false}
                      size={13}
                    />
                  </div>
                )}
                {detail_contact.emails.map((address) => (
                  <button
                    key={address}
                    aria-label={t("common.copy_address")}
                    className="quick_contacts_row group flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2 text-start"
                    title={t("common.copy_address")}
                    type="button"
                    onClick={() => copy_address(address)}
                  >
                    <ContactAvatar
                      className="flex-shrink-0"
                      email={address}
                      size_px={28}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] text-txt-primary">
                        {address}
                      </span>
                      <ContactKeyLine
                        is_loading={is_keys_loading}
                        key_info={detail_keys[address.toLowerCase()] ?? null}
                        t={t}
                      />
                    </span>
                    <Square2StackIcon className="h-4 w-4 flex-shrink-0 text-txt-muted opacity-0 transition-opacity group-hover:opacity-100" />
                  </button>
                ))}
                {detail_contact.phone && (
                  <DetailField
                    label={t("common.phone")}
                    value={detail_contact.phone}
                  />
                )}
                {detail_contact.company && (
                  <DetailField
                    label={t("common.company")}
                    value={detail_contact.company}
                  />
                )}
                {detail_contact.job_title && (
                  <DetailField
                    label={t("common.job_title")}
                    value={detail_contact.job_title}
                  />
                )}
                {detail_contact.birthday && (
                  <DetailField
                    label={t("common.birthday")}
                    value={format_contact_date(detail_contact.birthday)}
                  />
                )}
                {format_address(detail_contact) && (
                  <DetailField
                    label={t("common.address")}
                    value={format_address(detail_contact)}
                  />
                )}
                {detail_contact.notes && (
                  <DetailField
                    label={t("common.notes")}
                    value={detail_contact.notes}
                  />
                )}
              </div>
            </div>
          ) : is_loading ? (
            <div className="flex flex-1 items-center justify-center">
              <Spinner />
            </div>
          ) : error ? (
            <div className="contact_empty_state">
              <span className="contact_empty_state_glyph">
                <ExclamationTriangleIcon strokeWidth={1.25} />
              </span>
              <p className="contact_empty_state_title">{error}</p>
              <button
                className="quick_contacts_cta contact_empty_state_action rounded-full px-4 py-1.5 text-[13px] font-medium"
                type="button"
                onClick={load}
              >
                {t("common.retry")}
              </button>
            </div>
          ) : !has_contacts ? (
            <div className="contact_empty_state">
              <span className="contact_empty_state_glyph">
                <UsersIcon strokeWidth={1.25} />
              </span>
              <p className="contact_empty_state_title">
                {t("common.no_contacts_yet")}
              </p>
              <p className="contact_empty_state_text">
                {t("common.add_contacts_hint")}
              </p>
              <button
                className="quick_contacts_cta contact_empty_state_action flex items-center gap-1.5 rounded-full py-2 ps-3 pe-4 text-[13.5px] font-medium"
                type="button"
                onClick={open_new}
              >
                <PlusIcon className="h-4 w-4" />
                {t("common.add_contact")}
              </button>
            </div>
          ) : visible.length === 0 ? (
            <div className="contact_empty_state">
              <span className="contact_empty_state_glyph">
                <MagnifyingGlassIcon strokeWidth={1.25} />
              </span>
              <p className="contact_empty_state_title">
                {t("common.no_results")}
              </p>
              <p className="contact_empty_state_text">
                {t("common.no_contacts_match", { query: query.trim() })}
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-1 pt-1">
              {rendered.map((contact, index) => {
                const letter = initial_of(contact);
                const show_letter =
                  index === 0 || initial_of(rendered[index - 1]) !== letter;

                return (
                  <div key={contact.id} className="flex flex-col gap-1">
                    {show_letter && (
                      <p className="px-3 pb-0.5 pt-2 text-[11px] font-medium uppercase tracking-wide text-txt-muted">
                        {letter}
                      </p>
                    )}
                    <div
                      className="quick_contacts_row group flex items-center gap-2.5 rounded-[10px] py-1.5 pe-1 ps-2"
                      data-selected={selected_ids.has(contact.id)}
                    >
                      <button
                        aria-label={
                          selected_ids.has(contact.id)
                            ? t("common.deselect_contact")
                            : t("common.select_contact")
                        }
                        aria-pressed={selected_ids.has(contact.id)}
                        className="quick_contacts_avatar_button relative flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center rounded-full"
                        type="button"
                        onClick={() => toggle_selected(contact.id)}
                      >
                        {selected_ids.has(contact.id) ? (
                          <span className="quick_contacts_select_dot flex h-[30px] w-[30px] items-center justify-center rounded-full">
                            <CheckIcon className="h-4 w-4" />
                          </span>
                        ) : (
                          <>
                            <ContactAvatar
                              avatar_url={contact.avatar_url}
                              email={contact.emails[0]}
                              name={display_name(contact)}
                              profile_color={contact.profile_color}
                              size_px={30}
                            />
                            <span
                              aria-hidden
                              className="quick_contacts_avatar_hint absolute inset-0 flex items-center justify-center rounded-full"
                            >
                              <CheckIcon className="h-4 w-4" />
                            </span>
                          </>
                        )}
                      </button>
                      <button
                        className="quick_contacts_row_open flex min-w-0 flex-1 items-center gap-2.5 text-start"
                        type="button"
                        onClick={() =>
                          is_selecting
                            ? toggle_selected(contact.id)
                            : open_detail(contact)
                        }
                      >
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1">
                            <span className="truncate text-[13.5px] text-txt-primary">
                              {display_name(contact)}
                            </span>
                            {contact.is_favorite && (
                              <StarSolidIcon
                                className="h-3 w-3 flex-shrink-0"
                                style={{ color: "var(--star-color, #f5b301)" }}
                              />
                            )}
                          </span>
                          {contact.emails[0] &&
                            contact.emails[0] !== display_name(contact) && (
                              <span className="block truncate text-[12px] text-txt-muted">
                                {contact.emails[0]}
                              </span>
                            )}
                        </span>
                      </button>
                      <span className="flex flex-shrink-0 items-center opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                        {contact.emails[0] && (
                          <>
                            <Tooltip
                              position="top"
                              tip={t("common.copy_address")}
                            >
                              <button
                                aria-label={t("common.copy_address")}
                                className="quick_contacts_action flex h-7 w-7 items-center justify-center rounded-full"
                                type="button"
                                onClick={() => copy_address(contact.emails[0])}
                              >
                                <Square2StackIcon className="h-4 w-4" />
                              </button>
                            </Tooltip>
                            <Tooltip
                              position="top"
                              tip={t("common.compose_new_email")}
                            >
                              <button
                                aria-label={t("common.compose_new_email")}
                                className="quick_contacts_action flex h-7 w-7 items-center justify-center rounded-full"
                                type="button"
                                onClick={() => compose_to(contact.emails[0])}
                              >
                                <EnvelopeIcon className="h-4 w-4" />
                              </button>
                            </Tooltip>
                          </>
                        )}
                        <Tooltip position="top" tip={t("common.edit_contact")}>
                          <button
                            aria-label={t("common.edit_contact")}
                            className="quick_contacts_action flex h-7 w-7 items-center justify-center rounded-full"
                            type="button"
                            onClick={() => open_edit(contact)}
                          >
                            <PencilIcon className="h-4 w-4" />
                          </button>
                        </Tooltip>
                      </span>
                    </div>
                  </div>
                );
              })}
              {has_more_rendered && (
                <div ref={sentinel_ref} aria-hidden className="h-8" />
              )}
            </div>
          )}
        </div>

        <div className="quick_contacts_footer flex h-11 flex-shrink-0 items-center gap-1 px-2">
          <button
            className="quick_contacts_link flex min-w-0 items-center gap-1.5 rounded-full px-2 py-1 text-[12.5px]"
            type="button"
            onClick={() => set_is_import_open(true)}
          >
            <ArrowUpTrayIcon className="h-3.5 w-3.5 flex-shrink-0" />
            <span className="truncate">{t("common.import_contacts")}</span>
          </button>
          <span className="flex-1" />
          <button
            className="quick_contacts_link flex min-w-0 items-center gap-1.5 rounded-full px-2 py-1 text-[12.5px]"
            type="button"
            onClick={open_full}
          >
            <OpenFullIcon className="h-3.5 w-3.5 flex-shrink-0" />
            <span className="truncate">{t("common.open_contacts")}</span>
          </button>
        </div>
      </aside>

      <ConfirmationModal
        cancel_text={t("common.cancel")}
        confirm_text={t("common.delete_contacts")}
        is_loading={is_bulk_busy}
        is_open={is_confirm_delete_open}
        message={t("common.delete_contacts_confirm", {
          count: selection_count,
        })}
        on_cancel={() => set_is_confirm_delete_open(false)}
        on_confirm={delete_selection}
        title={t("common.delete_contacts")}
        variant="danger"
      />

      {merge_targets.length > 1 && (
        <ContactMergeModal
          contacts={merge_targets}
          on_close={() => set_merge_targets([])}
          on_merged={() => {
            set_merge_targets([]);
            clear_selection();
            loaded_at_ref.current = 0;
            void load();
          }}
        />
      )}

      {is_import_open && (
        <ContactImportModal
          on_close={() => set_is_import_open(false)}
          on_import_complete={(count) => {
            set_is_import_open(false);
            if (count > 0) void load();
          }}
        />
      )}

      <ContactGroupModal
        existing_count={groups.length}
        group={group_to_edit}
        is_open={is_group_modal_open}
        on_close={() => {
          set_is_group_modal_open(false);
          set_group_to_edit(null);
        }}
        on_created={handle_group_created}
        on_saved={() => {
          set_is_group_modal_open(false);
          set_group_to_edit(null);
          void fetch_groups();
        }}
      />

      <ConfirmationModal
        cancel_text={t("common.cancel")}
        confirm_text={t("common.delete_group")}
        is_loading={is_group_busy}
        is_open={group_to_delete !== null}
        message={t("common.delete_group_confirmation", {
          name: group_to_delete?.name ?? "",
        })}
        on_cancel={() => set_group_to_delete(null)}
        on_confirm={confirm_delete_group}
        title={t("common.delete_group")}
        variant="danger"
      />

      <ContactForm
        contact={editor_contact}
        is_loading={is_saving}
        is_open={is_editor_open}
        on_close={close_editor}
        on_submit={save_contact}
      />
    </>
  );
}
