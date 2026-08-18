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

import { useCallback } from "react";

import {
  create_contact_encrypted,
  update_contact_encrypted,
  delete_contact as api_delete_contact,
} from "@/services/api/contacts";
import { show_toast } from "@/components/toast/simple_toast";
import { emit_contacts_changed } from "@/hooks/mail_events";
import { BATCH_SIZE, contact_to_form_data } from "./contacts_state_helpers";
import { use_contacts_data } from "./use_contacts_data";

import { ignore_error } from "@/lib/ignore_error";

export { contact_to_form_data };
export type { FilterOption, SortOption, ViewMode } from "./contacts_state_helpers";

export function use_contacts_state() {
  const {
    t,
    contacts,
    set_contacts,
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
  } = use_contacts_data();

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
        emit_contacts_changed();
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
      emit_contacts_changed();
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
          set_selected_contact(new_contact);
        }

        set_is_form_open(false);
        set_editing_contact(null);
        emit_contacts_changed();
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
        emit_contacts_changed();
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
      emit_contacts_changed();
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
      navigator.clipboard.writeText(emails.join(", ")).catch((caught) => ignore_error("components/common/hooks/use_contacts_state:use_contacts_state", caught));
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
