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
import type { Contact, DecryptedContact } from "@/types/contacts";
import type {
  FilterOption,
  SortOption,
  ViewMode,
} from "./contacts_state_helpers";

import {
  useState,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
} from "react";
import { useSearchParams } from "react-router-dom";

import {
  list_contacts,
  decrypt_contacts,
  delete_contact as api_delete_contact,
} from "@/services/api/contacts";
import {
  is_contact_trash_expired,
  is_contact_trashed,
} from "@/lib/contact_trash";
import { use_i18n } from "@/lib/i18n/context";
import { use_shift_key_ref } from "@/lib/use_shift_range_select";
import { use_auth } from "@/contexts/auth_context";
import { get_days_until_birthday } from "@/utils/contact_utils";
import {
  parse_csv_contacts,
  import_contacts_batched,
} from "@/components/common/contacts/contact_import_handler";

const CONTACT_PAGE_LIMIT = 100;
const MAX_CONTACT_PAGES = 100;

function build_contact_haystack(contact: DecryptedContact): string {
  const parts: string[] = [
    contact.first_name,
    contact.last_name,
    contact.middle_name || "",
    contact.nickname || "",
    contact.phonetic_first_name || "",
    contact.phonetic_middle_name || "",
    contact.phonetic_last_name || "",
    contact.title || "",
    contact.name_suffix || "",
    contact.company || "",
    contact.job_title || "",
    contact.role || "",
    contact.department || "",
    contact.notes || "",
    contact.comment || "",
    contact.pronouns || "",
    (contact.emails || []).join(" "),
    (contact.email_entries || []).map((e) => e.value).join(" "),
    contact.phone || "",
    (contact.phone_entries || []).map((p) => p.value).join(" "),
    (contact.related_people || []).map((r) => r.value).join(" "),
    (contact.social_networks || []).map((s) => s.value).join(" "),
    (contact.websites || []).map((w) => w.value).join(" "),
    (contact.instant_messengers || []).map((m) => m.value).join(" "),
  ];

  return parts.join(" \x01 ").toLowerCase();
}

export function use_contacts_data() {
  const { t } = use_i18n();
  const { has_keys } = use_auth();
  const [search_params, set_search_params] = useSearchParams();
  const [contacts, set_contacts] = useState<DecryptedContact[]>([]);
  const [trashed_contacts, set_trashed_contacts] = useState<DecryptedContact[]>(
    [],
  );
  const [search_query, set_search_query] = useState("");
  const [is_form_open, set_is_form_open] = useState(false);
  const [editing_contact, set_editing_contact] =
    useState<DecryptedContact | null>(null);
  const [selected_contact, set_selected_contact] =
    useState<DecryptedContact | null>(null);
  const [contact_to_delete, set_contact_to_delete] =
    useState<DecryptedContact | null>(null);
  const [is_submitting, set_is_submitting] = useState(false);
  const [is_loading, set_is_loading] = useState(true);
  const [error, set_error] = useState<string | null>(null);
  const [selected_ids, set_selected_ids] = useState<Set<string>>(new Set());
  const [is_bulk_deleting, set_is_bulk_deleting] = useState(false);
  const [sort_by, set_sort_by] = useState<SortOption>("name_asc");
  const [filter_by, set_filter_by] = useState<FilterOption>("all");
  const [group_filter, set_group_filter] = useState<string | null>(null);
  const [copied_field, set_copied_field] = useState<string | null>(null);
  const [view_mode, set_view_mode] = useState<ViewMode>("list");
  const [focused_index, set_focused_index] = useState<number>(-1);
  const [is_importing, set_is_importing] = useState(false);
  const [import_progress, set_import_progress] = useState<{
    current: number;
    total: number;
  } | null>(null);
  const [is_compose_open, set_is_compose_open] = useState(false);
  const [compose_recipients, set_compose_recipients] = useState<string>("");
  const [is_import_modal_open, set_is_import_modal_open] = useState(false);
  const [show_history, set_show_history] = useState(false);
  const copy_timeout_ref = useRef<NodeJS.Timeout | null>(null);
  const search_input_ref = useRef<HTMLInputElement>(null);
  const file_input_ref = useRef<HTMLInputElement>(null);
  const list_container_ref = useRef<HTMLDivElement>(null);
  const contact_refs = useRef<Map<string, HTMLDivElement>>(new Map());

  const search_haystacks = useMemo(() => {
    const map = new Map<DecryptedContact, string>();

    for (const contact of contacts) {
      map.set(contact, build_contact_haystack(contact));
    }

    return map;
  }, [contacts]);

  const sorted_contacts = useMemo(() => {
    let result = [...contacts];

    if (group_filter) {
      result = result.filter((contact) =>
        (contact.groups || []).includes(group_filter),
      );
    }

    if (filter_by !== "all") {
      result = result.filter((contact) => {
        switch (filter_by) {
          case "favorites":
            return contact.is_favorite;
          case "has_email":
            return contact.emails.length > 0 && contact.emails[0];
          case "has_phone":
            return !!contact.phone;
          case "has_company":
            return !!contact.company;
          case "upcoming_birthdays": {
            if (!contact.birthday) return false;
            const days = get_days_until_birthday(contact.birthday);

            return days <= 30;
          }
          default:
            return true;
        }
      });
    }

    result.sort((a, b) => {
      if (sort_by !== "recent") {
        if (a.is_favorite !== b.is_favorite) return a.is_favorite ? -1 : 1;
      }

      switch (sort_by) {
        case "name_asc": {
          const name_a = `${a.first_name} ${a.last_name}`.toLowerCase();
          const name_b = `${b.first_name} ${b.last_name}`.toLowerCase();

          return name_a.localeCompare(name_b);
        }
        case "name_desc": {
          const name_a = `${a.first_name} ${a.last_name}`.toLowerCase();
          const name_b = `${b.first_name} ${b.last_name}`.toLowerCase();

          return name_b.localeCompare(name_a);
        }
        case "last_name_asc": {
          const name_a = `${a.last_name} ${a.first_name}`.trim().toLowerCase();
          const name_b = `${b.last_name} ${b.first_name}`.trim().toLowerCase();

          return name_a.localeCompare(name_b);
        }
        case "last_name_desc": {
          const name_a = `${a.last_name} ${a.first_name}`.trim().toLowerCase();
          const name_b = `${b.last_name} ${b.first_name}`.trim().toLowerCase();

          return name_b.localeCompare(name_a);
        }
        case "company": {
          const comp_a = (a.company || "").toLowerCase();
          const comp_b = (b.company || "").toLowerCase();

          if (!comp_a && comp_b) return 1;
          if (comp_a && !comp_b) return -1;

          return comp_a.localeCompare(comp_b);
        }
        case "recent": {
          const date_a = new Date(a.created_at).getTime();
          const date_b = new Date(b.created_at).getTime();

          return date_b - date_a;
        }
        default:
          return 0;
      }
    });

    return result;
  }, [contacts, sort_by, filter_by, group_filter]);

  const deferred_search_query = useDeferredValue(search_query);

  const filtered_contacts = useMemo(() => {
    const query = deferred_search_query.trim().toLowerCase();

    if (!query) return sorted_contacts;

    return sorted_contacts.filter((contact) =>
      (search_haystacks.get(contact) ?? "").includes(query),
    );
  }, [sorted_contacts, deferred_search_query, search_haystacks]);

  const selection_state = useMemo(() => {
    const filtered_ids = new Set(filtered_contacts.map((c) => c.id));
    const selected_in_view = [...selected_ids].filter((id) =>
      filtered_ids.has(id),
    );
    const selected_count = selected_in_view.length;
    const all_selected =
      filtered_contacts.length > 0 &&
      selected_count === filtered_contacts.length;
    const some_selected =
      selected_count > 0 && selected_count < filtered_contacts.length;

    return { selected_count, all_selected, some_selected };
  }, [filtered_contacts, selected_ids]);

  const has_selection =
    selection_state.all_selected || selection_state.some_selected;

  const selected_contacts = useMemo(
    () => contacts.filter((contact) => selected_ids.has(contact.id)),
    [contacts, selected_ids],
  );

  const selected_all_favorited = useMemo(() => {
    if (selected_contacts.length === 0) return false;

    return selected_contacts.every((c) => c.is_favorite);
  }, [selected_contacts]);

  const filter_label = useMemo(() => {
    switch (filter_by) {
      case "favorites":
        return t("common.favorites");
      case "has_email":
        return t("common.has_email");
      case "has_phone":
        return t("common.has_phone");
      case "has_company":
        return t("common.has_company");
      case "upcoming_birthdays":
        return t("common.birthday");
      default:
        return t("mail.all");
    }
  }, [filter_by, t]);

  const alphabetical_index = useMemo(() => {
    const index: Map<string, number> = new Map();

    filtered_contacts.forEach((contact, i) => {
      const first_char = (contact.first_name || contact.last_name || "")
        .charAt(0)
        .toUpperCase();
      const letter = /[A-Z]/.test(first_char) ? first_char : "#";

      if (!index.has(letter)) {
        index.set(letter, i);
      }
    });

    return index;
  }, [filtered_contacts]);

  const upcoming_birthdays_count = useMemo(() => {
    return contacts.filter((c) => {
      if (!c.birthday) return false;

      return get_days_until_birthday(c.birthday) <= 30;
    }).length;
  }, [contacts]);

  const sort_label = useMemo(() => {
    switch (sort_by) {
      case "name_asc":
        return t("common.name") + " A-Z";
      case "name_desc":
        return t("common.name") + " Z-A";
      case "last_name_asc":
        return t("common.last_name") + " A-Z";
      case "last_name_desc":
        return t("common.last_name") + " Z-A";
      case "company":
        return t("common.company");
      case "recent":
        return t("common.recently_added");
      default:
        return t("common.sort");
    }
  }, [sort_by, t]);

  const fetch_contacts = useCallback(async () => {
    if (!has_keys) {
      set_is_loading(true);

      return;
    }

    try {
      set_error(null);
      const items: Contact[] = [];
      let cursor: string | undefined;

      for (let page = 0; page < MAX_CONTACT_PAGES; page += 1) {
        const response = await list_contacts({
          limit: CONTACT_PAGE_LIMIT,
          cursor,
        });

        if (response.error || !response.data) {
          set_error(response.error || t("common.failed_to_fetch_contacts"));
          set_is_loading(false);

          return;
        }
        items.push(...response.data.items);
        if (!response.data.has_more || !response.data.next_cursor) break;
        cursor = response.data.next_cursor;
      }
      const decrypted = await decrypt_contacts(items, true);
      const active: DecryptedContact[] = [];
      const trashed: DecryptedContact[] = [];

      for (const contact of decrypted) {
        if (!is_contact_trashed(contact)) {
          active.push(contact);

          continue;
        }
        if (is_contact_trash_expired(contact.deleted_at as string)) {
          api_delete_contact(contact.id).catch(() => undefined);

          continue;
        }
        trashed.push(contact);
      }

      set_contacts(active);
      set_trashed_contacts(trashed);
    } catch (err) {
      set_error(
        err instanceof Error
          ? err.message
          : t("common.failed_to_fetch_contacts"),
      );
    } finally {
      set_is_loading(false);
    }
  }, [has_keys, t]);

  useEffect(() => {
    fetch_contacts();
  }, [fetch_contacts]);

  useEffect(() => {
    const group_param = search_params.get("group");

    set_group_filter(group_param || null);
  }, [search_params]);

  const handle_set_group_filter = useCallback(
    (group_id: string | null) => {
      set_group_filter(group_id);
      set_search_params(
        (prev) => {
          const next = new URLSearchParams(prev);

          if (group_id) {
            next.set("group", group_id);
          } else {
            next.delete("group");
          }

          return next;
        },
        { replace: true },
      );
    },
    [set_search_params],
  );

  useEffect(() => {
    const contact_id = search_params.get("contact_id");

    if (contact_id && contacts.length > 0 && !selected_contact) {
      const contact = contacts.find((c) => c.id === contact_id);

      if (contact) {
        set_selected_contact(contact);
        set_search_params({}, { replace: true });
      }
    }
  }, [contacts, search_params, set_search_params, selected_contact]);

  useEffect(() => {
    return () => {
      if (copy_timeout_ref.current) {
        clearTimeout(copy_timeout_ref.current);
      }
    };
  }, []);

  const shift_ref = use_shift_key_ref();
  const last_selected_id_ref = useRef<string | null>(null);
  const filtered_contacts_ref = useRef(filtered_contacts);

  filtered_contacts_ref.current = filtered_contacts;

  const handle_toggle_select = useCallback(
    (id: string) => {
      const shift = shift_ref.current;
      const last_id = last_selected_id_ref.current;
      const items = filtered_contacts_ref.current;

      set_selected_ids((prev) => {
        const new_set = new Set(prev);

        if (shift && last_id !== null && last_id !== id) {
          const last_index = items.findIndex((c) => c.id === last_id);
          const current_index = items.findIndex((c) => c.id === id);

          if (last_index !== -1 && current_index !== -1) {
            const start = Math.min(last_index, current_index);
            const end = Math.max(last_index, current_index);
            const should_select = prev.has(last_id);

            for (let i = start; i <= end; i++) {
              const item_id = items[i].id;

              if (should_select) {
                new_set.add(item_id);
              } else {
                new_set.delete(item_id);
              }
            }

            last_selected_id_ref.current = id;

            return new_set;
          }
        }

        if (new_set.has(id)) {
          new_set.delete(id);
        } else {
          new_set.add(id);
        }

        last_selected_id_ref.current = id;

        return new_set;
      });
    },
    [shift_ref],
  );

  useEffect(() => {
    const handle_keydown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const is_input =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable;

      if (e["key"] === "/" && !is_input) {
        e.preventDefault();
        search_input_ref.current?.focus();

        return;
      }

      if (e["key"] === "Escape") {
        if (search_query) {
          set_search_query("");
          search_input_ref.current?.blur();
        } else if (selected_contact) {
          set_selected_contact(null);
        } else if (selected_ids.size > 0) {
          set_selected_ids(new Set());
        }
        set_focused_index(-1);

        return;
      }

      if (is_input) return;

      if (e["key"] === "j" || e["key"] === "ArrowDown") {
        e.preventDefault();
        set_focused_index((prev) => {
          const next = Math.min(prev + 1, filtered_contacts.length - 1);
          const contact = filtered_contacts[next];

          if (contact) {
            const el = contact_refs.current.get(contact.id);

            el?.scrollIntoView({ block: "nearest" });
          }

          return next;
        });

        return;
      }

      if (e["key"] === "k" || e["key"] === "ArrowUp") {
        e.preventDefault();
        set_focused_index((prev) => {
          const next = Math.max(prev - 1, 0);
          const contact = filtered_contacts[next];

          if (contact) {
            const el = contact_refs.current.get(contact.id);

            el?.scrollIntoView({ block: "nearest" });
          }

          return next;
        });

        return;
      }

      if (e["key"] === "Enter" && focused_index >= 0) {
        e.preventDefault();
        const contact = filtered_contacts[focused_index];

        if (contact) {
          set_selected_contact(contact);
        }

        return;
      }

      if (e["key"] === "e" && focused_index >= 0) {
        e.preventDefault();
        const contact = filtered_contacts[focused_index];

        if (contact?.emails[0]) {
          set_compose_recipients(contact.emails[0]);
          set_is_compose_open(true);
        }

        return;
      }

      if (e["key"] === "x" && focused_index >= 0) {
        e.preventDefault();
        const contact = filtered_contacts[focused_index];

        if (contact) {
          handle_toggle_select(contact.id);
        }

        return;
      }

      if (e["key"] === "n" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        set_editing_contact(null);
        set_is_form_open(true);

        return;
      }
    };

    window.addEventListener("keydown", handle_keydown);

    return () => window.removeEventListener("keydown", handle_keydown);
  }, [
    filtered_contacts,
    focused_index,
    search_query,
    selected_contact,
    selected_ids,
    handle_toggle_select,
  ]);

  const scroll_to_letter = useCallback(
    (letter: string) => {
      const index = alphabetical_index.get(letter);

      if (index !== undefined) {
        const contact = filtered_contacts[index];

        if (contact) {
          const el = contact_refs.current.get(contact.id);

          el?.scrollIntoView({ block: "start", behavior: "smooth" });
          set_focused_index(index);
        }
      }
    },
    [alphabetical_index, filtered_contacts],
  );

  const handle_import_csv = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];

    if (!file) return;

    set_is_importing(true);
    set_error(null);

    try {
      const text = await file.text();
      const { contacts: contacts_to_import, error: parse_error } =
        parse_csv_contacts(text);

      if (parse_error === "csv_empty") {
        set_error(t("common.csv_file_empty"));
        set_is_importing(false);

        return;
      }

      if (parse_error === "csv_too_large") {
        set_error(t("common.csv_too_large"));
        set_is_importing(false);

        return;
      }

      if (parse_error === "no_valid_contacts") {
        set_error(t("common.no_valid_contacts_csv"));
        set_is_importing(false);

        return;
      }

      set_import_progress({ current: 0, total: contacts_to_import.length });

      const imported_contacts = await import_contacts_batched(
        contacts_to_import,
        (current, total) => {
          set_import_progress({ current, total });
        },
      );

      set_contacts((prev) => [...prev, ...imported_contacts]);

      if (imported_contacts.length === 0 && contacts_to_import.length > 0) {
        set_error(t("common.failed_to_import_contacts"));
      } else if (imported_contacts.length < contacts_to_import.length) {
        set_error(
          t("common.contacts_import_partial", {
            imported: imported_contacts.length,
            total: contacts_to_import.length,
          }),
        );
      }
    } catch (err) {
      set_error(
        err instanceof Error
          ? err.message
          : t("common.failed_to_import_contacts"),
      );
    } finally {
      set_import_progress(null);
      set_is_importing(false);
      if (file_input_ref.current) {
        file_input_ref.current.value = "";
      }
    }
  };

  const [is_creating_new, set_is_creating_new] = useState(false);

  return {
    t,
    contacts,
    set_contacts,
    trashed_contacts,
    set_trashed_contacts,
    search_query,
    set_search_query,
    is_form_open,
    set_is_form_open,
    editing_contact,
    set_editing_contact,
    selected_contact,
    set_selected_contact,
    contact_to_delete,
    set_contact_to_delete,
    is_submitting,
    set_is_submitting,
    is_loading,
    error,
    set_error,
    selected_ids,
    set_selected_ids,
    is_bulk_deleting,
    set_is_bulk_deleting,
    sort_by,
    set_sort_by,
    filter_by,
    set_filter_by,
    group_filter,
    set_group_filter,
    handle_set_group_filter,
    copied_field,
    set_copied_field,
    view_mode,
    set_view_mode,
    focused_index,
    is_importing,
    import_progress,
    is_compose_open,
    set_is_compose_open,
    compose_recipients,
    set_compose_recipients,
    is_import_modal_open,
    set_is_import_modal_open,
    show_history,
    set_show_history,
    copy_timeout_ref,
    search_input_ref,
    file_input_ref,
    list_container_ref,
    contact_refs,
    filtered_contacts,
    selection_state,
    has_selection,
    selected_contacts,
    selected_all_favorited,
    filter_label,
    alphabetical_index,
    upcoming_birthdays_count,
    sort_label,
    fetch_contacts,
    handle_toggle_select,
    scroll_to_letter,
    handle_import_csv,
    is_creating_new,
    set_is_creating_new,
  };
}
