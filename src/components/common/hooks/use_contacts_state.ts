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
import type { DecryptedContact, ContactFormData } from "@/types/contacts";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useSearchParams } from "react-router-dom";

import {
  list_contacts,
  create_contact_encrypted,
  update_contact_encrypted,
  delete_contact as api_delete_contact,
  decrypt_contacts,
} from "@/services/api/contacts";
import { use_i18n } from "@/lib/i18n/context";
import { show_toast } from "@/components/toast/simple_toast";
import { use_shift_key_ref } from "@/lib/use_shift_range_select";
import { use_auth } from "@/contexts/auth_context";
import { get_days_until_birthday } from "@/utils/contact_utils";
import {
  parse_csv_contacts,
  import_contacts_batched,
} from "@/components/common/contacts/contact_import_handler";

export type SortOption = "name_asc" | "name_desc" | "company" | "recent";
export type FilterOption =
  | "all"
  | "favorites"
  | "has_email"
  | "has_phone"
  | "has_company"
  | "upcoming_birthdays";
export type ViewMode = "list" | "compact";

const BATCH_SIZE = 10;

function contact_to_form_data(contact: DecryptedContact): ContactFormData {
  const {
    id: _id,
    created_at: _created_at,
    updated_at: _updated_at,
    last_contacted: _last_contacted,
    email_count: _email_count,
    ...rest
  } = contact;

  void _id;
  void _created_at;
  void _updated_at;
  void _last_contacted;
  void _email_count;

  return rest;
}

export function use_contacts_state() {
  const { t } = use_i18n();
  const { has_keys } = use_auth();
  const [search_params, set_search_params] = useSearchParams();
  const [contacts, set_contacts] = useState<DecryptedContact[]>([]);
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

  const filtered_contacts = useMemo(() => {
    let result = [...contacts];

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
          case "upcoming_birthdays":
            if (!contact.birthday) return false;
            const days = get_days_until_birthday(contact.birthday);

            return days <= 30;
          default:
            return true;
        }
      });
    }

    if (search_query.trim()) {
      const query = search_query.toLowerCase();

      result = result.filter((contact) => {
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
        const haystack = parts.join("  ").toLowerCase();

        return haystack.includes(query);
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
  }, [contacts, search_query, sort_by, filter_by]);

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

  const selected_all_favorited = useMemo(() => {
    if (selected_ids.size === 0) return false;
    const selected_contacts = contacts.filter((c) => selected_ids.has(c.id));

    return selected_contacts.every((c) => c.is_favorite);
  }, [contacts, selected_ids]);

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
      set_is_loading(false);

      return;
    }

    try {
      set_error(null);
      const response = await list_contacts({ limit: 100 });

      if (response.error || !response.data) {
        set_error(response.error || t("common.failed_to_fetch_contacts"));
        set_is_loading(false);

        return;
      }
      const decrypted = await decrypt_contacts(response.data.items);

      set_contacts(decrypted);
    } catch (err) {
      set_error(
        err instanceof Error
          ? err.message
          : t("common.failed_to_fetch_contacts"),
      );
    } finally {
      set_is_loading(false);
    }
  }, [has_keys]);

  useEffect(() => {
    fetch_contacts();
  }, [fetch_contacts]);

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
      set_import_progress(null);
    } catch (err) {
      set_error(
        err instanceof Error
          ? err.message
          : t("common.failed_to_import_contacts"),
      );
    } finally {
      set_is_importing(false);
      if (file_input_ref.current) {
        file_input_ref.current.value = "";
      }
    }
  };

  const [is_creating_new, set_is_creating_new] = useState(false);

  const handle_add_click = useCallback(() => {
    set_selected_contact(null);
    set_is_creating_new(true);
  }, []);

  const handle_cancel_create = useCallback(() => {
    set_is_creating_new(false);
  }, []);

  const handle_inline_create = useCallback(
    async (data: ContactFormData): Promise<void> => {
      set_is_submitting(true);
      set_error(null);

      try {
        const response = await create_contact_encrypted(data);

        if (response.error || !response.data) {
          set_error(response.error || t("common.failed_to_create_contact"));
          show_toast(t("common.failed_to_create_contact"), "error");

          return;
        }
        const new_contact: DecryptedContact = {
          ...data,
          id: response.data.id,
          is_favorite: data.is_favorite ?? false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        set_contacts((prev) => [...prev, new_contact]);
        set_is_creating_new(false);
        set_selected_contact(new_contact);
        show_toast(t("common.contact_created"), "success");
      } catch (err) {
        set_error(
          err instanceof Error
            ? err.message
            : t("common.failed_to_create_contact"),
        );
        show_toast(t("common.failed_to_create_contact"), "error");
      } finally {
        set_is_submitting(false);
      }
    },
    [t],
  );

  const handle_edit = useCallback((contact: DecryptedContact) => {
    set_editing_contact(contact);
    set_is_form_open(true);
  }, []);

  const handle_delete_request = useCallback((contact: DecryptedContact) => {
    set_contact_to_delete(contact);
  }, []);

  const handle_confirm_delete = useCallback(async () => {
    if (!contact_to_delete) return;

    try {
      const response = await api_delete_contact(contact_to_delete.id);

      if (response.error) {
        set_error(response.error);
        show_toast(t("common.failed_to_delete_contact"), "error");

        return;
      }
      set_contacts((prev) => prev.filter((c) => c.id !== contact_to_delete.id));
      set_selected_ids((prev) => {
        const new_set = new Set(prev);

        new_set.delete(contact_to_delete.id);

        return new_set;
      });
      if (selected_contact?.id === contact_to_delete.id) {
        set_selected_contact(null);
      }
      show_toast(t("common.contact_deleted"), "success");
    } catch (err) {
      set_error(
        err instanceof Error
          ? err.message
          : t("common.failed_to_delete_contact"),
      );
      show_toast(t("common.failed_to_delete_contact"), "error");
    } finally {
      set_contact_to_delete(null);
    }
  }, [contact_to_delete, selected_contact, t]);

  const handle_form_submit = useCallback(
    async (data: ContactFormData) => {
      set_is_submitting(true);
      set_error(null);

      try {
        if (editing_contact) {
          const response = await update_contact_encrypted(
            editing_contact.id,
            data,
          );

          if (response.error) {
            set_error(response.error);
            set_is_submitting(false);

            return;
          }
          const updated_contact: DecryptedContact = {
            ...editing_contact,
            ...data,
            is_favorite: data.is_favorite ?? editing_contact.is_favorite,
            updated_at: new Date().toISOString(),
          };

          set_contacts((prev) =>
            prev.map((c) =>
              c.id === editing_contact.id ? updated_contact : c,
            ),
          );
          if (selected_contact?.id === editing_contact.id) {
            set_selected_contact(updated_contact);
          }
        } else {
          const response = await create_contact_encrypted(data);

          if (response.error || !response.data) {
            set_error(response.error || t("common.failed_to_create_contact"));
            set_is_submitting(false);

            return;
          }
          const new_contact: DecryptedContact = {
            ...data,
            id: response.data.id,
            is_favorite: data.is_favorite ?? false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };

          set_contacts((prev) => [...prev, new_contact]);
        }

        set_is_form_open(false);
        set_editing_contact(null);
      } catch (err) {
        set_error(
          err instanceof Error
            ? err.message
            : t("common.failed_to_save_contact"),
        );
      } finally {
        set_is_submitting(false);
      }
    },
    [editing_contact, selected_contact],
  );

  const handle_inline_save = useCallback(
    async (contact: DecryptedContact, data: ContactFormData) => {
      set_is_submitting(true);
      set_error(null);

      try {
        const response = await update_contact_encrypted(contact.id, data);

        if (response.error) {
          set_error(response.error);
          show_toast(t("common.failed_to_save_contact"), "error");

          return;
        }
        const updated_contact: DecryptedContact = {
          ...contact,
          ...data,
          is_favorite: data.is_favorite ?? contact.is_favorite,
          updated_at: new Date().toISOString(),
        };

        set_contacts((prev) =>
          prev.map((c) => (c.id === contact.id ? updated_contact : c)),
        );
        if (selected_contact?.id === contact.id) {
          set_selected_contact(updated_contact);
        }
        show_toast(t("common.contact_saved"), "success");
      } catch (err) {
        set_error(
          err instanceof Error
            ? err.message
            : t("common.failed_to_save_contact"),
        );
        show_toast(t("common.failed_to_save_contact"), "error");
      } finally {
        set_is_submitting(false);
      }
    },
    [selected_contact, t],
  );

  const handle_toggle_favorite_single = useCallback(
    async (contact: DecryptedContact) => {
      const new_state = !contact.is_favorite;

      set_contacts((prev) =>
        prev.map((c) =>
          c.id === contact.id ? { ...c, is_favorite: new_state } : c,
        ),
      );
      set_selected_contact((prev) =>
        prev && prev.id === contact.id
          ? { ...prev, is_favorite: new_state }
          : prev,
      );
      show_toast(
        new_state
          ? t("common.added_to_favorites")
          : t("common.removed_from_favorites"),
        "success",
      );

      try {
        const response = await update_contact_encrypted(contact.id, {
          ...contact_to_form_data(contact),
          is_favorite: new_state,
        });

        if (response.error) {
          throw new Error(response.error);
        }
      } catch {
        set_contacts((prev) =>
          prev.map((c) =>
            c.id === contact.id ? { ...c, is_favorite: !new_state } : c,
          ),
        );
        set_selected_contact((prev) =>
          prev && prev.id === contact.id
            ? { ...prev, is_favorite: !new_state }
            : prev,
        );
        show_toast(t("common.failed_to_save_contact"), "error");
      }
    },
    [t],
  );

  const handle_form_close = useCallback(() => {
    set_is_form_open(false);
    set_editing_contact(null);
  }, []);

  const handle_compose_email = useCallback(
    (email: string) => {
      if (is_compose_open) {
        set_compose_recipients((prev) => {
          const existing = prev
            .split(",")
            .map((e) => e.trim())
            .filter(Boolean);

          if (existing.includes(email)) return prev;

          return [...existing, email].join(", ");
        });
      } else {
        set_compose_recipients(email);
        set_is_compose_open(true);
      }
    },
    [is_compose_open],
  );

  const handle_toggle_select_all = useCallback(() => {
    const filtered_ids = filtered_contacts.map((c) => c.id);
    const all_filtered_selected = filtered_ids.every((id) =>
      selected_ids.has(id),
    );

    if (all_filtered_selected) {
      set_selected_ids((prev) => {
        const new_set = new Set(prev);

        for (const id of filtered_ids) {
          new_set.delete(id);
        }

        return new_set;
      });
    } else {
      set_selected_ids((prev) => {
        const new_set = new Set(prev);

        for (const id of filtered_ids) {
          new_set.add(id);
        }

        return new_set;
      });
    }
  }, [filtered_contacts, selected_ids]);

  const handle_delete_selected = useCallback(() => {
    if (selected_ids.size === 0) return;
    set_is_bulk_deleting(true);
  }, [selected_ids]);

  const handle_confirm_bulk_delete = useCallback(async () => {
    if (selected_ids.size === 0) return;

    const ids_to_delete = Array.from(selected_ids);
    const delete_count = ids_to_delete.length;

    set_contacts((prev) => prev.filter((c) => !selected_ids.has(c.id)));
    set_selected_ids(new Set());
    if (selected_contact && selected_ids.has(selected_contact.id)) {
      set_selected_contact(null);
    }
    set_is_bulk_deleting(false);

    try {
      for (let i = 0; i < ids_to_delete.length; i += BATCH_SIZE) {
        const batch = ids_to_delete.slice(i, i + BATCH_SIZE);

        await Promise.allSettled(batch.map((id) => api_delete_contact(id)));
      }
      show_toast(
        t("common.contacts_deleted", { count: delete_count }),
        "success",
      );
    } catch (err) {
      show_toast(
        err instanceof Error
          ? err.message
          : t("common.failed_to_delete_contacts"),
        "error",
      );
    }
  }, [selected_ids, selected_contact, t]);

  const handle_compose_to_selected = useCallback(() => {
    const selected_contacts = contacts.filter((c) => selected_ids.has(c.id));
    const emails = selected_contacts
      .flatMap((c) => c.emails)
      .filter((e) => e)
      .slice(0, 10);

    if (emails.length > 0) {
      set_compose_recipients(emails.join(", "));
      set_is_compose_open(true);
    }
  }, [contacts, selected_ids]);

  const handle_toggle_favorite_selected = useCallback(async () => {
    if (selected_ids.size === 0) return;

    const selected_contacts = contacts.filter((c) => selected_ids.has(c.id));
    const all_favorited = selected_contacts.every((c) => c.is_favorite);
    const new_favorite_state = !all_favorited;
    const contacts_to_update = selected_contacts.filter(
      (contact) => contact.is_favorite !== new_favorite_state,
    );
    const update_count = contacts_to_update.length;

    set_contacts((prev) =>
      prev.map((c) =>
        selected_ids.has(c.id)
          ? { ...c, is_favorite: new_favorite_state }
          : c,
      ),
    );

    try {
      for (let i = 0; i < contacts_to_update.length; i += BATCH_SIZE) {
        const batch = contacts_to_update.slice(i, i + BATCH_SIZE);

        await Promise.allSettled(
          batch.map((contact) =>
            update_contact_encrypted(contact.id, {
              ...contact_to_form_data(contact),
              is_favorite: new_favorite_state,
            }),
          ),
        );
      }
      if (update_count > 0) {
        show_toast(
          t(
            new_favorite_state
              ? "common.contacts_starred"
              : "common.contacts_unstarred",
            { count: update_count },
          ),
          "success",
        );
      }
    } catch (err) {
      set_contacts((prev) =>
        prev.map((c) =>
          contacts_to_update.find((u) => u.id === c.id)
            ? { ...c, is_favorite: !new_favorite_state }
            : c,
        ),
      );
      show_toast(
        err instanceof Error
          ? err.message
          : t("common.failed_to_update_favorites"),
        "error",
      );
    }
  }, [contacts, selected_ids, t]);

  const handle_export_contacts = useCallback(
    (export_selected: boolean) => {
      const contacts_to_export = export_selected
        ? contacts.filter((c) => selected_ids.has(c.id))
        : contacts;

      if (contacts_to_export.length === 0) return;

      const csv_headers = [
        t("common.first_name"),
        t("common.last_name"),
        t("common.email"),
        t("common.phone"),
        t("common.company"),
        t("common.job_title"),
        t("common.street"),
        t("common.city"),
        t("common.state"),
        t("common.postal_code"),
        t("common.country"),
        t("common.birthday"),
        t("common.notes"),
        t("common.favorite"),
      ];

      const escape_csv_cell = (value: string): string => {
        const safe =
          value.length > 0 && /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;

        return `"${safe.replace(/"/g, '""')}"`;
      };

      const csv_rows = contacts_to_export.map((contact) => [
        contact.first_name,
        contact.last_name,
        contact.emails.join("; "),
        contact.phone || "",
        contact.company || "",
        contact.job_title || "",
        contact.address?.street || "",
        contact.address?.city || "",
        contact.address?.state || "",
        contact.address?.postal_code || "",
        contact.address?.country || "",
        contact.birthday || "",
        contact.notes || "",
        contact.is_favorite ? t("common.yes") : t("common.no"),
      ]);

      const csv_content = [
        csv_headers.map(escape_csv_cell).join(","),
        ...csv_rows.map((row) => row.map(escape_csv_cell).join(",")),
      ].join("\r\n");

      const blob = new Blob([csv_content], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = url;
      link.download = `contacts_${new Date().toISOString().split("T")[0]}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    },
    [contacts, selected_ids],
  );

  const handle_copy_emails = useCallback(() => {
    const selected_contacts = contacts.filter((c) => selected_ids.has(c.id));
    const emails = selected_contacts.flatMap((c) => c.emails).filter((e) => e);

    if (emails.length > 0) {
      navigator.clipboard.writeText(emails.join(", ")).catch(() => {});
      set_copied_field("bulk-emails");
      if (copy_timeout_ref.current) {
        clearTimeout(copy_timeout_ref.current);
      }
      copy_timeout_ref.current = setTimeout(() => {
        set_copied_field(null);
      }, 2000);
    }
  }, [contacts, selected_ids]);

  const handle_copy = useCallback(async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text);
      set_copied_field(field);
      if (copy_timeout_ref.current) {
        clearTimeout(copy_timeout_ref.current);
      }
      copy_timeout_ref.current = setTimeout(() => {
        set_copied_field(null);
      }, 2000);
    } catch (error) {
      if (import.meta.env.DEV) console.error(error);

      return;
    }
  }, []);

  return {
    t,
    contacts,
    search_query,
    set_search_query,
    is_form_open,
    editing_contact,
    selected_contact,
    set_selected_contact,
    contact_to_delete,
    set_contact_to_delete,
    is_submitting,
    is_loading,
    error,
    selected_ids,
    is_bulk_deleting,
    set_is_bulk_deleting,
    sort_by,
    set_sort_by,
    filter_by,
    set_filter_by,
    copied_field,
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
    search_input_ref,
    file_input_ref,
    list_container_ref,
    contact_refs,
    filtered_contacts,
    selection_state,
    has_selection,
    selected_all_favorited,
    filter_label,
    alphabetical_index,
    upcoming_birthdays_count,
    sort_label,
    fetch_contacts,
    scroll_to_letter,
    handle_import_csv,
    handle_add_click,
    handle_edit,
    handle_delete_request,
    handle_confirm_delete,
    handle_form_submit,
    handle_inline_save,
    handle_inline_create,
    handle_cancel_create,
    is_creating_new,
    handle_form_close,
    handle_compose_email,
    handle_toggle_select,
    handle_toggle_select_all,
    handle_delete_selected,
    handle_confirm_bulk_delete,
    handle_compose_to_selected,
    handle_toggle_favorite_selected,
    handle_toggle_favorite_single,
    handle_export_contacts,
    handle_copy_emails,
    handle_copy,
  };
}
