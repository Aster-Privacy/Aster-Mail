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
import type { MobileComposePageProps } from "./mobile_compose_helpers";

import { useState, useCallback, useMemo, useEffect } from "react";
import { motion } from "framer-motion";
import { format } from "date-fns";
import {
  XMarkIcon,
  PaperClipIcon,
  PhotoIcon,
  TrashIcon,
  PaperAirplaneIcon,
  ClockIcon,
  FireIcon,
  ChevronDownIcon,
  LockClosedIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";

import {
  MobileSenderIcon,
  format_expiry_relative,
} from "./mobile_compose_helpers";
import { MobileRecipientRow } from "./mobile_compose_recipients";
import {
  MobileSenderSheet,
  MobileScheduleSheet,
  MobileExpirationSheet,
  MobileGhostSheet,
} from "./mobile_compose_bottom_sheets";
import { use_mobile_compose_images } from "./use_mobile_compose_images";

import { use_compose } from "@/components/compose/use_compose";
import { use_should_reduce_motion } from "@/provider";
import { use_i18n } from "@/lib/i18n/context";
import { use_preferences } from "@/contexts/preferences_context";
import { ConfirmationModal } from "@/components/modals/confirmation_modal";
import { MobileHeader } from "@/components/mobile/mobile_header";
import { Spinner } from "@/components/ui/spinner";
import { Input } from "@/components/ui/input";
import { authenticate_biometric } from "@/native/biometric_auth";
import {
  haptic_impact,
  haptic_send_success,
  haptic_error,
} from "@/native/haptic_feedback";

function MobileComposePage({
  on_close,
  initial_to,
  edit_draft,
}: MobileComposePageProps) {
  const { t } = use_i18n();
  const reduce_motion = use_should_reduce_motion();
  const { preferences, update_preference, save_now } = use_preferences();
  const [show_cc, set_show_cc] = useState(false);
  const [show_bcc, set_show_bcc] = useState(false);
  const [show_sender_sheet, set_show_sender_sheet] = useState(false);
  const [show_schedule_sheet, set_show_schedule_sheet] = useState(false);
  const [show_expiration_sheet, set_show_expiration_sheet] = useState(false);
  const [show_ghost_sheet, set_show_ghost_sheet] = useState(false);
  const [to_expanded, set_to_expanded] = useState(false);
  const [cc_expanded, set_cc_expanded] = useState(false);
  const [bcc_expanded, set_bcc_expanded] = useState(false);

  useEffect(() => {
    const handle_back = (e: Event) => {
      if (show_sender_sheet) {
        e.preventDefault();
        set_show_sender_sheet(false);
      } else if (show_schedule_sheet) {
        e.preventDefault();
        set_show_schedule_sheet(false);
      } else if (show_expiration_sheet) {
        e.preventDefault();
        set_show_expiration_sheet(false);
      } else {
        e.preventDefault();
        on_close();
      }
    };

    window.addEventListener("capacitor:backbutton", handle_back);

    return () =>
      window.removeEventListener("capacitor:backbutton", handle_back);
  }, [show_sender_sheet, show_schedule_sheet, show_expiration_sheet, on_close]);

  const compose = use_compose({
    on_close,
    initial_to,
    edit_draft,
    session_storage_key: "astermail_mobile_compose",
    enable_offline_queue: true,
    enable_ctrl_enter_send: false,
  });

  const is_sending = compose.draft_status === "saving";
  const has_recipients = compose.recipients.to.length > 0;

  const contact_avatar_map = useMemo(() => {
    const map = new Map<string, string>();

    for (const c of compose.contacts) {
      if (!c.avatar_url) continue;
      for (const email of c.emails) {
        map.set(email.toLowerCase(), c.avatar_url);
      }
    }

    return map;
  }, [compose.contacts]);

  useEffect(() => {
    if (compose.has_external_recipients && compose.expires_at) {
      compose.set_expires_at(null);
      compose.set_expiry_password(null);
    }
  }, [compose.has_external_recipients]);

  const handle_send = useCallback(async () => {
    haptic_impact("medium");
    if (preferences.biometric_send_enabled) {
      const authenticated = await authenticate_biometric(
        "Authenticate to send email",
      );

      if (!authenticated) return;
    }
    try {
      if (compose.scheduled_time) {
        await compose.handle_scheduled_send();
      } else {
        await compose.handle_send();
      }
      haptic_send_success();
    } catch {
      haptic_error();
    }
  }, [compose, preferences.biometric_send_enabled]);

  const handle_trash_press = useCallback(() => {
    haptic_impact("light");
    if (preferences.skip_draft_delete_confirmation) {
      compose.handle_delete_draft();
    } else {
      compose.handle_show_delete_confirm();
    }
  }, [preferences.skip_draft_delete_confirmation, compose]);

  const handle_dont_ask_delete = useCallback(async () => {
    update_preference("skip_draft_delete_confirmation", true, true);
    await save_now();
  }, [update_preference, save_now]);

  const make_recipient_handler = useCallback(
    (field: "to" | "cc" | "bcc") => ({
      on_key_down: (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter" || e.key === ",") {
          e.preventDefault();
          const val = compose.inputs[field].trim();

          if (val) {
            compose.add_recipient(field, val);
            compose.update_input(field, "");
          }
        }
      },
      on_blur: () => {
        const val = compose.inputs[field].trim();

        if (val && val.includes("@")) {
          compose.add_recipient(field, val);
          compose.update_input(field, "");
        }
      },
    }),
    [compose],
  );

  const to_handlers = useMemo(
    () => make_recipient_handler("to"),
    [make_recipient_handler],
  );
  const cc_handlers = useMemo(
    () => make_recipient_handler("cc"),
    [make_recipient_handler],
  );
  const bcc_handlers = useMemo(
    () => make_recipient_handler("bcc"),
    [make_recipient_handler],
  );

  const handle_select_sender = useCallback(
    (sender: SenderOption) => {
      compose.set_selected_sender(sender);
      set_show_sender_sheet(false);
    },
    [compose],
  );

  const handle_schedule = useCallback(
    (date: Date) => {
      compose.set_scheduled_time(date);
      set_show_schedule_sheet(false);
    },
    [compose],
  );

  const handle_clear_schedule = useCallback(() => {
    compose.set_scheduled_time(null);
  }, [compose]);

  const handle_set_expiration = useCallback(
    (date: Date) => {
      compose.set_expires_at(date);
      set_show_expiration_sheet(false);
    },
    [compose],
  );

  const handle_clear_expiration = useCallback(() => {
    compose.set_expires_at(null);
    compose.set_expiry_password(null);
  }, [compose]);

  const handle_save_password = useCallback(
    (password: string | null) => {
      compose.set_expiry_password(password);
    },
    [compose],
  );

  const { image_input_ref, handle_image_select, handle_paste_with_images } =
    use_mobile_compose_images(compose);

  const current_sender = compose.selected_sender ?? compose.sender_options[0];

  return (
    <motion.div
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-50 flex flex-col bg-[var(--bg-primary)]"
      exit={{ opacity: 0 }}
      initial={reduce_motion ? false : { opacity: 0 }}
      transition={
        reduce_motion ? { duration: 0 } : { duration: 0.15, ease: "easeOut" }
      }
    >
      <MobileHeader
        on_back={compose.handle_close}
        right_actions={
          <Button
            className="h-8 gap-1.5 px-4"
            disabled={is_sending || !has_recipients}
            size="md"
            variant="depth"
            onClick={handle_send}
          >
            {is_sending || compose.is_scheduling ? (
              <Spinner size="xs" />
            ) : compose.scheduled_time ? (
              <>
                <ClockIcon className="h-4 w-4" />
                {t("mail.schedule")}
              </>
            ) : (
              <>
                <PaperAirplaneIcon className="h-4 w-4" />
                {t("mail.send")}
              </>
            )}
          </Button>
        }
        title={t("mail.new_message")}
      />

      <div className="flex-1 overflow-y-auto relative z-0">
        <button
          className="flex w-full items-center gap-2 border-b border-[var(--border-primary)] px-4 py-2.5 text-left"
          type="button"
          onClick={() => set_show_sender_sheet(true)}
        >
          <span className="text-[13px] text-[var(--text-muted)]">
            {t("mail.from")}:
          </span>
          {current_sender && (
            <>
              <MobileSenderIcon option={current_sender} size="xs" />
              <span className="flex-1 truncate text-[14px] text-[var(--text-primary)]">
                {current_sender.email}
              </span>
            </>
          )}
          {compose.sender_options.length > 1 && (
            <ChevronDownIcon className="h-4 w-4 text-[var(--text-muted)]" />
          )}
        </button>

        <div className="border-b border-[var(--border-primary)] px-4 py-2">
          <div className="flex items-center gap-2">
            <MobileRecipientRow
              contact_avatar_map={contact_avatar_map}
              input_value={compose.inputs.to}
              is_expanded={to_expanded}
              label={t("mail.to")}
              on_blur={() => {
                to_handlers.on_blur();
                set_to_expanded(false);
              }}
              on_expand={() => set_to_expanded(true)}
              on_input_change={(val) => compose.update_input("to", val)}
              on_key_down={to_handlers.on_key_down}
              on_remove={(email) => compose.remove_recipient("to", email)}
              placeholder={t("common.add_recipient")}
              recipients={compose.recipients.to}
            />
            <button
              className="shrink-0 text-[13px] text-[var(--text-muted)]"
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                set_show_cc(!show_cc);
                set_show_bcc(!show_bcc);
              }}
            >
              {t("common.cc_bcc_label")}
            </button>
          </div>
        </div>

        {show_cc && (
          <div className="border-b border-[var(--border-primary)] px-4 py-2">
            <MobileRecipientRow
              contact_avatar_map={contact_avatar_map}
              input_value={compose.inputs.cc}
              is_expanded={cc_expanded}
              label={t("common.cc_label")}
              on_blur={() => {
                cc_handlers.on_blur();
                set_cc_expanded(false);
              }}
              on_expand={() => set_cc_expanded(true)}
              on_input_change={(val) => compose.update_input("cc", val)}
              on_key_down={cc_handlers.on_key_down}
              on_remove={(email) => compose.remove_recipient("cc", email)}
              recipients={compose.recipients.cc}
            />
          </div>
        )}

        {show_bcc && (
          <div className="border-b border-[var(--border-primary)] px-4 py-2">
            <MobileRecipientRow
              contact_avatar_map={contact_avatar_map}
              input_value={compose.inputs.bcc}
              is_expanded={bcc_expanded}
              label={t("common.bcc_label")}
              on_blur={() => {
                bcc_handlers.on_blur();
                set_bcc_expanded(false);
              }}
              on_expand={() => set_bcc_expanded(true)}
              on_input_change={(val) => compose.update_input("bcc", val)}
              on_key_down={bcc_handlers.on_key_down}
              on_remove={(email) => compose.remove_recipient("bcc", email)}
              recipients={compose.recipients.bcc}
            />
          </div>
        )}

        <div className="border-b border-[var(--border-primary)] px-4 py-2">
          <Input
            className="w-full bg-transparent"
            maxLength={998}
            placeholder={t("mail.subject")}
            type="text"
            value={compose.subject}
            onChange={(e) => compose.set_subject(e.target.value)}
          />
        </div>

        {(compose.scheduled_time || compose.expires_at) && (
          <div className="flex flex-wrap gap-2 border-b border-[var(--border-primary)] px-4 py-2">
            {compose.scheduled_time && (
              <span className="flex items-center gap-1.5 rounded-full bg-blue-500/10 px-2.5 py-1 text-[12px] font-medium text-blue-500">
                <ClockIcon className="h-3.5 w-3.5" />
                {format(compose.scheduled_time, "MMM d, h:mm a")}
                <button
                  className="ml-0.5"
                  type="button"
                  onClick={handle_clear_schedule}
                >
                  <XMarkIcon className="h-3 w-3" />
                </button>
              </span>
            )}
            {compose.expires_at && (
              <span className="flex items-center gap-1.5 rounded-full bg-red-500/10 px-2.5 py-1 text-[12px] font-medium text-red-500">
                <FireIcon className="h-3.5 w-3.5" />
                {format_expiry_relative(compose.expires_at, t)}
                {compose.expiry_password && (
                  <LockClosedIcon className="h-3 w-3" />
                )}
                <button
                  className="ml-0.5"
                  type="button"
                  onClick={handle_clear_expiration}
                >
                  <XMarkIcon className="h-3 w-3" />
                </button>
              </span>
            )}
          </div>
        )}

        <div className="flex-1 px-4 py-3">
          <div
            ref={compose.message_textarea_ref}
            contentEditable
            suppressContentEditableWarning
            className="min-h-[200px] w-full text-[15px] text-[var(--text-primary)] outline-none"
            role="textbox"
            onInput={compose.handle_editor_input}
            onPaste={handle_paste_with_images}
          />
        </div>

        {compose.attachments.length > 0 && (
          <div
            ref={compose.attachments_scroll_ref}
            className="flex gap-2 overflow-x-auto border-t border-[var(--border-primary)] px-4 py-2"
          >
            {compose.attachments.map((att) => (
              <div
                key={att.id}
                className="flex shrink-0 items-center gap-2 rounded-lg bg-[var(--bg-tertiary)] px-3 py-1.5"
              >
                <PaperClipIcon className="h-4 w-4 text-[var(--text-muted)]" />
                <span className="max-w-[120px] truncate text-[13px] text-[var(--text-primary)]">
                  {att.name}
                </span>
                <button
                  className="text-[var(--text-muted)]"
                  type="button"
                  onClick={() => compose.remove_attachment(att.id)}
                >
                  <XMarkIcon className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center gap-1 border-t border-[var(--border-primary)] px-3 py-2 safe-area-pb">
        <input
          ref={compose.file_input_ref}
          multiple
          className="hidden"
          type="file"
          onChange={compose.handle_file_select}
        />
        <input
          ref={image_input_ref}
          multiple
          accept="image/*"
          className="hidden"
          type="file"
          onChange={handle_image_select}
        />
        <button
          className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--text-secondary)] active:bg-[var(--bg-tertiary)]"
          type="button"
          onClick={() => {
            compose.trigger_file_select();
          }}
        >
          <PaperClipIcon className="h-5 w-5" />
        </button>
        <button
          className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--text-secondary)] active:bg-[var(--bg-tertiary)]"
          type="button"
          onClick={() => {
            image_input_ref.current?.click();
          }}
        >
          <PhotoIcon className="h-5 w-5" />
        </button>
        <button
          className={`flex h-9 w-9 items-center justify-center rounded-full active:bg-[var(--bg-tertiary)] ${
            compose.scheduled_time
              ? "text-blue-500"
              : "text-[var(--text-secondary)]"
          }`}
          type="button"
          onClick={() => {
            set_show_schedule_sheet(true);
          }}
        >
          <ClockIcon className="h-5 w-5" />
        </button>
        <button
          className={`flex h-9 w-9 items-center justify-center rounded-full active:bg-[var(--bg-tertiary)] ${
            compose.has_external_recipients
              ? "text-[var(--text-muted)] opacity-40"
              : compose.expires_at
                ? "text-red-500"
                : "text-[var(--text-secondary)]"
          }`}
          disabled={compose.has_external_recipients}
          type="button"
          onClick={() => {
            if (compose.has_external_recipients) return;
            set_show_expiration_sheet(true);
          }}
        >
          <FireIcon className="h-5 w-5" />
        </button>
        <button
          className={`flex h-9 w-9 items-center justify-center rounded-full active:bg-[var(--bg-tertiary)] ${
            compose.ghost_mode.is_ghost_enabled
              ? "text-purple-500"
              : "text-[var(--text-secondary)]"
          }`}
          disabled={compose.ghost_mode.is_creating}
          type="button"
          onClick={() => set_show_ghost_sheet(true)}
        >
          {compose.ghost_mode.is_creating ? (
            <svg
              className="h-5 w-5 animate-spin"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              viewBox="0 0 24 24"
            >
              <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
              <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
            </svg>
          ) : (
            <svg
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              viewBox="0 0 24 24"
            >
              <path
                d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </button>
        <div className="flex-1" />
        {compose.draft_status === "saved" && (
          <span className="text-[12px] text-[var(--text-muted)]">
            {t("mail.saved")}
          </span>
        )}
        <button
          className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--color-danger,#ef4444)] active:bg-[var(--bg-tertiary)]"
          type="button"
          onClick={handle_trash_press}
        >
          <TrashIcon className="h-5 w-5" />
        </button>
      </div>

      <MobileSenderSheet
        current_sender={current_sender}
        is_open={show_sender_sheet}
        on_close={() => set_show_sender_sheet(false)}
        on_select={handle_select_sender}
        sender_options={compose.sender_options}
        t={t}
      />

      <MobileScheduleSheet
        has_scheduled_time={!!compose.scheduled_time}
        is_open={show_schedule_sheet}
        on_clear={handle_clear_schedule}
        on_close={() => set_show_schedule_sheet(false)}
        on_schedule={handle_schedule}
        t={t}
      />

      <MobileExpirationSheet
        expiry_password={compose.expiry_password}
        has_expires_at={!!compose.expires_at}
        has_external_recipients={compose.has_external_recipients}
        is_open={show_expiration_sheet}
        on_clear={handle_clear_expiration}
        on_close={() => set_show_expiration_sheet(false)}
        on_save_password={handle_save_password}
        on_set_expiration={handle_set_expiration}
        t={t}
      />

      <MobileGhostSheet
        ghost_mode={compose.ghost_mode}
        is_open={show_ghost_sheet}
        on_close={() => set_show_ghost_sheet(false)}
      />

      <ConfirmationModal
        show_dont_ask_again
        cancel_text={t("common.cancel")}
        confirm_text={t("common.delete")}
        is_open={compose.show_delete_confirm}
        message={t("mail.delete_draft_confirmation")}
        on_cancel={compose.handle_hide_delete_confirm}
        on_confirm={compose.handle_delete_draft}
        on_dont_ask_again={handle_dont_ask_delete}
        title={t("common.delete_draft")}
        variant="danger"
      />
    </motion.div>
  );
}

export default MobileComposePage;
