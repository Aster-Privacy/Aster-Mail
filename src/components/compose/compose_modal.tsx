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
import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";

import { CloseIcon } from "@/components/common/icons";
import { ComposeAttachments } from "@/components/compose/compose_attachments";
import { ConfirmationModal } from "@/components/modals/confirmation_modal";
import { SchedulePicker } from "@/components/compose/schedule_picker";
import { ExpirationPicker } from "@/components/compose/expiration_picker";
import { TemplatePicker } from "@/components/compose/template_picker";
import { SignaturePicker } from "@/components/compose/signature_picker";
import { SenderSelector } from "@/components/compose/sender_selector";
import { use_draggable_modal } from "@/hooks/use_draggable_modal";
import { MODAL_SIZES } from "@/constants/modal";
import { use_should_reduce_motion } from "@/provider";
import {
  ErrorBoundary,
  ComposeErrorFallback,
} from "@/components/ui/error_boundary";
import { use_i18n } from "@/lib/i18n/context";
import { use_compose } from "@/components/compose/use_compose";
import {
  ComposeFormFields,
  ComposeEditor,
  ComposeErrors,
  ComposeFileInput,
  ComposeToolbar,
  ComposeFormatBar,
  type EditDraftData,
} from "@/components/compose/compose_shared";

interface ComposeModalProps {
  is_open: boolean;
  on_close: () => void;
  edit_draft?: EditDraftData | null;
  on_draft_cleared?: () => void;
  initial_to?: string;
}

export function ComposeModal({
  is_open,
  on_close,
  edit_draft,
  on_draft_cleared,
  initial_to,
}: ComposeModalProps) {
  const { t } = use_i18n();
  const reduce_motion = use_should_reduce_motion();
  const [is_minimized, set_is_minimized] = useState(false);
  const [is_expanded, set_is_expanded] = useState(false);
  const { handle_drag_start, get_position_style } = use_draggable_modal(
    is_open,
    MODAL_SIZES.large,
  );

  const compose = use_compose({
    on_close,
    edit_draft,
    on_draft_cleared,
    initial_to,
    session_storage_key: "astermail_pending_send",
    init_trigger: is_open,
    load_contacts_trigger: is_open,
  });

  const is_mobile = useMemo(() => {
    if (typeof window !== "undefined") {
      return window.innerWidth < 640;
    }

    return false;
  }, []);

  useEffect(() => {
    if (!is_open) return;

    const handle_escape = (e: KeyboardEvent) => {
      if (e["key"] === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        on_close();
      }
    };

    document.addEventListener("keydown", handle_escape);

    return () => document.removeEventListener("keydown", handle_escape);
  }, [is_open, on_close]);

  return (
    <AnimatePresence>
      {is_open && (
        <>
          <motion.div
            key="compose-backdrop-mobile"
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-40 bg-black/50 sm:hidden"
            exit={{ opacity: 0 }}
            initial={reduce_motion ? false : { opacity: 0 }}
            transition={{ duration: reduce_motion ? 0 : 0.2 }}
            onClick={compose.handle_close}
          />
          <AnimatePresence>
            {is_expanded && (
              <motion.div
                key="compose-backdrop"
                animate={{ opacity: 1 }}
                className="fixed inset-0 z-40 bg-black/40 backdrop-blur-md hidden sm:block"
                exit={{ opacity: 0 }}
                initial={reduce_motion ? false : { opacity: 0 }}
                transition={{ duration: reduce_motion ? 0 : 0.2 }}
              />
            )}
          </AnimatePresence>
          <motion.div
            key="compose-modal"
            animate={{ opacity: 1, y: 0 }}
            className={`fixed z-50 flex flex-col shadow-2xl sm:border bg-modal-bg border-edge-primary ${
              is_minimized
                ? "sm:w-[320px] sm:h-auto sm:rounded-t-lg"
                : is_expanded
                  ? "inset-0 sm:inset-4 sm:w-auto sm:h-auto sm:rounded-lg"
                  : "inset-0 sm:inset-auto sm:bottom-auto sm:left-auto sm:right-auto sm:h-[600px] sm:w-[700px] sm:max-w-[90vw] sm:max-h-[85vh] sm:rounded-lg"
            }`}
            exit={{ opacity: 0, y: is_mobile ? 100 : 0 }}
            initial={
              reduce_motion ? false : { opacity: 0, y: is_mobile ? 100 : 0 }
            }
            style={{
              willChange: "opacity, transform",
              ...(window.innerWidth >= 640 && !is_expanded && !is_minimized
                ? get_position_style()
                : {}),
              ...(is_minimized && window.innerWidth >= 640
                ? { bottom: 0, right: 24, top: "auto", left: "auto" }
                : {}),
            }}
            transition={{
              duration: reduce_motion ? 0 : 0.25,
              ease: [0.32, 0.72, 0, 1],
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              const files = Array.from(e.dataTransfer?.files || []);
              if (files.length > 0) {
                compose.handle_files_drop(files);
              }
            }}
          >
            <ErrorBoundary fallback={<ComposeErrorFallback />}>
              <div
                className="flex items-center justify-between px-4 py-2 sm:py-3 border-b border-edge-primary sm:cursor-move select-none"
                role="presentation"
                onMouseDown={handle_drag_start}
              >
                <h2 className="text-sm font-medium text-txt-primary">
                  {edit_draft ? t("mail.edit_draft") : t("common.new_message")}
                </h2>
                <div
                  className="flex items-center gap-1"
                  role="presentation"
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <button
                    className="hidden sm:flex transition-colors duration-150 p-1.5 w-7 h-7 items-center justify-center rounded hover_bg text-txt-muted"
                    onClick={() => set_is_minimized(!is_minimized)}
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      viewBox="0 0 24 24"
                    >
                      <path d="M20 12H4" strokeLinecap="round" />
                    </svg>
                  </button>
                  <button
                    className="hidden sm:flex transition-colors duration-150 p-1.5 w-7 h-7 items-center justify-center rounded hover_bg text-txt-muted"
                    onClick={() => {
                      set_is_expanded(!is_expanded);
                      set_is_minimized(false);
                    }}
                  >
                    {is_expanded ? (
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        viewBox="0 0 24 24"
                      >
                        <path
                          d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    ) : (
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        viewBox="0 0 24 24"
                      >
                        <path
                          d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    )}
                  </button>
                  <button
                    className="transition-colors duration-150 p-1.5 w-7 h-7 flex items-center justify-center rounded hover_bg text-txt-muted"
                    onClick={compose.handle_close}
                  >
                    <CloseIcon className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {!is_minimized && (
                <div className="flex-1 flex flex-col min-h-0">
                  <div className="px-4 pt-3 pb-1 min-h-0 overflow-y-auto relative z-20">
                    <div className="flex items-center gap-2 py-2 border-b border-edge-secondary">
                      <span className="text-sm flex-shrink-0 text-txt-tertiary">
                        {t("mail.from")}
                      </span>
                      <SenderSelector
                        disabled={compose.aliases_loading}
                        ghost_error={compose.ghost_mode.error}
                        ghost_expiry_days={compose.ghost_mode.ghost_expiry_days}
                        ghost_locked={compose.ghost_mode.is_thread_locked}
                        is_creating_ghost={compose.ghost_mode.is_creating}
                        on_create_ghost={compose.ghost_mode.toggle_ghost_mode}
                        on_select={compose.set_selected_sender}
                        on_set_ghost_expiry={
                          compose.ghost_mode.set_ghost_expiry_days
                        }
                        on_set_preferred={compose.set_preferred_sender}
                        options={compose.sender_options}
                        preferred_id={compose.preferred_sender_id}
                        selected={compose.selected_sender}
                      />
                    </div>

                    <ComposeFormFields
                      auto_focus_to={is_open && !edit_draft}
                      compose={compose}
                    />
                  </div>

                  <ComposeEditor
                    compose={compose}
                    placeholder={t("mail.write_message_placeholder")}
                  />
                </div>
              )}

              <ComposeAttachments compose={compose} show_add_button />

              <ComposeErrors compose={compose} />

              <ComposeFileInput compose={compose} />

              <ComposeFormatBar
                compose={{
                  ...compose,
                  has_recipients: compose.recipients.to.length > 0,
                  schedule_picker_element: null,
                  expiration_picker_element: null,
                  template_picker_element: null,
                }}
                reduce_motion={reduce_motion}
              />

              <ComposeToolbar
                show_expiration
                compose={{
                  ...compose,
                  has_recipients: compose.recipients.to.length > 0,
                  schedule_picker_element: (
                    <SchedulePicker
                      disabled={compose.recipients.to.length === 0}
                      on_schedule={compose.set_scheduled_time}
                      scheduled_time={compose.scheduled_time}
                    />
                  ),
                  expiration_picker_element: (
                    <ExpirationPicker
                      disabled={
                        compose.recipients.to.length === 0 ||
                        compose.has_external_recipients
                      }
                      expires_at={compose.expires_at}
                      on_expiration_change={compose.set_expires_at}
                      on_password_change={compose.set_expiry_password}
                      password={compose.expiry_password}
                      show_password_option={compose.has_external_recipients}
                    />
                  ),
                  template_picker_element: (
                    <TemplatePicker
                      disabled={compose.is_scheduling}
                      on_select={compose.handle_template_select}
                      open_direction="up"
                    />
                  ),
                }}
                extra_toolbar_items={
                  <SignaturePicker
                    disabled={compose.is_scheduling}
                    on_select={(content) => {
                      if (content) {
                        compose.editor.insert_html(content);
                      }
                    }}
                    open_direction="up"
                  />
                }
                reduce_motion={reduce_motion}
              />

              <ConfirmationModal
                cancel_text={t("common.cancel")}
                confirm_text={t("common.delete")}
                is_open={compose.show_delete_confirm}
                message={t("mail.delete_draft_confirmation")}
                on_cancel={compose.handle_hide_delete_confirm}
                on_confirm={compose.handle_delete_draft}
                title={t("common.delete_draft")}
                variant="danger"
              />

              <ConfirmationModal
                cancel_text={t("common.cancel")}
                confirm_text={t("mail.remove_formatting")}
                is_open={compose.show_plain_text_confirm}
                message={t("mail.plain_text_warning")}
                on_cancel={compose.cancel_plain_text_confirm}
                on_confirm={compose.confirm_plain_text_mode}
                title={t("mail.remove_formatting")}
                variant="warning"
              />
            </ErrorBoundary>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
