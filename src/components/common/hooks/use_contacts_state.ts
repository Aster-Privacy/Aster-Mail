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
  ContactGroup,
  ContactRevision,
  DecryptedContact,
  ContactFormData,
} from "@/types/contacts";

import { useCallback, useEffect, useRef } from "react";

import { BATCH_SIZE, contact_to_form_data } from "./contacts_state_helpers";
import { use_contacts_data } from "./use_contacts_data";

import { trigger_download } from "@/utils/download_blob";
import { copy_text_or_throw } from "@/utils/copy_text";
import {
  create_contact_encrypted,
  update_contact_encrypted,
  delete_contact as api_delete_contact,
  add_contact_to_group,
  add_contacts_to_group,
  remove_contacts_from_group,
} from "@/services/api/contacts";
import { emit_contact_groups_changed } from "@/hooks/use_contact_groups";
import { show_toast } from "@/components/toast/simple_toast";
import { print_contacts } from "@/utils/contact_print";
import { emit_contacts_changed } from "@/hooks/mail_events";
import { with_contact_revision } from "@/lib/contact_history";

const SELECTED_CONTACT_STORAGE_KEY = "aster_contacts_selected_id";

function read_stored_selection(): string | null {
  try {
    return sessionStorage.getItem(SELECTED_CONTACT_STORAGE_KEY);
  } catch {
    return null;
  }
}

function write_stored_selection(id: string | null): void {
  try {
    if (id) sessionStorage.setItem(SELECTED_CONTACT_STORAGE_KEY, id);
    else sessionStorage.removeItem(SELECTED_CONTACT_STORAGE_KEY);
  } catch {
    return;
  }
}

export { contact_to_form_data };
export type {
  FilterOption,
  SortOption,
  ViewMode,
} from "./contacts_state_helpers";

export function use_contacts_state() {
  const {
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
  } = use_contacts_data();

  const selection_restored_ref = useRef(false);

  useEffect(() => {
    if (selection_restored_ref.current || contacts.length === 0) return;
    selection_restored_ref.current = true;

    const stored = read_stored_selection();

    if (!stored) return;

    const match = contacts.find((contact) => contact.id === stored);

    if (match) set_selected_contact(match);
  }, [contacts, set_selected_contact]);

  useEffect(() => {
    write_stored_selection(selected_contact?.id ?? null);
  }, [selected_contact]);

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

  const handle_bulk_create = useCallback(
    async (entries: ContactFormData[]): Promise<void> => {
      if (entries.length === 0) return;

      set_is_submitting(true);
      set_error(null);

      const created: DecryptedContact[] = [];

      try {
        for (const entry of entries) {
          const response = await create_contact_encrypted(entry);

          if (response.error || !response.data) continue;

          created.push({
            ...entry,
            id: response.data.id,
            is_favorite: entry.is_favorite ?? false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
        }

        if (created.length > 0) {
          set_contacts((prev) => [...prev, ...created]);
          emit_contacts_changed();
          show_toast(
            t("common.contacts_created", { count: created.length }),
            "success",
          );
        }

        if (created.length < entries.length) {
          set_error(t("common.some_contacts_not_created"));
          show_toast(t("common.some_contacts_not_created"), "error");
        }
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

    const deleted_at = new Date().toISOString();

    try {
      const response = await update_contact_encrypted(contact_to_delete.id, {
        ...contact_to_form_data(contact_to_delete),
        deleted_at,
      });

      if (response.error) {
        set_error(response.error);
        show_toast(t("common.failed_to_move_to_trash"), "error");

        return;
      }
      set_contacts((prev) => prev.filter((c) => c.id !== contact_to_delete.id));
      set_trashed_contacts((prev) => [
        { ...contact_to_delete, deleted_at },
        ...prev,
      ]);
      set_selected_ids((prev) => {
        const new_set = new Set(prev);

        new_set.delete(contact_to_delete.id);

        return new_set;
      });
      if (selected_contact?.id === contact_to_delete.id) {
        set_selected_contact(null);
      }
      emit_contacts_changed();
      show_toast(t("common.contact_moved_to_trash"), "success");
    } catch (err) {
      set_error(
        err instanceof Error
          ? err.message
          : t("common.failed_to_move_to_trash"),
      );
      show_toast(t("common.failed_to_move_to_trash"), "error");
    } finally {
      set_contact_to_delete(null);
    }
  }, [contact_to_delete, selected_contact, t]);

  const handle_restore_contact = useCallback(
    async (contact: DecryptedContact) => {
      set_trashed_contacts((prev) => prev.filter((c) => c.id !== contact.id));
      set_contacts((prev) => [{ ...contact, deleted_at: undefined }, ...prev]);

      try {
        const response = await update_contact_encrypted(contact.id, {
          ...contact_to_form_data(contact),
          deleted_at: undefined,
        });

        if (response.error) {
          show_toast(response.error, "error");
          await fetch_contacts();

          return;
        }
        emit_contacts_changed();
        show_toast(t("common.contact_restored"), "success");
      } catch {
        show_toast(t("common.failed_to_update_contact"), "error");
        await fetch_contacts();
      }
    },
    [fetch_contacts, t],
  );

  const handle_delete_forever = useCallback(
    async (contact: DecryptedContact) => {
      set_trashed_contacts((prev) => prev.filter((c) => c.id !== contact.id));

      try {
        const response = await api_delete_contact(contact.id);

        if (response.error) {
          show_toast(response.error, "error");
          await fetch_contacts();

          return;
        }
        emit_contacts_changed();
        show_toast(t("common.contact_deleted"), "success");
      } catch {
        show_toast(t("common.failed_to_delete_contact"), "error");
        await fetch_contacts();
      }
    },
    [fetch_contacts, t],
  );

  const handle_empty_trash = useCallback(async () => {
    if (trashed_contacts.length === 0) return;

    const ids = trashed_contacts.map((c) => c.id);
    const deleted_count = ids.length;

    set_trashed_contacts([]);

    try {
      let failed_count = 0;

      for (let i = 0; i < ids.length; i += BATCH_SIZE) {
        const batch = ids.slice(i, i + BATCH_SIZE);
        const results = await Promise.allSettled(
          batch.map((id) => api_delete_contact(id)),
        );

        failed_count += results.filter(
          (result) => result.status === "rejected" || result.value?.error,
        ).length;
      }
      if (failed_count > 0) {
        show_toast(t("common.failed_to_delete_contacts"), "error");
        await fetch_contacts();

        return;
      }
      show_toast(
        t("common.contacts_deleted", { count: deleted_count }),
        "success",
      );
    } catch {
      show_toast(t("common.failed_to_delete_contacts"), "error");
      await fetch_contacts();
    }
  }, [trashed_contacts, fetch_contacts, t]);

  const handle_form_submit = useCallback(
    async (data: ContactFormData) => {
      set_is_submitting(true);
      set_error(null);

      try {
        if (editing_contact) {
          const data_with_history = with_contact_revision(
            data,
            contact_to_form_data(editing_contact),
          );
          const response = await update_contact_encrypted(
            editing_contact.id,
            data_with_history,
          );

          if (response.error) {
            set_error(response.error);
            show_toast(t("common.failed_to_save_contact"), "error");
            set_is_submitting(false);

            return;
          }
          const updated_contact: DecryptedContact = {
            ...editing_contact,
            ...data_with_history,
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
            show_toast(t("common.failed_to_create_contact"), "error");
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
        show_toast(t("common.failed_to_save_contact"), "error");
      } finally {
        set_is_submitting(false);
      }
    },
    [editing_contact, selected_contact, t],
  );

  const handle_inline_save = useCallback(
    async (contact: DecryptedContact, data: ContactFormData) => {
      set_is_submitting(true);
      set_error(null);

      const data_with_history = with_contact_revision(
        data,
        contact_to_form_data(contact),
      );

      try {
        const response = await update_contact_encrypted(
          contact.id,
          data_with_history,
        );

        if (response.error) {
          set_error(response.error);
          show_toast(t("common.failed_to_save_contact"), "error");

          return false;
        }
        const updated_contact: DecryptedContact = {
          ...contact,
          ...data_with_history,
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

        return true;
      } catch (err) {
        set_error(
          err instanceof Error
            ? err.message
            : t("common.failed_to_save_contact"),
        );
        show_toast(t("common.failed_to_save_contact"), "error");

        return false;
      } finally {
        set_is_submitting(false);
      }
    },
    [selected_contact, t],
  );

  const contacts_ref = useRef(contacts);

  contacts_ref.current = contacts;

  const selected_contact_ref = useRef(selected_contact);

  selected_contact_ref.current = selected_contact;

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
        const selected = selected_contact_ref.current;
        const latest =
          (selected?.id === contact.id ? selected : undefined) ??
          contacts_ref.current.find((c) => c.id === contact.id) ??
          contact;
        const response = await update_contact_encrypted(contact.id, {
          ...contact_to_form_data(latest),
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

    const contacts_to_trash = contacts.filter((c) => selected_ids.has(c.id));
    const delete_count = contacts_to_trash.length;
    const deleted_at = new Date().toISOString();

    set_contacts((prev) => prev.filter((c) => !selected_ids.has(c.id)));
    set_trashed_contacts((prev) => [
      ...contacts_to_trash.map((c) => ({ ...c, deleted_at })),
      ...prev,
    ]);
    set_selected_ids(new Set());
    if (selected_contact && selected_ids.has(selected_contact.id)) {
      set_selected_contact(null);
    }
    set_is_bulk_deleting(false);

    try {
      let failed_count = 0;

      for (let i = 0; i < contacts_to_trash.length; i += BATCH_SIZE) {
        const batch = contacts_to_trash.slice(i, i + BATCH_SIZE);
        const results = await Promise.allSettled(
          batch.map((contact) =>
            update_contact_encrypted(contact.id, {
              ...contact_to_form_data(contact),
              deleted_at,
            }),
          ),
        );

        failed_count += results.filter(
          (result) => result.status === "rejected" || result.value?.error,
        ).length;
      }
      emit_contacts_changed();
      if (failed_count > 0) {
        show_toast(t("common.failed_to_delete_contacts"), "error");
        await fetch_contacts();

        return;
      }
      show_toast(
        t("common.contacts_moved_to_trash", { count: delete_count }),
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
  }, [contacts, selected_ids, selected_contact, fetch_contacts, t]);

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
        selected_ids.has(c.id) ? { ...c, is_favorite: new_favorite_state } : c,
      ),
    );
    set_selected_contact((prev) =>
      prev && selected_ids.has(prev.id)
        ? { ...prev, is_favorite: new_favorite_state }
        : prev,
    );

    const failed_ids = new Set<string>();

    try {
      for (let i = 0; i < contacts_to_update.length; i += BATCH_SIZE) {
        const batch = contacts_to_update.slice(i, i + BATCH_SIZE);

        const results = await Promise.allSettled(
          batch.map((contact) =>
            update_contact_encrypted(contact.id, {
              ...contact_to_form_data(contact),
              is_favorite: new_favorite_state,
            }),
          ),
        );

        results.forEach((result, batch_index) => {
          if (result.status === "rejected" || result.value?.error) {
            failed_ids.add(batch[batch_index].id);
          }
        });
      }
      if (failed_ids.size > 0) {
        set_contacts((prev) =>
          prev.map((c) =>
            failed_ids.has(c.id)
              ? { ...c, is_favorite: !new_favorite_state }
              : c,
          ),
        );
        set_selected_contact((prev) =>
          prev && failed_ids.has(prev.id)
            ? { ...prev, is_favorite: !new_favorite_state }
            : prev,
        );
        show_toast(t("common.failed_to_update_favorites"), "error");

        return;
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
      set_selected_contact((prev) =>
        prev && contacts_to_update.some((u) => u.id === prev.id)
          ? { ...prev, is_favorite: !new_favorite_state }
          : prev,
      );
      show_toast(
        err instanceof Error
          ? err.message
          : t("common.failed_to_update_favorites"),
        "error",
      );
    }
  }, [contacts, selected_ids, set_selected_contact, t]);

  const handle_undo_contact_change = useCallback(
    async (contact: DecryptedContact, revision: ContactRevision) => {
      const restored = with_contact_revision(
        { ...revision.data, avatar_url: contact.avatar_url },
        contact_to_form_data(contact),
      );

      try {
        const response = await update_contact_encrypted(contact.id, restored);

        if (response.error) {
          show_toast(t("common.failed_to_update_contact"), "error");

          return;
        }
        const updated_contact: DecryptedContact = {
          ...contact,
          ...restored,
          is_favorite: restored.is_favorite ?? contact.is_favorite,
          updated_at: new Date().toISOString(),
        };

        set_contacts((prev) =>
          prev.map((c) => (c.id === contact.id ? updated_contact : c)),
        );
        if (selected_contact?.id === contact.id) {
          set_selected_contact(updated_contact);
        }
        emit_contacts_changed();
        show_toast(t("common.contact_change_undone"), "success");
      } catch {
        show_toast(t("common.failed_to_update_contact"), "error");
      }
    },
    [selected_contact, t],
  );

  const handle_add_selected_to_group = useCallback(
    async (group: ContactGroup) => {
      if (selected_ids.size === 0) return;

      const selected_contacts = contacts.filter((c) => selected_ids.has(c.id));

      try {
        let failed_count = 0;

        for (let i = 0; i < selected_contacts.length; i += BATCH_SIZE) {
          const batch = selected_contacts.slice(i, i + BATCH_SIZE);
          const results = await Promise.allSettled(
            batch.map((contact) => add_contact_to_group(contact.id, group.id)),
          );

          failed_count += results.filter(
            (result) => result.status === "rejected" || result.value?.error,
          ).length;
        }
        if (failed_count > 0) {
          show_toast(t("common.failed_to_add_to_group"), "error");

          return;
        }
        const added_ids = new Set(selected_contacts.map((c) => c.id));
        const with_group = (contact: DecryptedContact): DecryptedContact =>
          added_ids.has(contact.id) &&
          !(contact.groups || []).includes(group.id)
            ? { ...contact, groups: [...(contact.groups || []), group.id] }
            : contact;

        set_contacts((prev) => prev.map(with_group));
        set_selected_contact((prev) => (prev ? with_group(prev) : prev));
        set_selected_ids(new Set());
        emit_contacts_changed();
        show_toast(
          t("common.added_to_group", {
            count: selected_contacts.length,
            name: group.name,
          }),
          "success",
        );
      } catch {
        show_toast(t("common.failed_to_add_to_group"), "error");
      }
    },
    [contacts, selected_ids, set_selected_contact, t],
  );

  useEffect(() => {
    const handle_keydown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (is_form_open || contact_to_delete || is_import_modal_open) return;
      if (is_creating_new) return;

      const target = e.target as HTMLElement;

      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }

      const contact = filtered_contacts[focused_index];

      if (!contact) return;

      if (e["key"] === "s") {
        e.preventDefault();
        void handle_toggle_favorite_single(contact);

        return;
      }

      if (e["key"] === "#" || e["key"] === "Delete") {
        e.preventDefault();
        handle_delete_request(contact);
      }
    };

    window.addEventListener("keydown", handle_keydown);

    return () => window.removeEventListener("keydown", handle_keydown);
  }, [
    contact_to_delete,
    filtered_contacts,
    focused_index,
    handle_delete_request,
    handle_toggle_favorite_single,
    is_creating_new,
    is_form_open,
    is_import_modal_open,
  ]);

  const handle_print_contacts = useCallback(() => {
    const contacts_to_print =
      selected_ids.size > 0
        ? contacts.filter((c) => selected_ids.has(c.id))
        : contacts;

    print_contacts(contacts_to_print, {
      title: t("common.contacts"),
      email: t("common.email"),
      phone: t("common.phone"),
      company: t("common.company"),
      job_title: t("common.job_title"),
      address: t("common.address"),
      birthday: t("common.birthday"),
      notes: t("common.notes"),
    });
  }, [contacts, selected_ids, t]);

  const handle_set_group_membership = useCallback(
    async (group_id: string, should_add: boolean) => {
      const target_contacts = contacts.filter(
        (contact) =>
          selected_ids.has(contact.id) &&
          (contact.groups || []).includes(group_id) !== should_add,
      );

      if (target_contacts.length === 0) return;

      const target_ids = target_contacts.map((contact) => contact.id);
      const apply_locally = (add: boolean) => {
        set_contacts((prev) =>
          prev.map((contact) => {
            if (!target_ids.includes(contact.id)) return contact;
            const current = contact.groups || [];

            return {
              ...contact,
              groups: add
                ? [...current, group_id]
                : current.filter((id) => id !== group_id),
            };
          }),
        );
      };

      apply_locally(should_add);

      try {
        const membership = should_add
          ? await add_contacts_to_group(group_id, target_ids)
          : await remove_contacts_from_group(group_id, target_ids);

        if (membership.error) {
          throw new Error(membership.error);
        }

        for (let i = 0; i < target_contacts.length; i += BATCH_SIZE) {
          const batch = target_contacts.slice(i, i + BATCH_SIZE);
          const results = await Promise.allSettled(
            batch.map((contact) => {
              const current = contact.groups || [];
              const next_groups = should_add
                ? [...current, group_id]
                : current.filter((id) => id !== group_id);

              return update_contact_encrypted(contact.id, {
                ...contact_to_form_data(contact),
                groups: next_groups,
              });
            }),
          );

          if (
            results.some(
              (result) => result.status === "rejected" || result.value?.error,
            )
          ) {
            throw new Error(t("common.failed_to_update_contact_groups"));
          }
        }

        emit_contact_groups_changed();
        show_toast(
          t(
            should_add
              ? "common.contacts_added_to_group"
              : "common.contacts_removed_from_group",
            { count: target_ids.length },
          ),
          "success",
        );
      } catch {
        apply_locally(!should_add);
        show_toast(t("common.failed_to_update_contact_groups"), "error");
      }
    },
    [contacts, selected_ids, t],
  );

  const handle_toggle_contact_group = useCallback(
    async (contact: DecryptedContact, group_id: string, should_add: boolean) => {
      const current = contact.groups || [];

      if (current.includes(group_id) === should_add) return;

      const next_groups = should_add
        ? [...current, group_id]
        : current.filter((id) => id !== group_id);
      const apply_locally = (groups: string[]) => {
        set_contacts((prev) =>
          prev.map((c) => (c.id === contact.id ? { ...c, groups } : c)),
        );
        set_selected_contact((prev) =>
          prev && prev.id === contact.id ? { ...prev, groups } : prev,
        );
      };

      apply_locally(next_groups);

      try {
        const membership = should_add
          ? await add_contacts_to_group(group_id, [contact.id])
          : await remove_contacts_from_group(group_id, [contact.id]);

        if (membership.error) {
          throw new Error(membership.error);
        }

        const response = await update_contact_encrypted(contact.id, {
          ...contact_to_form_data(contact),
          groups: next_groups,
        });

        if (response.error) {
          throw new Error(response.error);
        }
        emit_contact_groups_changed();
      } catch {
        apply_locally(current);
        show_toast(t("common.failed_to_update_contact_groups"), "error");
      }
    },
    [t],
  );

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

      trigger_download(
        new Blob([csv_content], { type: "text/csv;charset=utf-8;" }),
        `contacts_${new Date().toISOString().split("T")[0]}.csv`,
      );
    },
    [contacts, selected_ids, t],
  );

  const handle_copy_emails = useCallback(() => {
    const selected_contacts = contacts.filter((c) => selected_ids.has(c.id));
    const emails = selected_contacts.flatMap((c) => c.emails).filter((e) => e);

    if (emails.length > 0) {
      copy_text_or_throw(emails.join(", "))
        .then(() => {
          set_copied_field("bulk-emails");
          if (copy_timeout_ref.current) {
            clearTimeout(copy_timeout_ref.current);
          }
          copy_timeout_ref.current = setTimeout(() => {
            set_copied_field(null);
          }, 2000);
        })
        .catch(() => show_toast(t("common.failed_to_copy"), "error"));
    }
  }, [contacts, selected_ids, t]);

  const handle_copy = useCallback(async (text: string, field: string) => {
    try {
      await copy_text_or_throw(text);
      set_copied_field(field);
      if (copy_timeout_ref.current) {
        clearTimeout(copy_timeout_ref.current);
      }
      copy_timeout_ref.current = setTimeout(() => {
        set_copied_field(null);
      }, 2000);

      return true;
    } catch {
      show_toast(t("common.failed_to_copy"), "error");

      return false;
    }
  }, []);

  return {
    t,
    contacts,
    trashed_contacts,
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
    group_filter,
    handle_set_group_filter,
    handle_set_group_membership,
    handle_toggle_contact_group,
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
    selected_contacts,
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
    handle_bulk_create,
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
    handle_add_selected_to_group,
    handle_undo_contact_change,
    handle_print_contacts,
    handle_restore_contact,
    handle_delete_forever,
    handle_empty_trash,
    handle_copy_emails,
    handle_copy,
  };
}
