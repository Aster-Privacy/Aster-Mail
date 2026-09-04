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
import { motion, AnimatePresence } from "framer-motion";
import { TrashIcon, ArrowPathIcon } from "@heroicons/react/24/outline";

import { MobileContactList } from "./mobile_contact_list";
import { ContactDetailView } from "./mobile_contact_detail_view";
import { ContactFormView } from "./mobile_contact_form_view";
import { use_mobile_contacts_state } from "./use_mobile_contacts_state";

import { ConfirmModal } from "@/components/email/inbox/inbox_confirmation_dialog";

interface MobileContactsPageProps {
  on_compose: (to?: string) => void;
  on_open_drawer: () => void;
}

function MobileContactsPage({
  on_compose,
  on_open_drawer,
}: MobileContactsPageProps) {
  const s = use_mobile_contacts_state(on_compose);

  return (
    <div className="flex h-full flex-col">
      <MobileContactList
        contacts={s.contacts}
        deselect_all={s.deselect_all}
        exit_select_mode={s.exit_select_mode}
        favorites_count={s.favorites_count}
        filter={s.filter}
        filtered_contacts={s.filtered_contacts}
        group_filter={s.group_filter}
        grouped={s.grouped}
        is_loading={s.is_loading}
        is_select_mode={s.is_select_mode}
        is_syncing={s.is_syncing}
        on_contact_press={s.handle_contact_press}
        on_long_press_end={s.handle_long_press_end}
        on_long_press_start={s.handle_long_press_start}
        on_mass_copy_emails={s.handle_mass_copy_emails}
        on_mass_email={s.handle_mass_email}
        on_mass_favorite={s.handle_mass_favorite}
        on_open_create={s.handle_open_create}
        on_open_drawer={on_open_drawer}
        on_long_press_consume={s.consume_long_press}
        on_retry_load={s.retry_load_contacts}
        load_failed={s.load_failed}
        on_show_delete_confirm={() => s.set_show_delete_confirm(true)}
        on_show_sync_confirm={() => s.set_show_sync_confirm(true)}
        search_query={s.search_query}
        select_all={s.select_all}
        selected_ids={s.selected_ids}
        set_filter={s.set_filter}
        set_group_filter={s.set_group_filter}
        set_is_select_mode={s.set_is_select_mode}
        set_search_query={s.set_search_query}
        toggle_select={s.toggle_select}
      />

      <AnimatePresence>
        {s.show_delete_confirm && (
          <motion.div
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-[9999] flex items-center justify-center"
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <div
              className="absolute inset-0 bg-black/60"
              onClick={s.cancel_delete_confirm}
            />
            <motion.div
              animate={{ scale: 1, opacity: 1 }}
              className="relative mx-6 w-full max-w-sm rounded-2xl p-6 bg-[var(--bg-primary)] border border-[var(--border-primary)]"
              exit={s.reduce_motion ? undefined : { scale: 0.95, opacity: 0 }}
              initial={s.reduce_motion ? false : { scale: 0.95, opacity: 0 }}
              style={{ boxShadow: "0 8px 32px rgba(0,0,0,0.3)" }}
              transition={{ duration: 0.15 }}
            >
              <div className="flex flex-col items-center text-center">
                <TrashIcon className="mb-3 h-10 w-10 text-red-500" />
                <h3 className="text-[17px] font-semibold text-[var(--text-primary)]">
                  {s.pending_delete_contact
                    ? `${s.t("common.delete")} ${
                        [
                          s.pending_delete_contact.first_name,
                          s.pending_delete_contact.last_name,
                        ]
                          .filter(Boolean)
                          .join(" ") ||
                        s.pending_delete_contact.emails[0] ||
                        s.t("mail.contact")
                      }?`
                    : `${s.t("common.delete")} ${s.selected_ids.size} ${s.t("common.contacts").toLowerCase()}?`}
                </h3>
                <p className="mt-2 text-[14px] leading-relaxed text-[var(--text-muted)]">
                  {s.t("common.action_cannot_be_undone")}
                </p>
              </div>
              <div className="mt-5 flex gap-3">
                <button
                  className="flex-1 rounded-[14px] py-2.5 text-[15px] font-medium text-[var(--text-primary)] bg-[var(--bg-tertiary)] active:opacity-80"
                  disabled={s.is_mass_deleting}
                  type="button"
                  onClick={s.cancel_delete_confirm}
                >
                  {s.t("common.cancel")}
                </button>
                <button
                  className="flex-1 rounded-[14px] py-2.5 text-[15px] font-semibold text-white active:brightness-90"
                  style={{
                    background:
                      "linear-gradient(180deg, #ef4444 0%, #dc2626 100%)",
                    boxShadow:
                      "0 2px 4px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.15)",
                  }}
                  disabled={s.is_mass_deleting}
                  type="button"
                  onClick={s.confirm_delete}
                >
                  {s.t("common.delete")}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {s.selected_contact && !s.show_create && (
          <ContactDetailView
            key={s.selected_contact.id}
            contact={s.selected_contact}
            on_back={() => s.set_selected_contact(null)}
            on_compose={s.handle_send_email}
            on_copy={s.handle_copy}
            on_delete={s.request_delete_contact}
            on_edit={s.handle_open_edit}
            on_toggle_favorite={s.handle_toggle_favorite}
            reduce_motion={s.reduce_motion}
          />
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {s.show_create && (
          <ContactFormView
            key={s.editing_contact?.id ?? "new"}
            contact={s.editing_contact}
            create_tab={s.create_tab}
            create_tabs={s.create_tabs}
            form_data={s.form_data}
            is_saving={s.is_saving}
            on_add_email={s.add_email_field}
            on_back={s.request_close_form}
            on_remove_email={s.remove_email_field}
            on_save={s.handle_save}
            on_set_tab={s.set_create_tab}
            on_update_address={s.update_address}
            on_update_email={s.update_email_field}
            on_update_form={s.update_form}
            on_update_social={s.update_social}
            reduce_motion={s.reduce_motion}
            t={s.t}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {s.show_sync_confirm && (
          <motion.div
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-[9999] flex items-center justify-center"
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <div
              className="absolute inset-0 bg-black/60"
              onClick={() => s.set_show_sync_confirm(false)}
            />
            <motion.div
              animate={{ scale: 1, opacity: 1 }}
              className="relative mx-6 w-full max-w-sm rounded-2xl p-6 bg-[var(--bg-primary)] border border-[var(--border-primary)]"
              exit={s.reduce_motion ? undefined : { scale: 0.95, opacity: 0 }}
              initial={s.reduce_motion ? false : { scale: 0.95, opacity: 0 }}
              style={{ boxShadow: "0 8px 32px rgba(0,0,0,0.3)" }}
              transition={{ duration: 0.15 }}
            >
              <div className="flex flex-col items-center text-center">
                <ArrowPathIcon className="mb-3 h-10 w-10 text-[var(--accent-color)]" />
                <h3 className="text-[17px] font-semibold text-[var(--text-primary)]">
                  {s.t("common.sync_confirm_title")}
                </h3>
                <p className="mt-2 text-[14px] leading-relaxed text-[var(--text-muted)]">
                  {s.t("common.sync_confirm_message")}
                </p>
              </div>
              <div className="mt-5 flex gap-3">
                <button
                  className="flex-1 rounded-[14px] py-2.5 text-[15px] font-medium text-[var(--text-primary)] bg-[var(--bg-tertiary)] active:opacity-80"
                  type="button"
                  onClick={() => s.set_show_sync_confirm(false)}
                >
                  {s.t("common.cancel")}
                </button>
                <button
                  className="flex-1 rounded-[14px] py-2.5 text-[15px] font-semibold text-white active:brightness-90"
                  style={{
                    background:
                      "linear-gradient(180deg, var(--accent-mix-w80, #629bf8) 0%, var(--accent-color) 50%, var(--accent-mix-b80, #2f68c5) 100%)",
                    boxShadow:
                      "0 2px 4px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.15)",
                  }}
                  type="button"
                  onClick={() => {
                    s.set_show_sync_confirm(false);
                    s.handle_sync_contacts();
                  }}
                >
                  {s.t("common.sync_button")}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <ConfirmModal
        hide_dont_ask
        confirm_text={s.t("mail.discard")}
        confirm_variant="destructive"
        description={s.t("common.unsaved_changes_body")}
        dont_ask={false}
        on_cancel={() => s.set_show_discard_confirm(false)}
        on_confirm={s.close_form}
        on_dont_ask_change={() => {}}
        show={s.show_discard_confirm}
        title={s.t("common.unsaved_changes_title")}
      />
    </div>
  );
}

export default MobileContactsPage;
