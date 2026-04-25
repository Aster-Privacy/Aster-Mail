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
import { UserPlusIcon } from "@heroicons/react/24/outline";

import { ContactForm } from "@/components/contacts";
import { ConfirmationModal } from "@/components/modals/confirmation_modal";
import { use_contacts_modal } from "@/components/modals/hooks/use_contacts_modal";
import { ModalContactDetail } from "@/components/modals/contacts/modal_contact_detail";
import { ModalContactList } from "@/components/modals/contacts/modal_contact_list";

interface ContactsModalProps {
  is_open: boolean;
  on_close: () => void;
  on_compose_to?: (email: string) => void;
}

export function ContactsModal({
  is_open,
  on_close,
  on_compose_to,
}: ContactsModalProps) {
  const modal = use_contacts_modal({ is_open, on_close, on_compose_to });

  if (!is_open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6"
      role="presentation"
      onClick={on_close}
      onKeyDown={(e) => {
        if (e["key"] === "Escape") on_close();
      }}
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-black/60 backdrop-blur-md"
      />
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/click-events-have-key-events */}
      <div
        className="relative w-full max-w-[580px] rounded-xl border overflow-hidden bg-modal-bg border-edge-primary"
        role="dialog"
        style={{
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.35)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {!modal.has_keys ? (
          <div className="flex flex-col items-center justify-center py-20 px-8">
            <UserPlusIcon className="w-10 h-10 mb-4 text-txt-muted" />
            <p className="text-[15px] font-medium mb-1 text-txt-primary">
              {modal.t("common.vault_locked")}
            </p>
            <p className="text-[13px] text-txt-muted">
              {modal.t("common.unlock_vault_to_view")}
            </p>
          </div>
        ) : (
          <>
            {modal.selected_contact ? (
              <ModalContactDetail
                copied_field={modal.copied_field}
                full_name={modal.full_name}
                on_back={() => modal.set_selected_contact(null)}
                on_close={on_close}
                on_compose_email={modal.handle_compose_email}
                on_copy={modal.handle_copy}
                on_delete={modal.handle_delete_request}
                on_edit={modal.handle_edit}
                selected_contact={modal.selected_contact}
                t={modal.t}
              />
            ) : (
              <ModalContactList
                contacts={modal.contacts}
                copied_field={modal.copied_field}
                error={modal.error}
                filter_by={modal.filter_by}
                filter_label={modal.filter_label}
                filtered_contacts={modal.filtered_contacts}
                has_selection={modal.has_selection}
                is_loading={modal.is_loading}
                on_add={modal.handle_add_click}
                on_close={on_close}
                on_compose_to_selected={modal.handle_compose_to_selected}
                on_copy_emails={modal.handle_copy_emails}
                on_delete_selected={modal.handle_delete_selected}
                on_export_contacts={modal.handle_export_contacts}
                on_select_contact={modal.set_selected_contact}
                on_toggle_favorite_selected={
                  modal.handle_toggle_favorite_selected
                }
                on_toggle_select={modal.handle_toggle_select}
                on_toggle_select_all={modal.handle_toggle_select_all}
                search_input_ref={modal.search_input_ref}
                search_query={modal.search_query}
                selected_all_favorited={modal.selected_all_favorited}
                selected_ids={modal.selected_ids}
                selection_state={modal.selection_state}
                set_filter_by={modal.set_filter_by}
                set_search_query={modal.set_search_query}
                set_selected_ids={modal.set_selected_ids}
                set_sort_by={modal.set_sort_by}
                sort_by={modal.sort_by}
                sort_label={modal.sort_label}
                t={modal.t}
              />
            )}
          </>
        )}
      </div>

      <ContactForm
        contact={modal.editing_contact}
        is_loading={modal.is_submitting}
        is_open={modal.is_form_open}
        on_close={modal.handle_form_close}
        on_submit={modal.handle_form_submit}
      />

      <ConfirmationModal
        cancel_text={modal.t("common.cancel")}
        confirm_text={modal.t("common.delete")}
        is_open={!!modal.contact_to_delete}
        message={modal.t("common.delete_contact_confirm", {
          name: modal.contact_to_delete
            ? `${modal.contact_to_delete.first_name} ${modal.contact_to_delete.last_name}`.trim()
            : modal.t("common.this_contact"),
        })}
        on_cancel={() => modal.set_contact_to_delete(null)}
        on_confirm={modal.handle_confirm_delete}
        title={modal.t("common.delete_contact")}
        variant="danger"
      />

      <ConfirmationModal
        cancel_text={modal.t("common.cancel")}
        confirm_text={`${modal.t("common.delete")} ${modal.selected_ids.size} contact${modal.selected_ids.size === 1 ? "" : "s"}`}
        is_open={modal.is_bulk_deleting}
        message={modal.t("common.delete_contacts_confirm", {
          count: modal.selected_ids.size,
        })}
        on_cancel={() => modal.set_is_bulk_deleting(false)}
        on_confirm={modal.handle_confirm_bulk_delete}
        title={modal.t("common.delete_selected_contacts")}
        variant="danger"
      />
    </div>
  );
}
