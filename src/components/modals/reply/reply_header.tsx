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
import type { SenderOption } from "@/hooks/use_sender_aliases";

import { CloseIcon } from "@/components/common/icons";
import { RecipientBadge } from "@/components/compose/compose_shared";
import { RecipientField } from "@/components/compose/compose_recipients";
import { SenderSelector } from "@/components/compose/sender_selector";
import { use_i18n } from "@/lib/i18n/context";
import { build_reply_subject } from "@/lib/reply_subject";

interface ReplyHeaderProps {
  handle_drag_start: (e: React.MouseEvent) => void;
  is_minimized: boolean;
  set_is_minimized: (val: boolean) => void;
  is_expanded: boolean;
  set_is_expanded: (val: boolean) => void;
  handle_close: () => void;
  sender_options: SenderOption[];
  selected_sender: SenderOption | null;
  set_selected_sender: (val: SenderOption | null) => void;
  recipient_email: string;
  original_subject: string;
  on_create_ghost?: () => void;
  is_creating_ghost?: boolean;
  ghost_expiry_days?: number;
  on_set_ghost_expiry?: (days: number) => void;
  ghost_error?: string | null;
  ghost_locked?: boolean;
  preferred_id?: string | null;
  on_set_preferred?: (id: string | null) => void;
  cc_recipients: string[];
  bcc_recipients: string[];
  cc_input: string;
  bcc_input: string;
  show_cc: boolean;
  show_bcc: boolean;
  set_cc_input: (val: string) => void;
  set_bcc_input: (val: string) => void;
  show_cc_field: () => void;
  show_bcc_field: () => void;
  hide_cc_field: () => void;
  hide_bcc_field: () => void;
  add_cc_recipient: (email: string) => void;
  remove_cc_recipient: (email: string) => void;
  remove_last_cc_recipient: () => void;
  add_bcc_recipient: (email: string) => void;
  remove_bcc_recipient: (email: string) => void;
  remove_last_bcc_recipient: () => void;
}

export function ReplyHeader({
  handle_drag_start,
  is_minimized,
  set_is_minimized,
  is_expanded,
  set_is_expanded,
  handle_close,
  sender_options,
  selected_sender,
  set_selected_sender,
  recipient_email,
  original_subject,
  on_create_ghost,
  is_creating_ghost,
  ghost_expiry_days,
  on_set_ghost_expiry,
  ghost_error,
  ghost_locked,
  preferred_id,
  on_set_preferred,
  cc_recipients,
  bcc_recipients,
  cc_input,
  bcc_input,
  show_cc,
  show_bcc,
  set_cc_input,
  set_bcc_input,
  show_cc_field,
  show_bcc_field,
  hide_cc_field,
  hide_bcc_field,
  add_cc_recipient,
  remove_cc_recipient,
  remove_last_cc_recipient,
  add_bcc_recipient,
  remove_bcc_recipient,
  remove_last_bcc_recipient,
}: ReplyHeaderProps) {
  const { t } = use_i18n();

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
          {t("common.reply_label")}
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
        <div className="px-4 pt-3 pb-1 flex-shrink-0">
          <div className="flex items-center gap-2 py-2 border-b border-edge-secondary">
            <span className="text-sm flex-shrink-0 text-txt-tertiary">
              {t("mail.from")}
            </span>
            <SenderSelector
              ghost_error={ghost_error}
              ghost_expiry_days={ghost_expiry_days}
              ghost_locked={ghost_locked}
              is_creating_ghost={is_creating_ghost}
              on_create_ghost={on_create_ghost}
              on_select={set_selected_sender}
              on_set_ghost_expiry={on_set_ghost_expiry}
              on_set_preferred={on_set_preferred}
              options={sender_options}
              preferred_id={preferred_id}
              selected={selected_sender}
            />
          </div>
          <div className="flex items-center gap-2 py-2 border-b border-edge-secondary">
            <span className="text-sm flex-shrink-0 text-txt-tertiary">
              {t("mail.to")}
            </span>
            <RecipientBadge email={recipient_email} />
            <div className="flex items-center gap-1 flex-shrink-0 ml-auto">
              {!show_cc && (
                <button
                  className="text-xs px-2 py-1 rounded transition-colors hover_bg text-txt-tertiary"
                  title={t("common.carbon_copy")}
                  onClick={show_cc_field}
                >
                  Cc
                </button>
              )}
              {!show_bcc && (
                <button
                  className="text-xs px-2 py-1 rounded transition-colors hover_bg text-txt-tertiary"
                  title={t("common.blind_carbon_copy")}
                  onClick={show_bcc_field}
                >
                  Bcc
                </button>
              )}
            </div>
          </div>

          {show_cc && (
            <div className="py-2 border-b border-edge-secondary">
              <RecipientField
                input_value={cc_input}
                label={t("mail.cc")}
                on_add_recipient={add_cc_recipient}
                on_close={hide_cc_field}
                on_input_change={set_cc_input}
                on_remove_last={remove_last_cc_recipient}
                on_remove_recipient={remove_cc_recipient}
                recipients={cc_recipients}
              />
            </div>
          )}

          {show_bcc && (
            <div className="py-2 border-b border-edge-secondary">
              <RecipientField
                input_value={bcc_input}
                label={t("mail.bcc")}
                on_add_recipient={add_bcc_recipient}
                on_close={hide_bcc_field}
                on_input_change={set_bcc_input}
                on_remove_last={remove_last_bcc_recipient}
                on_remove_recipient={remove_bcc_recipient}
                recipients={bcc_recipients}
              />
            </div>
          )}

          <div className="flex items-center gap-2 py-2 border-b border-edge-secondary">
            <span className="text-sm flex-shrink-0 text-txt-tertiary">
              {t("mail.subject")}
            </span>
            <span className="text-sm truncate text-txt-primary">
              {build_reply_subject(
                original_subject,
                t("mail.reply_subject_prefix"),
              ) || t("mail.no_subject")}
            </span>
          </div>
        </div>
      )}
    </>
  );
}
