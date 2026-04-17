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
import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  XMarkIcon,
  ArrowsPointingOutIcon,
  ArrowsPointingInIcon,
  ArrowTopRightOnSquareIcon,
  PaperAirplaneIcon,
  PencilIcon,
  TrashIcon,
  EllipsisHorizontalIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";

import { EmailTag } from "@/components/ui/email_tag";
import { ProfileAvatar } from "@/components/ui/profile_avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown_menu";
import { ConfirmationModal } from "@/components/modals/confirmation_modal";
import { use_i18n } from "@/lib/i18n/context";
import {
  cancel_scheduled_email,
  send_scheduled_now,
  get_scheduled_email,
  type ScheduledEmailWithContent,
} from "@/services/api/scheduled";
import { use_auth } from "@/contexts/auth_context";
import { use_should_reduce_motion } from "@/provider";
import { show_action_toast } from "@/components/toast/action_toast";
import { show_toast } from "@/components/toast/simple_toast";
import {
  sanitize_html,
  is_html_content,
  has_rich_html,
  plain_text_to_html,
} from "@/lib/html_sanitizer";
import { get_image_proxy_url } from "@/lib/image_proxy";
import { get_email_username } from "@/lib/utils";
import { SandboxedEmailRenderer } from "@/components/email/sandboxed_email_renderer";
import { DdgFavicon } from "@/components/compose/compose_shared";

interface ScheduledData {
  id: string;
  to_recipients: string[];
  cc_recipients: string[];
  bcc_recipients: string[];
  subject: string;
  body: string;
  scheduled_at: string;
}

interface ScheduledPopupViewerProps {
  scheduled_data: ScheduledData;
  on_close: () => void;
  on_edit?: (email: ScheduledEmailWithContent) => void;
}

function format_scheduled_time(
  iso_string: string,
  t: (key: never, params?: Record<string, string | number>) => string,
): string {
  const date = new Date(iso_string);
  const now = new Date();
  const diff_ms = date.getTime() - now.getTime();
  const diff_hours = diff_ms / (1000 * 60 * 60);

  if (diff_hours < 0) {
    return t("common.sending_soon" as never);
  }

  if (diff_hours < 1) {
    const mins = Math.round(diff_hours * 60);

    return mins !== 1
      ? t("common.in_n_minutes_plural" as never, { count: mins })
      : t("common.in_n_minutes" as never, { count: mins });
  }

  if (diff_hours < 24) {
    return date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return date.toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function format_full_date(iso_string: string): string {
  const date = new Date(iso_string);

  return date.toLocaleDateString([], {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type PopupSize = "default" | "expanded" | "fullscreen";

const POPUP_MARGIN = 16;
const FULLSCREEN_MARGIN = 64;

export function ScheduledPopupViewer({
  scheduled_data,
  on_close,
  on_edit,
}: ScheduledPopupViewerProps) {
  const { t } = use_i18n();
  const { vault } = use_auth();
  const reduce_motion = use_should_reduce_motion();
  const [popup_size, set_popup_size] = useState<PopupSize>("default");
  const [position, set_position] = useState({ x: 0, y: 0 });
  const [is_dragging, set_is_dragging] = useState(false);
  const [show_details, set_show_details] = useState(false);
  const [show_cancel_confirm, set_show_cancel_confirm] = useState(false);
  const [is_cancelling, set_is_cancelling] = useState(false);
  const [is_sending_now, set_is_sending_now] = useState(false);
  const [is_loading_content, set_is_loading_content] = useState(false);
  const [is_exiting_fullscreen, set_is_exiting_fullscreen] = useState(false);
  const drag_start_ref = useRef({ x: 0, y: 0, pos_x: 0, pos_y: 0 });
  const popup_ref = useRef<HTMLDivElement>(null);

  const is_fullscreen = popup_size === "fullscreen";

  const dimensions = useMemo(() => {
    if (is_fullscreen) {
      return {
        width: window.innerWidth - FULLSCREEN_MARGIN * 2,
        height: window.innerHeight - FULLSCREEN_MARGIN * 2,
      };
    }

    return {
      width: 680,
      height: popup_size === "expanded" ? 860 : 720,
    };
  }, [popup_size, is_fullscreen]);

  useEffect(() => {
    set_position({
      x: window.innerWidth - dimensions.width - POPUP_MARGIN,
      y: window.innerHeight - dimensions.height - POPUP_MARGIN,
    });
  }, []);

  const handle_drag_start = useCallback(
    (e: React.MouseEvent) => {
      if (is_fullscreen) return;
      if ((e.target as HTMLElement).closest("button")) return;
      if ((e.target as HTMLElement).closest("[data-no-drag]")) return;
      set_is_dragging(true);
      drag_start_ref.current = {
        x: e.clientX,
        y: e.clientY,
        pos_x: position.x,
        pos_y: position.y,
      };
    },
    [position, is_fullscreen],
  );

  useEffect(() => {
    if (!is_dragging) return;

    const handle_mouse_move = (e: MouseEvent) => {
      const dx = e.clientX - drag_start_ref.current.x;
      const dy = e.clientY - drag_start_ref.current.y;

      set_position({
        x: drag_start_ref.current.pos_x + dx,
        y: drag_start_ref.current.pos_y + dy,
      });
    };

    const handle_mouse_up = () => {
      set_is_dragging(false);
    };

    document.addEventListener("mousemove", handle_mouse_move);
    document.addEventListener("mouseup", handle_mouse_up);

    return () => {
      document.removeEventListener("mousemove", handle_mouse_move);
      document.removeEventListener("mouseup", handle_mouse_up);
    };
  }, [is_dragging]);

  const toggle_size = useCallback(() => {
    if (is_fullscreen) return;

    const new_size = popup_size === "default" ? "expanded" : "default";
    const new_height = new_size === "expanded" ? 820 : 640;

    set_popup_size(new_size);
    set_position((prev) => ({
      x: prev.x,
      y: Math.max(POPUP_MARGIN, window.innerHeight - new_height - POPUP_MARGIN),
    }));
  }, [popup_size, is_fullscreen]);

  const handle_fullscreen = useCallback(() => {
    if (is_fullscreen) {
      set_is_exiting_fullscreen(true);
      setTimeout(() => {
        set_popup_size("default");
        set_position({
          x: window.innerWidth - 520 - POPUP_MARGIN,
          y: window.innerHeight - 640 - POPUP_MARGIN,
        });
        set_is_exiting_fullscreen(false);
      }, 150);
    } else {
      set_popup_size("fullscreen");
    }
  }, [is_fullscreen]);

  const handle_cancel = useCallback(async () => {
    set_is_cancelling(true);

    const response = await cancel_scheduled_email(scheduled_data.id);

    set_is_cancelling(false);
    set_show_cancel_confirm(false);

    if (!response.error) {
      show_action_toast({
        message: t("common.scheduled_email_cancelled"),
        action_type: "trash",
        email_ids: [scheduled_data.id],
      });
      window.dispatchEvent(new CustomEvent("astermail:mail-changed"));
      on_close();
    }
  }, [scheduled_data.id, on_close]);

  const handle_send_now = useCallback(async () => {
    set_is_sending_now(true);

    const response = await send_scheduled_now(scheduled_data.id);

    set_is_sending_now(false);

    if (!response.error) {
      show_toast(t("common.email_sent_successfully"), "success");
      window.dispatchEvent(new CustomEvent("astermail:mail-changed"));
      on_close();
    }
  }, [scheduled_data.id, on_close]);

  const handle_edit = useCallback(async () => {
    if (!vault || !on_edit) return;

    set_is_loading_content(true);

    const response = await get_scheduled_email(scheduled_data.id, vault);

    set_is_loading_content(false);

    if (!response.error && response.data) {
      on_edit(response.data);
      on_close();
    }
  }, [scheduled_data.id, vault, on_edit, on_close]);

  const primary_recipient = scheduled_data.to_recipients[0] || "";
  const recipient_name =
    get_email_username(primary_recipient) || t("common.recipient");

  const popup_left = is_fullscreen
    ? FULLSCREEN_MARGIN
    : Math.max(0, Math.min(window.innerWidth - dimensions.width, position.x));

  const popup_top = is_fullscreen
    ? FULLSCREEN_MARGIN
    : Math.max(0, Math.min(window.innerHeight - dimensions.height, position.y));

  const popup_content = (
    <motion.div
      ref={popup_ref}
      animate={{ opacity: 1 }}
      className="fixed z-50 flex flex-col shadow-2xl bg-modal-bg border border-edge-primary"
      exit={{ opacity: 0 }}
      initial={reduce_motion ? false : { opacity: 0 }}
      style={{
        left: popup_left,
        top: popup_top,
        width: dimensions.width,
        height: dimensions.height,
        cursor: is_fullscreen
          ? "default"
          : is_dragging
            ? "grabbing"
            : "default",
        borderRadius: is_fullscreen ? "16px" : "12px",
        willChange: "opacity",
      }}
      transition={{ duration: reduce_motion ? 0 : 0.15, ease: "easeOut" }}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        className="flex items-center gap-1 px-3 py-2 flex-shrink-0 select-none border-b border-edge-primary"
        role="presentation"
        style={{
          cursor: is_fullscreen ? "default" : is_dragging ? "grabbing" : "grab",
          borderTopLeftRadius: is_fullscreen ? "16px" : "12px",
          borderTopRightRadius: is_fullscreen ? "16px" : "12px",
        }}
        onMouseDown={handle_drag_start}
      >
        <Button
          data-no-drag
          className="h-7 w-7 text-txt-muted hover:text-txt-primary"
          size="icon"
          variant="ghost"
          onClick={on_close}
        >
          <XMarkIcon className="w-4 h-4" />
        </Button>

        {!is_fullscreen && (
          <Button
            data-no-drag
            className="h-7 w-7 text-txt-muted hover:text-txt-primary"
            size="icon"
            variant="ghost"
            onClick={toggle_size}
          >
            {popup_size === "default" ? (
              <ArrowsPointingOutIcon className="w-4 h-4" />
            ) : (
              <ArrowsPointingInIcon className="w-4 h-4" />
            )}
          </Button>
        )}

        <Button
          data-no-drag
          className="h-7 w-7 text-txt-muted hover:text-txt-primary"
          size="icon"
          variant="ghost"
          onClick={handle_fullscreen}
        >
          {is_fullscreen ? (
            <ArrowsPointingInIcon className="w-4 h-4" />
          ) : (
            <ArrowTopRightOnSquareIcon className="w-4 h-4" />
          )}
        </Button>

        <div className="w-px h-4 mx-1 bg-edge-secondary" />

        <EmailTag label={t("common.scheduled_label")} variant="scheduled" />

        <div className="flex-1" />

        {on_edit && (
          <Button
            data-no-drag
            className="h-7 w-7 text-txt-muted hover:text-txt-primary"
            disabled={is_loading_content}
            size="icon"
            variant="ghost"
            onClick={handle_edit}
          >
            <PencilIcon className="w-4 h-4" />
          </Button>
        )}

        <Button
          data-no-drag
          className="h-7 w-7 text-txt-muted hover:text-red-500"
          disabled={is_cancelling}
          size="icon"
          variant="ghost"
          onClick={() => set_show_cancel_confirm(true)}
        >
          <TrashIcon className="w-4 h-4" />
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              data-no-drag
              className="h-7 w-7 text-txt-muted hover:text-txt-primary"
              size="icon"
              variant="ghost"
            >
              <EllipsisHorizontalIcon className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem
              disabled={is_sending_now}
              onClick={handle_send_now}
            >
              <PaperAirplaneIcon className="w-4 h-4 mr-2" />
              {is_sending_now ? t("common.sending") : t("common.send_now")}
            </DropdownMenuItem>
            {on_edit && (
              <DropdownMenuItem
                disabled={is_loading_content}
                onClick={handle_edit}
              >
                <PencilIcon className="w-4 h-4 mr-2" />
                {is_loading_content
                  ? t("common.loading")
                  : t("common.edit_reschedule")}
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-red-500 focus:text-red-500"
              onClick={() => set_show_cancel_confirm(true)}
            >
              <TrashIcon className="w-4 h-4 mr-2" />
              {t("common.cancel_scheduled")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="p-4">
          <h1 className="text-lg font-semibold leading-snug mb-4 break-words text-txt-primary">
            {scheduled_data.subject || t("mail.no_subject")}
          </h1>

          <div className="flex items-start gap-3">
            <ProfileAvatar
              clickable
              email={primary_recipient}
              name={recipient_name}
              size="md"
            />

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm flex items-center gap-1 flex-wrap text-txt-primary">
                  <span>{t("common.to_label")}</span>
                  {scheduled_data.to_recipients.map((email, i) => (
                    <span
                      key={email}
                      className="inline-flex items-center gap-1"
                    >
                      <DdgFavicon email={email} size={14} />
                      <span>{email}</span>
                      {i < scheduled_data.to_recipients.length - 1 && (
                        <span>,</span>
                      )}
                    </span>
                  ))}
                </span>
              </div>

              <button
                className="text-xs text-txt-muted hover:text-txt-secondary transition-colors text-left"
                onClick={() => set_show_details(!show_details)}
              >
                {show_details ? "Hide details ▲" : "Show details ▼"}
              </button>

              <AnimatePresence>
                {show_details && (
                  <motion.div
                    animate={{ height: "auto", opacity: 1 }}
                    className="overflow-hidden"
                    exit={{ height: 0, opacity: 0 }}
                    initial={reduce_motion ? false : { height: 0, opacity: 0 }}
                    transition={{ duration: reduce_motion ? 0 : 0.15 }}
                  >
                    <div className="mt-2 p-2 rounded-md text-xs space-y-1 bg-surf-secondary">
                      <div className="flex items-start">
                        <span className="w-14 flex-shrink-0 pt-0.5 text-txt-muted">
                          {t("common.to_label")}
                        </span>
                        <span className="flex-1 flex flex-wrap items-center gap-1 text-txt-secondary">
                          {scheduled_data.to_recipients.map((email, i) => (
                            <span
                              key={email}
                              className="inline-flex items-center gap-1"
                            >
                              <DdgFavicon email={email} size={14} />
                              <span>{email}</span>
                              {i < scheduled_data.to_recipients.length - 1 && (
                                <span>,</span>
                              )}
                            </span>
                          ))}
                        </span>
                      </div>
                      {scheduled_data.cc_recipients.length > 0 && (
                        <div className="flex items-start">
                          <span className="w-14 flex-shrink-0 pt-0.5 text-txt-muted">
                            {t("common.cc_label")}
                          </span>
                          <span className="flex-1 flex flex-wrap items-center gap-1 text-txt-secondary">
                            {scheduled_data.cc_recipients.map((email, i) => (
                              <span
                                key={email}
                                className="inline-flex items-center gap-1"
                              >
                                <DdgFavicon email={email} size={14} />
                                <span>{email}</span>
                                {i <
                                  scheduled_data.cc_recipients.length - 1 && (
                                  <span>,</span>
                                )}
                              </span>
                            ))}
                          </span>
                        </div>
                      )}
                      {scheduled_data.bcc_recipients.length > 0 && (
                        <div className="flex items-start">
                          <span className="w-14 flex-shrink-0 pt-0.5 text-txt-muted">
                            {t("common.bcc_label")}
                          </span>
                          <span className="flex-1 flex flex-wrap items-center gap-1 text-txt-secondary">
                            {scheduled_data.bcc_recipients.map((email, i) => (
                              <span
                                key={email}
                                className="inline-flex items-center gap-1"
                              >
                                <DdgFavicon email={email} size={14} />
                                <span>{email}</span>
                                {i <
                                  scheduled_data.bcc_recipients.length - 1 && (
                                  <span>,</span>
                                )}
                              </span>
                            ))}
                          </span>
                        </div>
                      )}
                      <div className="flex">
                        <span className="w-14 flex-shrink-0 text-txt-muted">
                          {t("common.subject_label")}
                        </span>
                        <span className="text-txt-secondary">
                          {scheduled_data.subject || t("mail.no_subject")}
                        </span>
                      </div>
                      <div className="flex">
                        <span className="w-14 flex-shrink-0 text-txt-muted">
                          Send at:
                        </span>
                        <span className="text-txt-secondary">
                          {format_full_date(scheduled_data.scheduled_at)}
                        </span>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="flex items-center gap-1 flex-shrink-0">
              <EmailTag
                icon="clock"
                label={format_scheduled_time(scheduled_data.scheduled_at, t)}
                variant="scheduled"
              />
            </div>
          </div>
        </div>

        <div className="px-4 pb-4">
          <SandboxedEmailRenderer
            is_plain_text={!has_rich_html(scheduled_data.body)}
            sanitized_html={
              is_html_content(scheduled_data.body)
                ? sanitize_html(scheduled_data.body, {
                    image_proxy_url: get_image_proxy_url(),
                    sandbox_mode: true,
                  }).html
                : plain_text_to_html(scheduled_data.body)
            }
          />
        </div>
      </div>

      <div
        className="flex-shrink-0 border-t border-edge-primary bg-modal-bg"
        style={{
          borderBottomLeftRadius: is_fullscreen ? "16px" : "12px",
          borderBottomRightRadius: is_fullscreen ? "16px" : "12px",
        }}
      >
        <div className="flex items-center gap-2 p-3">
          <Button
            className="flex-1"
            disabled={is_sending_now}
            variant="depth"
            onClick={handle_send_now}
          >
            <PaperAirplaneIcon className="w-4 h-4" />
            {is_sending_now ? t("common.sending") : t("common.send_now")}
          </Button>
          {on_edit && (
            <button
              className="flex-1 h-10 flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition-all duration-150 hover:bg-surf-hover disabled:opacity-50 disabled:cursor-not-allowed bg-surf-secondary text-txt-primary shadow-[0_1px_2px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.06),inset_0_0_0_1px_var(--border-primary)]"
              disabled={is_loading_content}
              onClick={handle_edit}
            >
              <PencilIcon className="w-4 h-4" />
              {is_loading_content ? t("common.loading") : t("common.edit")}
            </button>
          )}
        </div>
      </div>

      <ConfirmationModal
        cancel_text={t("mail.keep_scheduled")}
        confirm_text={
          is_cancelling ? t("mail.cancelling") : t("mail.cancel_email")
        }
        is_open={show_cancel_confirm}
        message={t("mail.cancel_scheduled_confirmation")}
        on_cancel={() => set_show_cancel_confirm(false)}
        on_confirm={handle_cancel}
        title={t("mail.cancel_scheduled_email")}
        variant="danger"
      />
    </motion.div>
  );

  if (is_fullscreen) {
    return (
      <motion.div
        animate={{ opacity: is_exiting_fullscreen ? 0 : 1 }}
        className="fixed inset-0 z-[60] flex items-center justify-center"
        initial={reduce_motion ? false : { opacity: 0 }}
        transition={{ duration: reduce_motion ? 0 : 0.2 }}
      >
        <div
          className="absolute inset-0 bg-black/40 backdrop-blur-md"
          role="button"
          tabIndex={0}
          onClick={on_close}
          onKeyDown={(e) => {
            if (e["key"] === "Enter" || e["key"] === " ") {
              e.preventDefault();
              on_close();
            }
          }}
        />
        {popup_content}
      </motion.div>
    );
  }

  return popup_content;
}
