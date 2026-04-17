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

import { useState, useCallback, useEffect, useRef, useMemo } from "react";

import {
  list_contacts,
  create_contact_encrypted,
  update_contact_encrypted,
  delete_contact as api_delete_contact,
  decrypt_contacts,
} from "@/services/api/contacts";
import { emit_contacts_changed } from "@/hooks/mail_events";
import { use_auth } from "@/contexts/auth_context";
import { use_i18n } from "@/lib/i18n/context";
import { use_shift_key_ref } from "@/lib/use_shift_range_select";

const BATCH_SIZE = 10;

export function use_contacts_modal({
  is_open,
  on_close,
  on_compose_to,
}: {
  is_open: boolean;
  on_close: () => void;
  on_compose_to?: (email: string) => void;
}) {
  const { t } = use_i18n();
  const { has_keys } = use_auth();
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
  const [copied_field, set_copied_field] = useState<string | null>(null);
  const [selected_ids, set_selected_ids] = useState<Set<string>>(new Set());
  const [is_bulk_deleting, set_is_bulk_deleting] = useState(false);
  const [sort_by, set_sort_by] = useState<
    "name_asc" | "name_desc" | "company" | "recent"
  >("name_asc");
  const [filter_by, set_filter_by] = useState<
    "all" | "favorites" | "has_email" | "has_phone" | "has_company"
  >("all");
  const copy_timeout_ref = useRef<NodeJS.Timeout | null>(null);
  const search_input_ref = useRef<HTMLInputElement>(null);

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
          default:
            return true;
        }
      });
    }

    if (search_query.trim()) {
      const query = search_query.toLowerCase();

      result = result.filter((contact) => {
        const full_name =
          `${contact.first_name} ${contact.last_name}`.toLowerCase();
        const emails = contact.emails.join(" ").toLowerCase();
        const company = (contact.company || "").toLowerCase();

        return (
          full_name.includes(query) ||
          emails.includes(query) ||
          company.includes(query)
        );
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

  const fetch_contacts = useCallback(async () => {
    if (!has_keys || !is_open) {
      set_is_loading(false);

      return;
    }

    try {
      set_error(null);
      set_is_loading(true);
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
  }, [has_keys, is_open]);

  useEffect(() => {
    if (is_open) {
      fetch_contacts();
      set_selected_contact(null);
      set_search_query("");
      set_selected_ids(new Set());
      setTimeout(() => search_input_ref.current?.focus(), 100);
    }
  }, [is_open, fetch_contacts]);

  useEffect(() => {
    return () => {
      if (copy_timeout_ref.current) {
        clearTimeout(copy_timeout_ref.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!is_open) return;
    const handle_keydown = (e: KeyboardEvent) => {
      if (e["key"] === "Escape" && !is_form_open && !contact_to_delete) {
        if (selected_contact) {
          set_selected_contact(null);
        } else {
          on_close();
        }
      }
      if ((e.metaKey || e.ctrlKey) && e["key"] === "n" && !is_form_open) {
        e.preventDefault();
        handle_add_click();
      }
    };

    window.addEventListener("keydown", handle_keydown);

    return () => window.removeEventListener("keydown", handle_keydown);
  }, [is_open, is_form_open, contact_to_delete, selected_contact, on_close]);

  const handle_add_click = useCallback(() => {
    set_editing_contact(null);
    set_is_form_open(true);
  }, []);

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
      emit_contacts_changed();
    } catch (err) {
      set_error(
        err instanceof Error
          ? err.message
          : t("common.failed_to_delete_contact"),
      );
    } finally {
      set_contact_to_delete(null);
    }
  }, [contact_to_delete, selected_contact]);

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
            id: response.data.id,
            first_name: data.first_name,
            last_name: data.last_name,
            emails: data.emails,
            phone: data.phone,
            company: data.company,
            job_title: data.job_title,
            address: data.address,
            birthday: data.birthday,
            social_links: data.social_links,
            relationship: data.relationship,
            notes: data.notes,
            avatar_url: data.avatar_url,
            is_favorite: data.is_favorite ?? false,
            groups: data.groups,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };

          set_contacts((prev) => [...prev, new_contact]);
          emit_contacts_changed();
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

  const handle_form_close = useCallback(() => {
    set_is_form_open(false);
    set_editing_contact(null);
  }, []);

  const handle_compose_email = useCallback(
    (email: string) => {
      on_compose_to?.(email);
      on_close();
    },
    [on_compose_to, on_close],
  );

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
              if (should_select) {
                new_set.add(items[i].id);
              } else {
                new_set.delete(items[i].id);
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

    try {
      const ids_to_delete = Array.from(selected_ids);

      for (let i = 0; i < ids_to_delete.length; i += BATCH_SIZE) {
        const batch = ids_to_delete.slice(i, i + BATCH_SIZE);

        await Promise.allSettled(batch.map((id) => api_delete_contact(id)));
      }
      set_contacts((prev) => prev.filter((c) => !selected_ids.has(c.id)));
      set_selected_ids(new Set());
      if (selected_contact && selected_ids.has(selected_contact.id)) {
        set_selected_contact(null);
      }
      emit_contacts_changed();
    } catch (err) {
      set_error(
        err instanceof Error
          ? err.message
          : t("common.failed_to_delete_contacts"),
      );
    } finally {
      set_is_bulk_deleting(false);
    }
  }, [selected_ids, selected_contact]);

  const handle_compose_to_selected = useCallback(() => {
    const selected_contacts = contacts.filter((c) => selected_ids.has(c.id));
    const emails = selected_contacts
      .flatMap((c) => c.emails)
      .filter((e) => e)
      .slice(0, 10);

    if (emails.length > 0) {
      on_compose_to?.(emails.join(", "));
      on_close();
    }
  }, [contacts, selected_ids, on_compose_to, on_close]);

  const handle_toggle_favorite_selected = useCallback(async () => {
    if (selected_ids.size === 0) return;

    const selected_contacts = contacts.filter((c) => selected_ids.has(c.id));
    const all_favorited = selected_contacts.every((c) => c.is_favorite);
    const new_favorite_state = !all_favorited;

    try {
      const contacts_to_update = selected_contacts.filter(
        (contact) => contact.is_favorite !== new_favorite_state,
      );

      for (let i = 0; i < contacts_to_update.length; i += BATCH_SIZE) {
        const batch = contacts_to_update.slice(i, i + BATCH_SIZE);

        await Promise.allSettled(
          batch.map((contact) =>
            update_contact_encrypted(contact.id, {
              first_name: contact.first_name,
              last_name: contact.last_name,
              emails: contact.emails,
              phone: contact.phone,
              company: contact.company,
              job_title: contact.job_title,
              address: contact.address,
              birthday: contact.birthday,
              social_links: contact.social_links,
              relationship: contact.relationship,
              notes: contact.notes,
              avatar_url: contact.avatar_url,
              is_favorite: new_favorite_state,
              groups: contact.groups,
            }),
          ),
        );
      }

      set_contacts((prev) =>
        prev.map((c) =>
          selected_ids.has(c.id)
            ? { ...c, is_favorite: new_favorite_state }
            : c,
        ),
      );
    } catch (err) {
      set_error(
        err instanceof Error
          ? err.message
          : t("common.failed_to_update_favorites"),
      );
    }
  }, [contacts, selected_ids]);

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
        (contact.notes || "").replace(/"/g, '""'),
        contact.is_favorite ? t("common.yes") : t("common.no"),
      ]);

      const csv_content = [
        csv_headers.join(","),
        ...csv_rows.map((row) => row.map((cell) => `"${cell}"`).join(",")),
      ].join("\n");

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
      default:
        return t("mail.all");
    }
  }, [filter_by, t]);

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

  const full_name = selected_contact
    ? `${selected_contact.first_name} ${selected_contact.last_name}`.trim()
    : "";

  return {
    t,
    has_keys,
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
    copied_field,
    selected_ids,
    set_selected_ids,
    is_bulk_deleting,
    set_is_bulk_deleting,
    sort_by,
    set_sort_by,
    filter_by,
    set_filter_by,
    search_input_ref,
    filtered_contacts,
    selection_state,
    has_selection,
    handle_add_click,
    handle_edit,
    handle_delete_request,
    handle_confirm_delete,
    handle_form_submit,
    handle_form_close,
    handle_compose_email,
    handle_copy,
    handle_toggle_select,
    handle_toggle_select_all,
    handle_delete_selected,
    handle_confirm_bulk_delete,
    handle_compose_to_selected,
    handle_toggle_favorite_selected,
    handle_export_contacts,
    handle_copy_emails,
    selected_all_favorited,
    filter_label,
    sort_label,
    full_name,
  };
}

export type UseContactsModalReturn = ReturnType<typeof use_contacts_modal>;
