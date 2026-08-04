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
import type { SettingsSection } from "@/components/settings/settings_content";

import { lazy, Suspense, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AnimatePresence } from "framer-motion";

import { use_index_page_state } from "./use_index_page_state";

import { show_toast } from "@/components/toast/simple_toast";
import { Sidebar } from "@/components/layout/sidebar";
import { TopBar } from "@/components/layout/top_bar";
import { ComposeManager } from "@/components/compose/compose_manager";
import { EmailInbox } from "@/components/email/email_inbox";
import { ContactsContent } from "@/components/common/contacts_content";
import { SubscriptionsContent } from "@/components/subscriptions/subscriptions_content";
import { SenderDetailHeader } from "@/components/subscriptions/sender_detail_header";
import { UpgradeGate } from "@/components/common/upgrade_gate";
import { use_i18n } from "@/lib/i18n/context";
import { FullPageLoader } from "@/components/common/full_page_loader";
import { QuickSettingsPanel } from "@/components/settings/quick_settings_panel";
const SettingsContent = lazy(() =>
  import("@/components/settings/settings_content").then((m) => ({
    default: m.SettingsContent,
  })),
);

const SETTINGS_SECTIONS = new Set([
  "account",
  "appearance",
  "accessibility",
  "security",
  "encryption",
  "trusted_devices",
  "aliases",
  "ghost_aliases",
  "billing",
  "family",
  "referral",
  "import",
  "notifications",
  "signature",
  "templates",
  "behavior",
  "sender_filters",
  "mail_rules",
  "feedback",
  "updates",
  "developer",
  "bridge",
  "smtp_tokens",
]);
import { ReplyModal } from "@/components/modals/reply_modal";
import { ForwardModal } from "@/components/modals/forward_modal";
import { EmailPopupViewer } from "@/components/email/email_popup_viewer";
import { ScheduledPopupViewer } from "@/components/scheduled/scheduled_popup_viewer";
import { NotificationBanner } from "@/components/common/notification_banner";
import { SurveyBanner } from "@/components/survey/survey_banner";
import { WifiIcon } from "@heroicons/react/24/outline";
import { SearchResultsPage } from "@/components/search/search_results_page";
import { CommandPalette } from "@/components/search/command_palette";
import { KeyboardShortcutsModal } from "@/components/modals/keyboard_shortcuts_modal";
import { KeyRotationModal } from "@/components/modals/key_rotation_modal";
import { PurchaseSuccessModal } from "@/components/modals/purchase_success_modal";
import { OnboardingChecklist } from "@/components/onboarding/onboarding_checklist";

export default function IndexPage() {
  const state = use_index_page_state();
  const { t } = use_i18n();
  const navigate = useNavigate();
  const { section } = useParams<{ section?: string }>();
  const [is_quick_settings_open, set_is_quick_settings_open] = useState(false);

  const toggle_quick_settings = () => {
    if (window.matchMedia("(min-width: 1024px)").matches) {
      set_is_quick_settings_open((prev) => !prev);
    } else {
      set_is_quick_settings_open(false);
      state.open_settings();
    }
  };

  const settings_section =
    section && SETTINGS_SECTIONS.has(section)
      ? (section as SettingsSection)
      : undefined;
  const settings_popup_mode =
    (state.preferences.settings_view_mode ?? "fullpage") === "popup";

  useEffect(() => {
    if (section) {
      const academic_result = new URLSearchParams(window.location.search).get(
        "academic",
      );

      if (academic_result) {
        sessionStorage.setItem("academic_discount_result", academic_result);
      }
    }
  }, [section]);

  const pathname = state.location.pathname;

  useEffect(() => {
    if (
      state.is_settings_route ||
      pathname === "/contacts" ||
      pathname === "/subscriptions"
    ) {
      set_is_quick_settings_open(false);
    }
  }, [state.is_settings_route, pathname]);

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
      const detail = (
        e as CustomEvent<string | { section: string; anchor?: string }>
      ).detail;
      const nav_section = (
        typeof detail === "string" ? detail : detail?.section
      ) as SettingsSection | undefined;

      if (!state.is_settings_route) {
        state.open_settings(nav_section);
      }
    };

    const handle_navigate_sent = () => navigate("/sent");

    try {
      if (sessionStorage.getItem("aster_pending_domain_order")) {
        state.open_settings("aliases" as SettingsSection);
      }
    } catch {}

    window.addEventListener("navigate-settings", handle_navigate);
    window.addEventListener("astermail:navigate-to-sent", handle_navigate_sent);

    return () => {
      window.removeEventListener("navigate-settings", handle_navigate);
      window.removeEventListener("astermail:navigate-to-sent", handle_navigate_sent);
    };
  }, [state, navigate]);

  return (
    <>
      <a
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[200] focus:px-4 focus:py-2 focus:rounded-lg focus:bg-[var(--accent-color)] focus:text-white focus:shadow-lg"
        href="#main-content"
      >
        {t("common.skip_to_content")}
      </a>
      <div
        className="h-screen w-full flex flex-col overflow-hidden"
        style={{ height: "100dvh", backgroundColor: "var(--bg-secondary)" }}
      >
        <NotificationBanner />
        <SurveyBanner />
        {!(state.is_settings_route && !settings_popup_mode) && (
          <TopBar
            on_mobile_menu_toggle={state.toggle_mobile_sidebar}
            on_search_result_click={state.handle_search_result_click}
            on_search_submit={state.handle_search_submit}
            on_settings_click={toggle_quick_settings}
            on_shortcuts_click={() => state.set_is_shortcuts_open(true)}
            search_context={state.active_search_query || undefined}
          />
        )}
        <div className="flex-1 flex transition-colors duration-200 overflow-hidden">
          {state.is_settings_route && !settings_popup_mode ? (
            <Suspense fallback={<FullPageLoader />}>
              <SettingsContent
                section={settings_section}
                on_close={state.close_settings}
                on_section_change={(next_section) => {
                  navigate(`/settings/${next_section}`, {
                    state: state.location.state,
                  });
                }}
              />
            </Suspense>
          ) : (
          <>
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
              state.open_settings(section);
            }}
          />
          <div className="flex-1 px-1 pb-1 md:px-2 md:pb-2 min-h-0 min-w-0 flex flex-col overflow-hidden">
            {state.preferences.low_network_mode && (
              <div className="flex items-center gap-2 px-3 py-1.5 mb-1 rounded-lg text-xs font-medium flex-shrink-0" style={{ backgroundColor: "var(--bg-tertiary)", color: "var(--txt-muted)" }}>
                <WifiIcon className="w-3.5 h-3.5 flex-shrink-0 opacity-60" />
                <span className="flex-1">{t("settings.low_network_mode_active_banner")}</span>
                <button
                  className="text-xs underline underline-offset-2 opacity-60 hover:opacity-100 transition-opacity cursor-pointer"
                  type="button"
                  onClick={() => {
                    state.open_settings("accessibility");
                  }}
                >
                  {t("settings.accessibility")}
                </button>
              </div>
            )}
            <div className="flex-1 flex min-h-0 min-w-0 overflow-hidden relative">
            <div
              className={`flex-1 min-w-0 rounded-lg md:rounded-xl overflow-hidden transition-[margin-right] duration-200 ${
                is_quick_settings_open &&
                !state.is_settings_route &&
                !state.use_popup_mode &&
                state.split_email_id
                  ? "lg:mr-[296px]"
                  : ""
              }`}
              id="main-content"
              role="main"
              style={{
                backgroundColor: "var(--bg-primary)",
              }}
              tabIndex={-1}
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
                      on_quick_settings_click={toggle_quick_settings}
                      on_settings_click={() => {
                        state.open_settings();
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
                  on_quick_settings_click={toggle_quick_settings}
                  on_settings_click={() => {
                    state.open_settings();
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
            <QuickSettingsPanel
              is_open={is_quick_settings_open && !state.is_settings_route}
              on_close={() => set_is_quick_settings_open(false)}
              on_open_full_settings={(quick_section) => {
                set_is_quick_settings_open(false);
                state.open_settings(quick_section);
              }}
            />
            </div>
          </div>
          </>
          )}
        </div>
      </div>
      {state.is_settings_route && settings_popup_mode && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-0 md:p-4">
          <div
            className="absolute inset-0"
            style={{ backgroundColor: "var(--modal-overlay)" }}
            onClick={state.close_settings}
          />
          <div
            className="relative w-full h-full md:w-[92vw] md:max-w-[1440px] md:h-[88vh] md:max-h-[960px] md:rounded-2xl overflow-hidden bg-surf-primary"
            style={{ border: "1px solid var(--border-secondary)" }}
          >
            <Suspense fallback={<FullPageLoader />}>
              <SettingsContent
                section={settings_section}
                variant="popup"
                on_close={state.close_settings}
                on_section_change={(next_section) => {
                  navigate(`/settings/${next_section}`, {
                    state: state.location.state,
                  });
                }}
              />
            </Suspense>
          </div>
        </div>
      )}
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
          original_rfc_message_id={state.reply_data.original_rfc_message_id}
          original_subject={state.reply_data.original_subject}
          original_timestamp={state.reply_data.original_timestamp}
          original_to={state.reply_data.original_to}
          recipient_avatar={state.reply_data.recipient_avatar}
          recipient_email={state.reply_data.recipient_email}
          recipient_name={state.reply_data.recipient_name}
          quote_sender_email={state.reply_data.quote_sender_email}
          quote_sender_name={state.reply_data.quote_sender_name}
          reply_all={state.reply_data.reply_all}
          reply_from_address={state.reply_data.reply_from_address}
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
            label_hints={
              state.popup_email_id
                ? state.email_label_hints_map[state.popup_email_id]
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
        on_settings={() => state.open_settings()}
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
      {!state.is_settings_route && (
        <OnboardingChecklist
          on_compose={state.open_compose}
          on_open_settings={(section) => {
            state.open_settings(section);
          }}
        />
      )}
      <PurchaseSuccessModal
        billing={state.checkout_success?.billing || ""}
        is_open={!!state.checkout_success}
        on_close={() => state.set_checkout_success(null)}
        on_view_billing={() => {
          state.open_settings("billing");
        }}
        plan={state.checkout_success?.plan || ""}
      />
    </>
  );
}
