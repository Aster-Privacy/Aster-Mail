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

import { motion } from "framer-motion";
import { StarIcon } from "@heroicons/react/24/outline";
import { StarIcon as StarSolidIcon } from "@heroicons/react/24/solid";

import { MobileThreadMessage } from "./mobile_thread_message";
import {
  MobileUnsubscribeBanner,
  MobileExternalContentBanner,
} from "./mobile_detail_banners";
import { MobileToolbar } from "./mobile_detail_toolbar";
import {
  MobileActionMenuSheet,
  MobileViewSourceSheet,
  MobileSnoozeSheet,
  MobileToolbarCustomizerSheet,
  MobileMessageDetailsSheet,
} from "./mobile_detail_sheets";
import { swipe_nav_state } from "./mobile_mail_detail_swipe";
import { use_mobile_mail_detail } from "./use_mobile_mail_detail";

import { MobileHeader } from "@/components/mobile/mobile_header";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmationModal } from "@/components/modals/confirmation_modal";

function MobileMailDetail() {
  const {
    detail,
    format_email_detail,
    reduce_motion,
    t,
    preferences,
    update_preference,
    request_spam,
    spam_confirm_dialog,
    is_starred,
    is_pinned,
    expanded_ids,
    menu_message,
    set_menu_message,
    menu_source,
    set_menu_source,
    view_source_message,
    set_view_source_message,
    external_content_report,
    set_external_content_report,
    external_content_loaded,
    lockdown_active,
    show_toolbar_customizer,
    set_show_toolbar_customizer,
    subject_expanded,
    set_subject_expanded,
    show_block_confirm,
    set_show_block_confirm,
    blocking_sender,
    block_target,
    set_block_target,
    show_snooze_sheet,
    set_show_snooze_sheet,
    set_snooze_target_id,
    details_message,
    set_details_message,
    first_unread_ref,
    scroll_ref,
    display_messages,
    first_unread_id,
    handle_back,
    handle_toggle_expand,
    handle_toggle_star,
    handle_toggle_pin,
    is_archived,
    is_trashed,
    handle_archive,
    handle_delete,
    show_delete_confirm,
    set_show_delete_confirm,
    confirm_permanent_delete,
    handle_spam,
    handle_not_spam,
    handle_print,
    dispatch_compose,
    is_dark_mode_message,
    is_dark_mode_opted_out,
    handle_toggle_dark_mode,
    handle_toggle_all_dark_mode,
    handle_view_source,
    handle_report_phishing,
    handle_menu_archive,
    handle_menu_trash,
    handle_menu_reply,
    handle_menu_reply_all,
    handle_menu_forward,
    handle_copy_message_id,
    handle_block_sender,
    handle_snooze,
    handle_load_external_content,
    handle_touch_start,
    handle_touch_move,
    handle_touch_end,
    get_last_message,
  } = use_mobile_mail_detail();

  if (detail.error) {
    return (
      <div className="flex h-full flex-col">
        <MobileHeader on_back={handle_back} title="" />
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-8">
          <p className="text-center text-[15px] text-[var(--text-muted)]">
            {detail.error}
          </p>
        </div>
      </div>
    );
  }

  if (detail.is_loading || !detail.email) {
    return (
      <div className="flex h-full flex-col">
        <MobileHeader on_back={handle_back} title="" />
        <div className="flex-1 space-y-4 px-4 pt-4">
          <div className="flex items-start gap-3">
            <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-3/4 rounded" />
              <Skeleton className="h-3 w-1/2 rounded" />
            </div>
          </div>
          <div className="space-y-3 pt-4">
            <Skeleton className="h-4 w-full rounded" />
            <Skeleton className="h-4 w-5/6 rounded" />
            <Skeleton className="h-4 w-4/6 rounded" />
            <Skeleton className="h-4 w-full rounded" />
            <Skeleton className="h-4 w-3/4 rounded" />
            <Skeleton className="h-4 w-2/3 rounded" />
          </div>
        </div>
      </div>
    );
  }

  const email = detail.email;
  const starred = is_starred ?? email.is_starred;
  const pinned = is_pinned ?? email.is_pinned ?? false;
  const thread_count = display_messages.length;

  const entrance_x =
    swipe_nav_state.direction === "right"
      ? -60
      : swipe_nav_state.direction === "left"
        ? 60
        : 0;
  const had_swipe = !!swipe_nav_state.direction;

  if (swipe_nav_state.direction) swipe_nav_state.direction = null;

  return (
    <motion.div
      key={detail.email_id}
      animate={{ opacity: 1, x: 0 }}
      className="flex h-full flex-col"
      initial={reduce_motion ? false : { opacity: 0, x: entrance_x }}
      transition={
        reduce_motion
          ? { duration: 0 }
          : {
              duration: had_swipe ? 0.12 : 0.15,
              ease: had_swipe ? [0.2, 0.9, 0.3, 1] : "easeOut",
            }
      }
    >
      <MobileHeader
        on_back={handle_back}
        right_actions={
          <div className="flex items-center gap-1">
            <button
              className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--text-secondary)] active:bg-[var(--bg-tertiary)]"
              type="button"
              onClick={handle_toggle_star}
            >
              {starred ? (
                <StarSolidIcon className="h-5 w-5 text-amber-400" />
              ) : (
                <StarIcon className="h-5 w-5" />
              )}
            </button>
          </div>
        }
        title=""
      />

      <div
        ref={scroll_ref}
        className="flex-1 overflow-y-auto"
        onTouchEnd={handle_touch_end}
        onTouchMove={handle_touch_move}
        onTouchStart={handle_touch_start}
      >
        <div className="px-4 pt-2 pb-1" dir="auto">
          <button
            className={`text-[18px] font-semibold leading-snug text-[var(--text-primary)] text-start w-full ${subject_expanded ? "" : "truncate"}`}
            type="button"
            onClick={() => set_subject_expanded((prev) => !prev)}
          >
            {email.subject || t("mail.no_subject")}
          </button>
          <p className="mt-0.5 text-[12px] text-[var(--text-muted)]">
            {thread_count}{" "}
            {thread_count === 1
              ? t("mail.message_label")
              : t("mail.messages_label")}
          </p>
        </div>

        {email.unsubscribe_info?.has_unsubscribe && (
          <MobileUnsubscribeBanner email={email} t={detail.t} />
        )}

        {external_content_report &&
          !external_content_loaded &&
          !lockdown_active && (
            <MobileExternalContentBanner
              on_load={handle_load_external_content}
              report={external_content_report}
              t={detail.t}
            />
          )}

        <div className="pt-1 pb-6">
          {(preferences.conversation_order === "desc"
            ? [...display_messages].reverse()
            : display_messages
          ).map((msg) => (
            <div
              key={msg.id}
              ref={msg.id === first_unread_id ? first_unread_ref : undefined}
            >
              <MobileThreadMessage
                disable_auto_dark_mode={is_dark_mode_opted_out(msg.id)}
                force_dark_mode={is_dark_mode_message(msg.id)}
                format_detail={format_email_detail}
                is_expanded={expanded_ids.has(msg.id)}
                is_own_message={
                  msg.sender_email.toLowerCase() ===
                  detail.current_user_email?.toLowerCase()
                }
                load_remote_content={external_content_loaded}
                message={msg}
                on_external_content_detected={set_external_content_report}
                on_forward={(m) => dispatch_compose(m, "forward")}
                on_open_menu={(msg) => {
                  set_menu_source("message");
                  set_menu_message(msg);
                }}
                on_reply={(m) => dispatch_compose(m, "reply")}
                on_toggle={() => handle_toggle_expand(msg)}
                t={detail.t}
              />
            </div>
          ))}
        </div>
      </div>

      <MobileToolbar
        actions={preferences.mobile_toolbar_actions}
        is_archived={is_archived}
        is_read={email.is_read}
        is_spam={!!detail.mail_item?.is_spam}
        is_starred={starred}
        is_trashed={is_trashed}
        on_archive={handle_archive}
        on_delete={handle_delete}
        on_mark_read={() => {
          if (detail.email) detail.handle_toggle_message_read(detail.email.id);
        }}
        on_more={() => {
          const msg = get_last_message();

          if (msg) {
            set_menu_source("toolbar");
            set_menu_message(msg);
          }
        }}
        on_print={() => {
          const msg = get_last_message();

          if (msg) detail.handle_per_message_print(msg);
        }}
        on_spam={() => {
          if (detail.mail_item?.is_spam) {
            handle_not_spam();

            return;
          }
          request_spam(handle_spam);
        }}
        on_star={handle_toggle_star}
      />

      <MobileActionMenuSheet
        format_detail={format_email_detail}
        is_all_dark={
          display_messages.length > 0 &&
          display_messages.every((m) => is_dark_mode_message(m.id))
        }
        is_archived={is_archived}
        is_message_dark={
          !!menu_message && is_dark_mode_message(menu_message.id)
        }
        is_pinned={pinned}
        is_spam={!!detail.mail_item?.is_spam}
        is_starred={starred}
        menu_message={menu_message}
        menu_source={menu_source}
        on_archive={is_archived ? handle_archive : handle_menu_archive}
        on_block={() => {
          if (menu_message) {
            set_block_target({
              email: menu_message.sender_email,
              name: menu_message.sender_name,
            });
          }
          set_menu_message(null);
          setTimeout(() => set_show_block_confirm(true), 100);
        }}
        on_close={() => set_menu_message(null)}
        on_copy_id={handle_copy_message_id}
        on_customize_toolbar={() => {
          set_menu_message(null);
          set_show_toolbar_customizer(true);
        }}
        on_forward={handle_menu_forward}
        on_message_details={() => {
          const msg = menu_message;

          set_menu_message(null);
          setTimeout(() => set_details_message(msg), 100);
        }}
        on_not_spam={() => {
          handle_not_spam();
          set_menu_message(null);
        }}
        on_print={handle_print}
        on_reply={handle_menu_reply}
        on_reply_all={handle_menu_reply_all}
        on_report_phishing={handle_report_phishing}
        on_snooze={() => {
          set_snooze_target_id(menu_message?.id || null);
          set_menu_message(null);
          set_show_snooze_sheet(true);
        }}
        on_spam={() => {
          request_spam(handle_spam);
          set_menu_message(null);
        }}
        on_toggle_all_dark_mode={handle_toggle_all_dark_mode}
        on_toggle_dark_mode={handle_toggle_dark_mode}
        on_toggle_pin={handle_toggle_pin}
        on_toggle_read={() => {
          if (menu_message) {
            detail.handle_toggle_message_read(menu_message.id);
          }
          set_menu_message(null);
        }}
        on_toggle_star={handle_toggle_star}
        on_trash={handle_menu_trash}
        on_view_source={handle_view_source}
        t={detail.t}
      />

      <MobileViewSourceSheet
        message={view_source_message}
        on_close={() => set_view_source_message(null)}
        t={detail.t}
      />

      <MobileMessageDetailsSheet
        format_detail={format_email_detail}
        message={details_message}
        on_close={() => set_details_message(null)}
        size_bytes={detail.mail_item?.metadata?.size_bytes}
        t={detail.t}
      />

      <MobileSnoozeSheet
        is_open={show_snooze_sheet}
        on_close={() => set_show_snooze_sheet(false)}
        on_snooze={handle_snooze}
      />

      <MobileToolbarCustomizerSheet
        is_open={show_toolbar_customizer}
        on_close={() => set_show_toolbar_customizer(false)}
        preferences_toolbar_actions={preferences.mobile_toolbar_actions}
        t={detail.t}
        update_preference={update_preference}
      />

      <ConfirmationModal
        cancel_text={detail.t("common.cancel")}
        confirm_text={
          blocking_sender ? detail.t("mail.blocking") : detail.t("mail.block")
        }
        is_open={show_block_confirm}
        message={detail.t("mail.block_sender_confirm_message", {
          email: block_target?.email || "",
        })}
        on_cancel={() => {
          set_show_block_confirm(false);
          set_block_target(null);
        }}
        on_confirm={handle_block_sender}
        title={detail.t("mail.block_sender")}
        variant="danger"
      />
      <ConfirmationModal
        cancel_text={detail.t("common.cancel")}
        confirm_text={detail.t("mail.delete_permanently")}
        is_open={show_delete_confirm}
        message={detail.t("mail.delete_email_confirmation")}
        on_cancel={() => set_show_delete_confirm(false)}
        on_confirm={confirm_permanent_delete}
        title={detail.t("mail.delete_permanently_question")}
        variant="danger"
      />
      {spam_confirm_dialog}
    </motion.div>
  );
}

export default MobileMailDetail;
