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
import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

import { CloseIcon } from "@/components/common/icons";
import { ConfirmationModal } from "@/components/modals/confirmation_modal";
import { SchedulePicker } from "@/components/compose/schedule_picker";
import { ExpirationPicker } from "@/components/compose/expiration_picker";
import { TemplatePicker } from "@/components/compose/template_picker";
import { SignaturePicker } from "@/components/compose/signature_picker";
import { SenderSelector } from "@/components/compose/sender_selector";
import { use_draggable_modal } from "@/hooks/use_draggable_modal";
import { use_should_reduce_motion } from "@/provider";
import {
  ErrorBoundary,
  ComposeErrorFallback,
} from "@/components/ui/error_boundary";
import { use_i18n } from "@/lib/i18n/context";
import { use_preferences } from "@/contexts/preferences_context";
import { use_compose } from "@/components/compose/use_compose";
import {
  ComposeFormFields,
  ComposeEditor,
  ComposeAttachments,
  ComposeErrors,
  ComposeFileInput,
  ComposeToolbar,
  type EditDraftData,
} from "@/components/compose/compose_shared";

interface ComposeWindowProps {
  instance_id: string;
  is_minimized: boolean;
  on_close: () => void;
  on_toggle_minimize: () => void;
  edit_draft?: EditDraftData | null;
  on_draft_cleared?: () => void;
  initial_to?: string;
  initial_ghost_mode?: boolean;
}

const WINDOW_WIDTH = 700;
const WINDOW_WIDTH_MINIMIZED = 320;
const WINDOW_HEIGHT_NORMAL = 600;
const RESIZE_MIN_WIDTH = 420;
const RESIZE_MIN_HEIGHT = 340;

export function ComposeWindow({
  instance_id,
  is_minimized,
  on_close,
  on_toggle_minimize,
  edit_draft,
  on_draft_cleared,
  initial_to,
  initial_ghost_mode,
}: ComposeWindowProps) {
  const reduce_motion = use_should_reduce_motion();
  const { t } = use_i18n();
  const { preferences } = use_preferences();
  const [is_expanded, set_is_expanded] = useState(
    () => (preferences.compose_window_mode ?? "default") === "fullscreen",
  );

  const [resize_state, set_resize_state] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [is_resizing, set_is_resizing] = useState(false);

  const effective_width = resize_state?.width ?? WINDOW_WIDTH;
  const effective_height = resize_state?.height ?? WINDOW_HEIGHT_NORMAL;

  const {
    handle_drag_start,
    get_position_style,
    has_been_moved,
    did_drag,
    reset: reset_drag_position,
  } = use_draggable_modal(!is_minimized && !is_expanded, {
    width: is_minimized ? WINDOW_WIDTH_MINIMIZED : effective_width,
    height: effective_height,
  });

  const handle_resize_start = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const start_x = e.clientX;
      const start_y = e.clientY;
      const start_width = effective_width;
      const start_height = effective_height;

      set_is_resizing(true);

      const handle_move = (ev: MouseEvent) => {
        const dx = ev.clientX - start_x;
        const dy = ev.clientY - start_y;
        const max_width = window.innerWidth - 48;
        const max_height = window.innerHeight - 48;

        const new_width = Math.min(
          max_width,
          Math.max(RESIZE_MIN_WIDTH, start_width - dx),
        );
        const new_height = Math.min(
          max_height,
          Math.max(RESIZE_MIN_HEIGHT, start_height - dy),
        );

        set_resize_state({ width: new_width, height: new_height });
      };

      const handle_up = () => {
        set_is_resizing(false);
        window.removeEventListener("mousemove", handle_move);
        window.removeEventListener("mouseup", handle_up);
      };

      window.addEventListener("mousemove", handle_move);
      window.addEventListener("mouseup", handle_up);
    },
    [effective_width, effective_height],
  );

  const compose = use_compose({
    on_close,
    edit_draft,
    on_draft_cleared,
    initial_to,
    session_storage_key: `astermail_pending_send_${instance_id}`,
    enable_offline_queue: true,
    enable_ctrl_enter_send: true,
  });

  useEffect(() => {
    if (!initial_ghost_mode) return;
    if (compose.ghost_mode.is_ghost_enabled) return;
    compose.ghost_mode.toggle_ghost_mode();
  }, [initial_ghost_mode]);

  const handle_header_click = useCallback(() => {
    if (did_drag()) {
      return;
    }
    on_toggle_minimize();
  }, [did_drag, on_toggle_minimize]);

  const handle_header_mouse_down = useCallback(
    (e: React.MouseEvent) => {
      if (is_minimized) {
        return;
      }
      handle_drag_start(e);
    },
    [is_minimized, handle_drag_start],
  );

  useEffect(() => {
    if (is_minimized) {
      reset_drag_position();
      set_resize_state(null);
    }
  }, [is_minimized, reset_drag_position]);

  const schedule_picker = (
    <SchedulePicker
      disabled={compose.recipients.to.length === 0}
      on_schedule={compose.set_scheduled_time}
      scheduled_time={compose.scheduled_time}
    />
  );

  const expiration_picker = (
    <ExpirationPicker
      show_password_option
      disabled={compose.recipients.to.length === 0}
      expires_at={compose.expires_at}
      on_expiration_change={compose.set_expires_at}
      on_password_change={compose.set_expiry_password}
      password={compose.expiry_password}
    />
  );

  const template_picker = (
    <TemplatePicker
      disabled={compose.is_scheduling}
      on_select={compose.handle_template_select}
      open_direction="up"
    />
  );

  const compose_with_pickers = {
    ...compose,
    has_recipients: compose.recipients.to.length > 0,
    schedule_picker_element: schedule_picker,
    expiration_picker_element: expiration_picker,
    template_picker_element: template_picker,
  };

  const window_title =
    compose.subject ||
    (compose.recipients.to.length > 0
      ? compose.recipients.to[0].split("@")[0]
      : t("mail.new_message"));

  const is_mobile_fullscreen =
    !is_expanded && !is_minimized && window.innerWidth < 640;

  return (
    <>
      {is_mobile_fullscreen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 sm:hidden"
          role="presentation"
          onClick={compose.handle_close}
        />
      )}
      <AnimatePresence>
        {is_expanded && (
          <motion.div
            key="compose-backdrop"
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-md"
            exit={{ opacity: 0 }}
            initial={reduce_motion ? false : { opacity: 0 }}
            transition={{ duration: reduce_motion ? 0 : 0.2 }}
            onClick={() => set_is_expanded(false)}
          />
        )}
      </AnimatePresence>
      <div
        className={`flex flex-col shadow-2xl border overflow-hidden bg-modal-bg border-edge-primary ${
          is_expanded
            ? "fixed inset-4 z-50 rounded-lg"
            : is_minimized
              ? "rounded-t-lg"
              : "fixed inset-0 z-50 sm:relative sm:inset-auto sm:z-auto rounded-none sm:rounded-t-lg"
        } ${has_been_moved && !is_expanded && !is_minimized ? "sm:!fixed sm:!z-50" : ""}`}
        style={{
          ...(is_expanded
            ? { width: "auto", height: "auto" }
            : is_minimized
              ? {
                  width: WINDOW_WIDTH_MINIMIZED,
                  height: "auto",
                  minWidth: WINDOW_WIDTH_MINIMIZED,
                  maxWidth: WINDOW_WIDTH_MINIMIZED,
                }
              : window.innerWidth < 640
                ? {}
                : {
                    width: effective_width,
                    height: effective_height,
                    minWidth: RESIZE_MIN_WIDTH,
                    maxWidth: window.innerWidth - 48,
                  }),
          ...(has_been_moved &&
          !is_expanded &&
          !is_minimized &&
          window.innerWidth >= 640
            ? get_position_style()
            : {}),
          ...(is_resizing ? { transition: "none", userSelect: "none" } : {}),
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
            className={`flex items-center justify-between px-4 py-3 border-b border-edge-primary select-none flex-shrink-0 ${
              is_minimized ? "cursor-pointer" : "cursor-move"
            }`}
            role="presentation"
            onClick={handle_header_click}
            onMouseDown={handle_header_mouse_down}
          >
            <h2 className="text-sm font-medium truncate flex-1 mr-2 text-txt-primary">
              {window_title}
            </h2>
            <div
              className="flex items-center gap-1"
              role="presentation"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                aria-label={
                  is_minimized
                    ? t("mail.expand_compose")
                    : t("mail.minimize_compose")
                }
                className="transition-colors duration-150 p-1.5 w-7 h-7 flex items-center justify-center rounded hover_bg text-txt-muted"
                onClick={on_toggle_minimize}
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
                aria-label={
                  is_expanded
                    ? t("mail.exit_fullscreen")
                    : t("mail.enter_fullscreen")
                }
                className="transition-colors duration-150 p-1.5 w-7 h-7 flex items-center justify-center rounded hover_bg text-txt-muted"
                onClick={() => set_is_expanded(!is_expanded)}
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
                aria-label={t("mail.close_compose")}
                className="transition-colors duration-150 p-1.5 w-7 h-7 flex items-center justify-center rounded hover_bg text-txt-muted"
                onClick={compose.handle_close}
              >
                <CloseIcon className="w-4 h-4" />
              </button>
            </div>
          </div>

          {!is_minimized && (
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
              <div className="px-4 pt-3 relative z-20">
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
              </div>

              <div className="px-4 pb-2 min-h-0 overflow-y-auto">
                <ComposeFormFields compose={compose} />
              </div>

              <ComposeEditor compose={compose} />
            </div>
          )}

          {!is_minimized && <ComposeAttachments compose={compose} />}

          {!is_minimized && <ComposeErrors compose={compose} />}

          <ComposeFileInput compose={compose} />

          {!is_minimized && (
            <ComposeToolbar
              show_expiration
              compose={compose_with_pickers}
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
          )}

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
            confirm_text={t("common.remove_formatting")}
            is_open={compose.show_plain_text_confirm}
            message={t("common.remove_formatting_warning")}
            on_cancel={compose.cancel_plain_text_confirm}
            on_confirm={compose.confirm_plain_text_mode}
            title={t("common.remove_formatting")}
            variant="warning"
          />
        </ErrorBoundary>
        {!is_minimized && !is_expanded && (
          <div
            aria-label={t("mail.resize_compose")}
            className="hidden sm:flex absolute top-0 left-0 w-4 h-4 items-start justify-start cursor-nwse-resize z-10 touch-none"
            role="button"
            tabIndex={-1}
            onMouseDown={handle_resize_start}
          >
            <svg
              className="w-2.5 h-2.5 mt-0.5 ml-0.5 text-txt-muted/60"
              fill="none"
              viewBox="0 0 10 10"
            >
              <path
                d="M9 9L1 1M9 5L5 1"
                stroke="currentColor"
                strokeLinecap="round"
                strokeWidth="1.25"
              />
            </svg>
          </div>
        )}
      </div>
    </>
  );
}
