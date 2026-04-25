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
import type { DecryptedContact } from "@/types/contacts";
import type { TranslationKey } from "@/lib/i18n";
import type { SenderOption } from "@/hooks/use_sender_aliases";

import { CloseIcon } from "@/components/common/icons";
import {
  type RecipientsState,
  type RecipientsAction,
  type InputsState,
  type VisibilityState,
  RecipientField,
} from "@/components/compose/compose_shared";
import { SenderSelector } from "@/components/compose/sender_selector";

interface ForwardHeaderProps {
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
  handle_drag_start: (e: React.MouseEvent) => void;
  is_minimized: boolean;
  set_is_minimized: (val: boolean) => void;
  is_expanded: boolean;
  set_is_expanded: (val: boolean) => void;
  handle_close: () => void;
  sender_options: SenderOption[];
  selected_sender: SenderOption | null;
  set_selected_sender: (val: SenderOption | null) => void;
  recipients: RecipientsState;
  dispatch_recipients: React.Dispatch<RecipientsAction>;
  inputs: InputsState;
  set_inputs: React.Dispatch<React.SetStateAction<InputsState>>;
  visibility: VisibilityState;
  set_visibility: React.Dispatch<React.SetStateAction<VisibilityState>>;
  contacts: DecryptedContact[];
  email_subject: string;
  on_create_ghost?: () => void;
  is_creating_ghost?: boolean;
  ghost_expiry_days?: number;
  on_set_ghost_expiry?: (days: number) => void;
  ghost_error?: string | null;
}

export function ForwardHeader({
  t,
  handle_drag_start,
  is_minimized,
  set_is_minimized,
  is_expanded,
  set_is_expanded,
  handle_close,
  sender_options,
  selected_sender,
  set_selected_sender,
  recipients,
  dispatch_recipients,
  inputs,
  set_inputs,
  visibility,
  set_visibility,
  contacts,
  email_subject,
  on_create_ghost,
  is_creating_ghost,
  ghost_expiry_days,
  on_set_ghost_expiry,
  ghost_error,
}: ForwardHeaderProps) {
  return (
    <>
      <div
        className="w-12 h-1.5 bg-default-300 rounded-full mx-auto mt-2 mb-1 sm:hidden"
        style={{ opacity: 0.5 }}
      />
      <div
        className="flex items-center justify-between px-4 py-2 sm:py-3 border-b border-edge-primary sm:cursor-move select-none"
        role="presentation"
        onMouseDown={handle_drag_start}
      >
        <h2 className="text-sm font-medium text-txt-primary">
          {t("common.forward_label" as TranslationKey)}
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
            onClick={handle_close}
          >
            <CloseIcon className="w-4 h-4" />
          </button>
        </div>
      </div>

      {!is_minimized && (
        <div className="px-4 pt-3 pb-1 flex-shrink-0 overflow-visible relative z-20">
          <div className="flex items-center gap-2 py-2 border-b border-edge-secondary">
            <span className="text-sm flex-shrink-0 text-txt-tertiary">
              {t("common.from_label")}
            </span>
            <SenderSelector
              ghost_error={ghost_error}
              ghost_expiry_days={ghost_expiry_days}
              is_creating_ghost={is_creating_ghost}
              on_create_ghost={on_create_ghost}
              on_select={set_selected_sender}
              on_set_ghost_expiry={on_set_ghost_expiry}
              options={sender_options}
              selected={selected_sender}
            />
          </div>

          <div className="py-2 border-b border-edge-secondary">
            <RecipientField
              auto_focus
              show_cc_bcc_buttons
              contacts={contacts}
              input_value={inputs.to}
              label={t("mail.to")}
              on_add_recipient={(email) => {
                dispatch_recipients({
                  type: "ADD",
                  field: "to",
                  email,
                });
              }}
              on_input_change={(val) =>
                set_inputs((prev) => ({ ...prev, to: val }))
              }
              on_remove_last={() => {
                dispatch_recipients({
                  type: "REMOVE_LAST",
                  field: "to",
                });
              }}
              on_remove_recipient={(email) => {
                dispatch_recipients({
                  type: "REMOVE",
                  field: "to",
                  email,
                });
              }}
              on_show_bcc={() =>
                set_visibility((prev) => ({ ...prev, bcc: true }))
              }
              on_show_cc={() =>
                set_visibility((prev) => ({ ...prev, cc: true }))
              }
              recipients={recipients.to}
              show_bcc={visibility.bcc}
              show_cc={visibility.cc}
            />
          </div>

          {visibility.cc && (
            <div className="py-2 border-b border-edge-secondary">
              <RecipientField
                contacts={contacts}
                input_value={inputs.cc}
                label={t("mail.cc")}
                on_add_recipient={(email) => {
                  dispatch_recipients({
                    type: "ADD",
                    field: "cc",
                    email,
                  });
                }}
                on_close={() =>
                  set_visibility((prev) => ({ ...prev, cc: false }))
                }
                on_input_change={(val) =>
                  set_inputs((prev) => ({ ...prev, cc: val }))
                }
                on_remove_last={() => {
                  dispatch_recipients({
                    type: "REMOVE_LAST",
                    field: "cc",
                  });
                }}
                on_remove_recipient={(email) => {
                  dispatch_recipients({
                    type: "REMOVE",
                    field: "cc",
                    email,
                  });
                }}
                recipients={recipients.cc}
              />
            </div>
          )}

          {visibility.bcc && (
            <div className="py-2 border-b border-edge-secondary">
              <RecipientField
                contacts={contacts}
                input_value={inputs.bcc}
                label={t("mail.bcc")}
                on_add_recipient={(email) => {
                  dispatch_recipients({
                    type: "ADD",
                    field: "bcc",
                    email,
                  });
                }}
                on_close={() =>
                  set_visibility((prev) => ({ ...prev, bcc: false }))
                }
                on_input_change={(val) =>
                  set_inputs((prev) => ({ ...prev, bcc: val }))
                }
                on_remove_last={() => {
                  dispatch_recipients({
                    type: "REMOVE_LAST",
                    field: "bcc",
                  });
                }}
                on_remove_recipient={(email) => {
                  dispatch_recipients({
                    type: "REMOVE",
                    field: "bcc",
                    email,
                  });
                }}
                recipients={recipients.bcc}
              />
            </div>
          )}

          <div className="flex items-center gap-2 py-2 border-b border-edge-secondary">
            <span className="text-sm flex-shrink-0 text-txt-tertiary">
              {t("common.subject_label")}
            </span>
            <span className="text-sm truncate text-txt-primary">
              {t("mail.forward_subject_prefix")} {email_subject}
            </span>
          </div>
        </div>
      )}
    </>
  );
}
