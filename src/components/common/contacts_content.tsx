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
import { useEffect } from "react";
import { UserCircleIcon } from "@heroicons/react/24/outline";

import { ContactForm } from "@/components/contacts";
import { ContactImportModal } from "@/components/contacts/contact_import_modal";
import { ConfirmationModal } from "@/components/modals/confirmation_modal";
import { ComposeModal } from "@/components/compose/compose_modal";
import { use_contacts_state } from "@/components/common/hooks/use_contacts_state";
import { ContactList } from "@/components/common/contacts/contact_list";
import { ContactDetailPanel } from "@/components/common/contacts/contact_detail_panel";
import { prewarm_search_index } from "@/hooks/use_search";
import { use_auth } from "@/contexts/auth_context";

interface ContactsContentProps {
  on_mobile_menu_toggle: () => void;
}

export function ContactsContent({
  on_mobile_menu_toggle,
}: ContactsContentProps) {
  const state = use_contacts_state();
  const { user } = use_auth();

  useEffect(() => {
    if (user?.email) {
      prewarm_search_index(user.email);
    }
  }, [user?.email]);

  return (
    <>
      <input
        ref={state.file_input_ref}
        accept=".csv"
        className="hidden"
        type="file"
        onChange={state.handle_import_csv}
      />
      <div className="flex h-full min-h-0 w-full">
        <ContactList
          alphabetical_index={state.alphabetical_index}
          contact_refs={state.contact_refs}
          contacts={state.contacts}
          copied_field={state.copied_field}
          error={state.error}
          filter_by={state.filter_by}
          filter_label={state.filter_label}
          filtered_contacts={state.filtered_contacts}
          focused_index={state.focused_index}
          has_selection={state.has_selection}
          import_progress={state.import_progress}
          is_importing={state.is_importing}
          is_loading={state.is_loading}
          list_container_ref={state.list_container_ref}
          on_add_click={state.handle_add_click}
          on_compose_email={state.handle_compose_email}
          on_compose_to_selected={state.handle_compose_to_selected}
          on_copy={state.handle_copy}
          on_copy_emails={state.handle_copy_emails}
          on_delete_selected={state.handle_delete_selected}
          on_export_contacts={state.handle_export_contacts}
          on_import_modal_open={() => state.set_is_import_modal_open(true)}
          on_mobile_menu_toggle={on_mobile_menu_toggle}
          on_scroll_to_letter={state.scroll_to_letter}
          on_toggle_favorite_selected={state.handle_toggle_favorite_selected}
          on_toggle_select={state.handle_toggle_select}
          search_input_ref={state.search_input_ref}
          search_query={state.search_query}
          selected_all_favorited={state.selected_all_favorited}
          selected_contact={state.selected_contact}
          selected_ids={state.selected_ids}
          selection_state={state.selection_state}
          set_filter_by={state.set_filter_by}
          set_search_query={state.set_search_query}
          set_selected_contact={state.set_selected_contact}
          set_sort_by={state.set_sort_by}
          set_view_mode={state.set_view_mode}
          sort_by={state.sort_by}
          sort_label={state.sort_label}
          t={state.t}
          upcoming_birthdays_count={state.upcoming_birthdays_count}
          view_mode={state.view_mode}
        />

        {state.selected_contact || state.is_creating_new ? (
        <ContactDetailPanel
          copied_field={state.copied_field}
          is_creating_new={state.is_creating_new}
          is_submitting={state.is_submitting}
          on_cancel_create={state.handle_cancel_create}
          on_compose_email={state.handle_compose_email}
          on_copy={state.handle_copy}
          on_delete_request={state.handle_delete_request}
          on_edit={state.handle_edit}
          on_dismiss={() => {
            state.set_selected_contact(null);
            state.handle_cancel_create();
          }}
          on_inline_create={state.handle_inline_create}
          on_inline_save={state.handle_inline_save}
          on_toggle_favorite={state.handle_toggle_favorite_single}
          selected_contact={state.selected_contact}
          set_show_history={state.set_show_history}
          show_history={state.show_history}
          t={state.t}
        />
        ) : (
          <div className="hidden md:flex flex-1 min-h-0 min-w-0 flex-col items-center justify-center px-6 text-center">
            <UserCircleIcon className="w-10 h-10 mb-3 text-txt-muted" />
            <p className="text-[15px] font-medium text-txt-primary mb-1">
              {state.t("common.no_contact_selected")}
            </p>
            <p className="text-[13px] text-txt-muted">
              {state.t("common.select_contact_hint")}
            </p>
          </div>
        )}
      </div>

      <ContactForm
        contact={state.editing_contact}
        is_loading={state.is_submitting}
        is_open={state.is_form_open}
        on_close={state.handle_form_close}
        on_submit={state.handle_form_submit}
      />

      <ConfirmationModal
        cancel_text={state.t("common.cancel")}
        confirm_text={state.t("common.delete")}
        is_open={!!state.contact_to_delete}
        message={state.t("common.delete_contact_confirmation", {
          name: state.contact_to_delete
            ? `${state.contact_to_delete.first_name} ${state.contact_to_delete.last_name}`.trim()
            : "this contact",
        })}
        on_cancel={() => state.set_contact_to_delete(null)}
        on_confirm={state.handle_confirm_delete}
        title={state.t("common.delete_contact")}
        variant="danger"
      />

      <ConfirmationModal
        cancel_text={state.t("common.cancel")}
        confirm_text={state.t("common.delete_selected_contacts")}
        is_open={state.is_bulk_deleting}
        message={state.t("common.delete_contacts_confirmation", {
          count: state.selected_ids.size,
        })}
        on_cancel={() => state.set_is_bulk_deleting(false)}
        on_confirm={state.handle_confirm_bulk_delete}
        title={state.t("common.delete_selected_contacts")}
        variant="danger"
      />

      <ComposeModal
        initial_to={state.compose_recipients}
        is_open={state.is_compose_open}
        on_close={() => {
          state.set_is_compose_open(false);
          state.set_compose_recipients("");
        }}
      />

      {state.is_import_modal_open && (
        <ContactImportModal
          on_close={() => state.set_is_import_modal_open(false)}
          on_import_complete={(count) => {
            state.set_is_import_modal_open(false);
            if (count > 0) {
              state.fetch_contacts();
            }
          }}
        />
      )}
    </>
  );
}
