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
// GNU Affero General Public License for more details.
//
// You should have received a copy of the AGPLv3
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
import type { SettingsSection } from "@/components/settings/settings_panel";

import { useEffect } from "react";
import { AnimatePresence } from "framer-motion";

import { use_index_page_state } from "./use_index_page_state";

import { show_toast } from "@/components/toast/simple_toast";
import { Sidebar, MobileMenuButton } from "@/components/layout/sidebar";
import { ComposeManager } from "@/components/compose/compose_manager";
import { EmailInbox } from "@/components/email/email_inbox";
import { ContactsContent } from "@/components/common/contacts_content";
import { SubscriptionsContent } from "@/components/subscriptions/subscriptions_content";
import { SenderDetailHeader } from "@/components/subscriptions/sender_detail_header";
import { UpgradeGate } from "@/components/common/upgrade_gate";
import { use_i18n } from "@/lib/i18n/context";
import { SettingsPanel } from "@/components/settings/settings_panel";
import { ReplyModal } from "@/components/modals/reply_modal";
import { ForwardModal } from "@/components/modals/forward_modal";
import { EmailPopupViewer } from "@/components/email/email_popup_viewer";
import { ScheduledPopupViewer } from "@/components/scheduled/scheduled_popup_viewer";
import { NotificationBanner } from "@/components/common/notification_banner";
import { SearchResultsPage } from "@/components/search/search_results_page";
import { CommandPalette } from "@/components/search/command_palette";
import { KeyboardShortcutsModal } from "@/components/modals/keyboard_shortcuts_modal";
import { KeyRotationModal } from "@/components/modals/key_rotation_modal";
import { PurchaseSuccessModal } from "@/components/modals/purchase_success_modal";

export default function IndexPage() {
  const state = use_index_page_state();
  const { t } = use_i18n();

  useEffect(() => {
    const result = sessionStorage.getItem("recovery_email_verification_result");

    if (!result) return;
    sessionStorage.removeItem("recovery_email_verification_result");

    if (result === "success") {
      show_toast(t("auth.recovery_email_verified"), "success");
    } else {
      show_toast(t("auth.verification_failed"), "error");
    }
  }, [t]);

  useEffect(() => {
    const handle_navigate = (e: Event) => {
      const section = (e as CustomEvent<string>).detail as SettingsSection;

      state.set_settings_section(section);
      state.set_is_settings_open(true);
    };

    window.addEventListener("navigate-settings", handle_navigate);

    return () => {
      window.removeEventListener("navigate-settings", handle_navigate);
    };
  }, [state]);

  return (
    <>
      <div
        className="h-dvh w-full flex flex-col overflow-hidden"
        style={{ backgroundColor: "var(--bg-secondary)" }}
      >
        <NotificationBanner />
        <div className="flex-1 flex transition-colors duration-200 overflow-hidden">
          <Sidebar
            edit_draft={state.edit_draft}
            is_mobile_open={state.is_mobile_sidebar_open}
            is_search_active={
              !!state.active_search_query && !state.sender_subscription
            }
            on_compose={state.open_compose}
            on_draft_click_compose={(draft) => {
              state.set_popup_email_id(null);
              state.set_popup_scheduled(null);
              state.set_split_scheduled_data(null);
              state.open_compose_instance(draft);
            }}
            on_drop_to_folder={state.handle_drop_to_folder}
            on_drop_to_tag={state.handle_drop_to_tag}
            on_mobile_toggle={state.toggle_mobile_sidebar}
            on_modal_open={() => {
              state.set_popup_email_id(null);
              state.set_popup_scheduled(null);
              state.set_split_scheduled_data(null);
            }}
            on_nav_click={state.handle_sidebar_nav_click}
            on_settings_click={(section) => {
              state.set_popup_email_id(null);
              state.set_popup_scheduled(null);
              state.set_split_scheduled_data(null);
              state.set_settings_section(section);
              state.set_is_settings_open(true);
            }}
          />
          <div className="flex-1 p-1 md:p-2 min-h-0 min-w-0 flex flex-col overflow-hidden">
            <div className="md:hidden flex items-center h-12 px-2 flex-shrink-0">
              <MobileMenuButton on_click={state.toggle_mobile_sidebar} />
              <div className="flex-1 flex justify-center">
                <img
                  alt="Aster Mail"
                  className="h-7 select-none"
                  draggable={false}
                  src="/text_logo.png"
                />
              </div>
              <div className="w-10" />
            </div>
            <div
              className="flex-1 w-full rounded-lg md:rounded-xl border overflow-hidden transition-colors duration-200"
              style={{
                backgroundColor: "var(--bg-primary)",
                borderColor: "var(--border-primary)",
              }}
            >
              {state.location.pathname === "/subscriptions" ? (
                <UpgradeGate
                  description={t("settings.subscription_manager_locked")}
                  feature_name={t("settings.plan_f_subscription_manager")}
                  is_locked={false}
                  min_plan="Star"
                >
                  <SubscriptionsContent
                    on_mobile_menu_toggle={state.toggle_mobile_sidebar}
                    on_sender_search={state.handle_sender_search}
                  />
                </UpgradeGate>
              ) : state.location.pathname === "/contacts" ? (
                <ContactsContent
                  on_mobile_menu_toggle={state.toggle_mobile_sidebar}
                />
              ) : state.active_search_query ? (
                <div className="flex flex-col h-full">
                  {state.sender_subscription && (
                    <SenderDetailHeader
                      on_unsubscribe={
                        state.sender_subscription.status === "active"
                          ? async () => {
                              const sub = state.sender_subscription!;
                              const result = await state.unsubscribe_sender(
                                sub.sender_email,
                              );

                              if (result !== "failed") {
                                state.set_sender_subscription({
                                  ...sub,
                                  status: "unsubscribed",
                                  unsubscribed_at: new Date().toISOString(),
                                });
                              }

                              return result;
                            }
                          : undefined
                      }
                      subscription={state.sender_subscription}
                    />
                  )}
                  <div className="flex-1 min-h-0">
                    <SearchResultsPage
                      on_close={state.handle_close_search_results}
                      on_result_click={state.handle_search_result_click}
                      on_search_click={() => state.set_is_search_open(true)}
                      on_search_submit={state.handle_search_submit}
                      on_settings_click={() => {
                        state.set_popup_email_id(null);
                        state.set_popup_scheduled(null);
                        state.set_split_scheduled_data(null);
                        state.set_is_settings_open(true);
                      }}
                      on_split_close={state.handle_search_split_close}
                      query={state.active_search_query}
                      split_email_id={
                        state.preferences.email_view_mode === "split" ||
                        state.preferences.email_view_mode === "fullpage"
                          ? state.split_email_id
                          : null
                      }
                    />
                  </div>
                </div>
              ) : (
                <EmailInbox
                  key={state.current_account_id}
                  active_email_id={state.popup_email_id ?? state.split_email_id}
                  can_go_next={state.can_go_next}
                  can_go_prev={state.can_go_prev}
                  current_email_index={state.current_email_index}
                  current_view={state.current_view}
                  focused_email_id={state.focused_email_id}
                  on_compose={state.open_compose}
                  on_draft_click={state.handle_draft_click}
                  on_email_click={state.handle_email_click}
                  on_email_list_change={state.handle_email_list_change}
                  on_forward={state.handle_popup_forward}
                  on_navigate_next={state.handle_navigate_next}
                  on_navigate_prev={state.handle_navigate_prev}
                  on_navigate_to={state.handle_navigate_to}
                  on_reply={state.handle_reply}
                  on_scheduled_click={state.handle_scheduled_click}
                  on_search_click={() => state.set_is_search_open(true)}
                  on_search_result_click={state.handle_search_result_click}
                  on_search_submit={state.handle_search_submit}
                  on_settings_click={() => {
                    state.set_popup_email_id(null);
                    state.set_popup_scheduled(null);
                    state.set_split_scheduled_data(null);
                    state.set_is_settings_open(true);
                  }}
                  on_split_close={state.handle_split_close}
                  on_split_scheduled_close={state.handle_split_scheduled_close}
                  on_view_change={state.handle_header_view_change}
                  split_email_id={
                    !state.use_popup_mode &&
                    (state.preferences.email_view_mode === "split" ||
                      state.preferences.email_view_mode === "fullpage")
                      ? state.split_email_id
                      : null
                  }
                  split_local_email={state.preview_local_email}
                  split_scheduled_data={
                    !state.use_popup_mode &&
                    (state.preferences.email_view_mode === "split" ||
                      state.preferences.email_view_mode === "fullpage")
                      ? state.split_scheduled_data
                      : null
                  }
                  total_email_count={state.visible_email_ids.length}
                />
              )}
            </div>
          </div>
        </div>
      </div>
      <SettingsPanel
        initial_section={state.settings_section}
        is_open={state.is_settings_open}
        on_close={() => {
          state.set_is_settings_open(false);
          state.set_settings_section(undefined);
        }}
      />
      {state.reply_data && (
        <ReplyModal
          is_external={state.reply_data.is_external}
          is_open={state.is_reply_open}
          on_close={() => {
            state.set_is_reply_open(false);
            state.set_reply_data(null);
          }}
          original_body={state.reply_data.original_body}
          original_cc={state.reply_data.original_cc}
          original_email_id={state.reply_data.original_email_id}
          original_subject={state.reply_data.original_subject}
          original_timestamp={state.reply_data.original_timestamp}
          original_to={state.reply_data.original_to}
          recipient_avatar={state.reply_data.recipient_avatar}
          recipient_email={state.reply_data.recipient_email}
          recipient_name={state.reply_data.recipient_name}
          reply_all={state.reply_data.reply_all}
          thread_ghost_email={state.reply_data.thread_ghost_email}
          thread_token={state.reply_data.thread_token}
        />
      )}
      {state.forward_data && (
        <ForwardModal
          email_body={state.forward_data.email_body}
          email_subject={state.forward_data.email_subject}
          email_timestamp={state.forward_data.email_timestamp}
          is_external={state.forward_data.is_external}
          is_open={state.is_forward_open}
          on_close={() => {
            state.set_is_forward_open(false);
            state.set_forward_data(null);
          }}
          original_mail_id={state.forward_data.original_mail_id}
          sender_avatar={state.forward_data.sender_avatar}
          sender_email={state.forward_data.sender_email}
          sender_name={state.forward_data.sender_name}
        />
      )}
      <AnimatePresence>
        {state.popup_email_id && (
          <EmailPopupViewer
            email_id={state.popup_email_id}
            grouped_email_ids={
              state.popup_email_id
                ? state.email_grouped_ids_map[state.popup_email_id]
                : undefined
            }
            local_email={state.preview_local_email ?? undefined}
            on_close={state.handle_popup_close}
            on_forward={state.handle_popup_forward}
            on_reply={state.handle_popup_reply}
            snoozed_until={
              state.popup_email_id
                ? state.email_snooze_map[state.popup_email_id]
                : undefined
            }
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {state.popup_scheduled && (
          <ScheduledPopupViewer
            on_close={state.handle_scheduled_popup_close}
            scheduled_data={state.popup_scheduled}
          />
        )}
      </AnimatePresence>
      <CommandPalette
        is_open={state.is_command_palette_open}
        on_close={() => state.set_is_command_palette_open(false)}
        on_compose={state.open_compose}
        on_settings={() => state.set_is_settings_open(true)}
        on_shortcuts={() => state.set_is_shortcuts_open(true)}
      />
      <KeyboardShortcutsModal
        is_open={state.is_shortcuts_open}
        on_close={() => state.set_is_shortcuts_open(false)}
      />
      <KeyRotationModal
        is_open={state.show_rotation_modal}
        key_age_hours={state.key_age_hours}
        key_fingerprint={state.key_fingerprint}
        on_close={state.close_rotation_modal}
        on_rotate={state.perform_rotation}
      />
      <ComposeManager
        instances={state.compose_instances}
        on_close={state.close_compose}
        on_draft_cleared={state.handle_draft_cleared}
        on_toggle_minimize={state.toggle_minimize}
      />
      <PurchaseSuccessModal
        billing={state.checkout_success?.billing || ""}
        is_open={!!state.checkout_success}
        on_close={() => state.set_checkout_success(null)}
        on_view_billing={() => {
          state.set_settings_section("billing");
          state.set_is_settings_open(true);
        }}
        plan={state.checkout_success?.plan || ""}
      />
    </>
  );
}
