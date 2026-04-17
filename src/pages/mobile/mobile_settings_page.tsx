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

import type { SettingsSection } from "./settings/shared";

import {
  ChevronRightIcon,
  ShieldCheckIcon,
  InformationCircleIcon,
  KeyIcon,
  DocumentTextIcon,
  SwatchIcon,
  EyeIcon,
  BellIcon,
  CreditCardIcon,
  ArrowRightStartOnRectangleIcon,
  AtSymbolIcon,
  ArrowDownTrayIcon,
  PencilSquareIcon,
  AdjustmentsHorizontalIcon,
  FunnelIcon,
  ChatBubbleBottomCenterTextIcon,
  ServerStackIcon,
} from "@heroicons/react/24/outline";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  useState,
  useCallback,
  useEffect,
  useRef,
  lazy,
  Suspense,
  type ReactNode,
} from "react";

import {
  SettingsGroup,
  SettingsHeader,
  SettingsAnimatedSection,
} from "./settings/shared";
import { AccountSection } from "./settings/account_section";
import { AppearanceSection } from "./settings/appearance_section";
import { AccessibilitySection } from "./settings/accessibility_section";
import { SecuritySection } from "./settings/security_section";
import { EncryptionSection } from "./settings/encryption_section";
import { AliasesSection } from "./settings/aliases_section";
const BillingSection = lazy(() =>
  import("./settings/billing_section").then((m) => ({
    default: m.BillingSection,
  })),
);

import { NotificationsSection } from "./settings/notifications_section";
import { BehaviorSection } from "./settings/behavior_section";
import { SignaturesSection } from "./settings/signatures_section";
import { TemplatesSection } from "./settings/templates_section";
import { ImportSection } from "./settings/import_section";
import { ExternalAccountsSection } from "./settings/external_accounts_section";
import { SenderFiltersSection } from "./settings/sender_filters_section";
import { FeedbackSection } from "./settings/feedback_section";
import { AboutSection } from "./settings/about_section";

import { ConfirmationModal } from "@/components/modals/confirmation_modal";
import { format_bytes } from "@/lib/utils";
import { ProfileAvatar } from "@/components/ui/profile_avatar";
import { use_should_reduce_motion } from "@/provider";
import { use_mail_stats } from "@/hooks/use_mail_stats";
import { use_i18n } from "@/lib/i18n/context";
import { use_preferences } from "@/contexts/preferences_context";
import { use_auth } from "@/contexts/auth_context";

function MobileSettingsPage() {
  const navigate = useNavigate();
  const { t } = use_i18n();
  const { user, logout } = use_auth();
  const { stats } = use_mail_stats();
  const { preferences, update_preference, save_now } = use_preferences();
  const reduce_motion = use_should_reduce_motion();
  const [section, set_section] = useState<SettingsSection | null>(null);
  const [is_closing, set_is_closing] = useState(false);
  const [show_logout_confirm, set_show_logout_confirm] = useState(false);
  const section_ref = useRef<SettingsSection | null>(null);

  const [search_params, set_search_params] = useSearchParams();

  const open_section = useCallback((s: SettingsSection) => {
    section_ref.current = s;
    set_section(s);
    window.history.pushState({ settings_section: s }, "");
  }, []);

  useEffect(() => {
    const initial_section = search_params.get("section");

    if (initial_section) {
      set_search_params({}, { replace: true });
      open_section(initial_section as SettingsSection);
    }
  }, []);

  const navigate_section = useCallback((s: SettingsSection) => {
    section_ref.current = s;
    set_section(s);
    window.history.replaceState({ settings_section: s }, "");
  }, []);

  const close_section = useCallback(() => {
    section_ref.current = null;
    set_section(null);
    window.history.back();
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ section: SettingsSection }>).detail;

      if (detail?.section) {
        open_section(detail.section);
      }
    };

    window.addEventListener("aster:open-settings-section", handler);

    return () =>
      window.removeEventListener("aster:open-settings-section", handler);
  }, [open_section]);

  useEffect(() => {
    const handle_popstate = () => {
      if (section_ref.current) {
        section_ref.current = null;
        set_section(null);
      }
    };

    window.addEventListener("popstate", handle_popstate);

    return () => window.removeEventListener("popstate", handle_popstate);
  }, []);

  const do_logout = useCallback(async () => {
    set_show_logout_confirm(false);
    try {
      await logout();
    } catch {}
  }, [logout]);

  const handle_logout = useCallback(() => {
    if (preferences.skip_logout_confirmation) {
      do_logout();
    } else {
      set_show_logout_confirm(true);
    }
  }, [preferences.skip_logout_confirmation, do_logout]);

  const handle_logout_dont_ask_again = useCallback(async () => {
    update_preference("skip_logout_confirmation", true);
    await save_now();
  }, [update_preference, save_now]);

  const handle_back = useCallback(() => {
    if (section_ref.current) {
      section_ref.current = null;
      set_section(null);
    }
    if (reduce_motion) {
      navigate("/", { replace: true });

      return;
    }
    set_is_closing(true);
  }, [navigate, reduce_motion]);

  const section_map: Record<SettingsSection, ReactNode> = {
    account: <AccountSection on_back={close_section} on_close={handle_back} />,
    appearance: (
      <AppearanceSection on_back={close_section} on_close={handle_back} />
    ),
    accessibility: (
      <AccessibilitySection on_back={close_section} on_close={handle_back} />
    ),
    security: (
      <SecuritySection
        on_back={close_section}
        on_close={handle_back}
        on_navigate_section={navigate_section}
      />
    ),
    encryption: (
      <EncryptionSection on_back={close_section} on_close={handle_back} />
    ),
    aliases: <AliasesSection on_back={close_section} on_close={handle_back} />,
    billing: (
      <Suspense fallback={null}>
        <BillingSection on_back={close_section} on_close={handle_back} />
      </Suspense>
    ),
    notifications: (
      <NotificationsSection on_back={close_section} on_close={handle_back} />
    ),
    behavior: (
      <BehaviorSection on_back={close_section} on_close={handle_back} />
    ),
    signatures: (
      <SignaturesSection on_back={close_section} on_close={handle_back} />
    ),
    templates: (
      <TemplatesSection on_back={close_section} on_close={handle_back} />
    ),
    import: <ImportSection on_back={close_section} on_close={handle_back} />,
    external_accounts: (
      <ExternalAccountsSection on_back={close_section} on_close={handle_back} />
    ),
    sender_filters: (
      <SenderFiltersSection on_back={close_section} on_close={handle_back} />
    ),
    feedback: (
      <FeedbackSection on_back={close_section} on_close={handle_back} />
    ),
    about: <AboutSection on_back={close_section} on_close={handle_back} />,
  };

  return (
    <motion.div
      animate={is_closing ? { opacity: 0 } : { opacity: 1 }}
      className="relative flex h-full flex-col"
      initial={reduce_motion ? false : { opacity: 0 }}
      transition={{ duration: 0.15, ease: "easeOut" }}
      onAnimationComplete={() => {
        if (is_closing) navigate("/", { replace: true });
      }}
    >
      <AnimatePresence mode="wait">
        {section ? (
          <SettingsAnimatedSection key={section}>
            {section_map[section]}
          </SettingsAnimatedSection>
        ) : (
          <motion.div
            key="main"
            animate={{ opacity: 1 }}
            className="flex h-full flex-col"
            exit={reduce_motion ? undefined : { opacity: 0 }}
            initial={reduce_motion ? false : { opacity: 0 }}
            transition={reduce_motion ? { duration: 0 } : { duration: 0.15 }}
          >
            <SettingsHeader
              on_close={handle_back}
              title={t("settings.title")}
            />

            <div className="flex-1 overflow-y-auto pb-12">
              <div className="px-4 pt-3 pb-1">
                <button
                  className="flex w-full items-center gap-3.5 rounded-2xl bg-[var(--mobile-bg-card)] px-4 py-3.5 text-left active:opacity-80"
                  type="button"
                  onClick={() => open_section("account")}
                >
                  <ProfileAvatar
                    email={user?.email ?? ""}
                    image_url={user?.profile_picture}
                    name={user?.display_name ?? ""}
                    profile_color={preferences.profile_color}
                    size="xl"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[16px] font-semibold text-[var(--text-primary)]">
                      {user?.display_name ?? user?.username ?? ""}
                    </p>
                    <p className="truncate text-[13px] text-[var(--text-muted)]">
                      {user?.email ?? ""}
                    </p>
                  </div>
                  <ChevronRightIcon className="h-5 w-5 shrink-0 text-[var(--text-muted)]" />
                </button>

                <div className="mt-2.5 rounded-xl bg-[var(--mobile-bg-card)] px-3.5 py-3">
                  <div className="flex items-center justify-between text-[12px]">
                    <span className="text-[var(--mobile-text-secondary)]">
                      {format_bytes(stats.storage_used_bytes)}
                    </span>
                    <span className="text-[var(--mobile-text-muted)]">
                      {stats.storage_total_bytes > 0
                        ? format_bytes(stats.storage_total_bytes)
                        : "---"}
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[var(--mobile-bg-card-hover)]">
                    <div
                      className="h-full rounded-full bg-[var(--mobile-accent)] transition-all"
                      style={{
                        width: `${stats.storage_total_bytes > 0 ? Math.min(Math.round((stats.storage_used_bytes / stats.storage_total_bytes) * 100), 100) : 0}%`,
                      }}
                    />
                  </div>
                  <button
                    className="mt-2.5 w-full rounded-lg py-2 text-[13px] font-semibold text-white"
                    style={{
                      background:
                        "linear-gradient(180deg, #6b8aff 0%, #4f6ef7 50%, #3b5ae8 100%)",
                      boxShadow:
                        "0 2px 4px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.15)",
                    }}
                    type="button"
                    onClick={() => open_section("billing")}
                  >
                    {t("common.upgrade")}
                  </button>
                </div>
              </div>

              <SettingsGroup title={t("settings.general")}>
                <button
                  className="flex w-full items-center gap-3 px-4 py-3 text-left active:opacity-80"
                  type="button"
                  onClick={() => open_section("appearance")}
                >
                  <SwatchIcon className="h-5 w-5 shrink-0 text-[var(--text-primary)]" />
                  <span className="min-w-0 flex-1 text-[15px] text-[var(--text-primary)]">
                    {t("settings.appearance")}
                  </span>
                  <ChevronRightIcon className="h-5 w-5 shrink-0 text-[var(--text-muted)]" />
                </button>
                <button
                  className="flex w-full items-center gap-3 px-4 py-3 text-left active:opacity-80"
                  type="button"
                  onClick={() => open_section("accessibility")}
                >
                  <EyeIcon className="h-5 w-5 shrink-0 text-[var(--text-primary)]" />
                  <span className="min-w-0 flex-1 text-[15px] text-[var(--text-primary)]">
                    {t("settings.accessibility")}
                  </span>
                  <ChevronRightIcon className="h-5 w-5 shrink-0 text-[var(--text-muted)]" />
                </button>
                <button
                  className="flex w-full items-center gap-3 px-4 py-3 text-left active:opacity-80"
                  type="button"
                  onClick={() => open_section("security")}
                >
                  <ShieldCheckIcon className="h-5 w-5 shrink-0 text-[var(--text-primary)]" />
                  <span className="min-w-0 flex-1 text-[15px] text-[var(--text-primary)]">
                    {t("settings.security")}
                  </span>
                  <ChevronRightIcon className="h-5 w-5 shrink-0 text-[var(--text-muted)]" />
                </button>
                <button
                  className="flex w-full items-center gap-3 px-4 py-3 text-left active:opacity-80"
                  type="button"
                  onClick={() => open_section("encryption")}
                >
                  <KeyIcon className="h-5 w-5 shrink-0 text-[var(--text-primary)]" />
                  <span className="min-w-0 flex-1 text-[15px] text-[var(--text-primary)]">
                    {t("settings.encryption")}
                  </span>
                  <ChevronRightIcon className="h-5 w-5 shrink-0 text-[var(--text-muted)]" />
                </button>
                <button
                  className="flex w-full items-center gap-3 px-4 py-3 text-left active:opacity-80"
                  type="button"
                  onClick={() => open_section("aliases")}
                >
                  <AtSymbolIcon className="h-5 w-5 shrink-0 text-[var(--text-primary)]" />
                  <span className="min-w-0 flex-1 text-[15px] text-[var(--text-primary)]">
                    {t("settings.aliases_and_domains")}
                  </span>
                  <ChevronRightIcon className="h-5 w-5 shrink-0 text-[var(--text-muted)]" />
                </button>
                <button
                  className="flex w-full items-center gap-3 px-4 py-3 text-left active:opacity-80"
                  type="button"
                  onClick={() => open_section("billing")}
                >
                  <CreditCardIcon className="h-5 w-5 shrink-0 text-[var(--text-primary)]" />
                  <span className="min-w-0 flex-1 text-[15px] text-[var(--text-primary)]">
                    {t("settings.billing")}
                  </span>
                  <ChevronRightIcon className="h-5 w-5 shrink-0 text-[var(--text-muted)]" />
                </button>
              </SettingsGroup>

              <SettingsGroup title={t("settings.mail_section")}>
                <button
                  className="flex w-full items-center gap-3 px-4 py-3 text-left active:opacity-80"
                  type="button"
                  onClick={() => open_section("notifications")}
                >
                  <BellIcon className="h-5 w-5 shrink-0 text-[var(--text-primary)]" />
                  <span className="min-w-0 flex-1 text-[15px] text-[var(--text-primary)]">
                    {t("settings.notifications")}
                  </span>
                  <ChevronRightIcon className="h-5 w-5 shrink-0 text-[var(--text-muted)]" />
                </button>
                <button
                  className="flex w-full items-center gap-3 px-4 py-3 text-left active:opacity-80"
                  type="button"
                  onClick={() => open_section("behavior")}
                >
                  <AdjustmentsHorizontalIcon className="h-5 w-5 shrink-0 text-[var(--text-primary)]" />
                  <span className="min-w-0 flex-1 text-[15px] text-[var(--text-primary)]">
                    {t("settings.behavior")}
                  </span>
                  <ChevronRightIcon className="h-5 w-5 shrink-0 text-[var(--text-muted)]" />
                </button>
                <button
                  className="flex w-full items-center gap-3 px-4 py-3 text-left active:opacity-80"
                  type="button"
                  onClick={() => open_section("signatures")}
                >
                  <PencilSquareIcon className="h-5 w-5 shrink-0 text-[var(--text-primary)]" />
                  <span className="min-w-0 flex-1 text-[15px] text-[var(--text-primary)]">
                    {t("settings.signature")}
                  </span>
                  <ChevronRightIcon className="h-5 w-5 shrink-0 text-[var(--text-muted)]" />
                </button>
                <button
                  className="flex w-full items-center gap-3 px-4 py-3 text-left active:opacity-80"
                  type="button"
                  onClick={() => open_section("templates")}
                >
                  <DocumentTextIcon className="h-5 w-5 shrink-0 text-[var(--text-primary)]" />
                  <span className="min-w-0 flex-1 text-[15px] text-[var(--text-primary)]">
                    {t("settings.templates")}
                  </span>
                  <ChevronRightIcon className="h-5 w-5 shrink-0 text-[var(--text-muted)]" />
                </button>
                <button
                  className="flex w-full items-center gap-3 px-4 py-3 text-left active:opacity-80"
                  type="button"
                  onClick={() => open_section("import")}
                >
                  <ArrowDownTrayIcon className="h-5 w-5 shrink-0 text-[var(--text-primary)]" />
                  <span className="min-w-0 flex-1 text-[15px] text-[var(--text-primary)]">
                    {t("common.import")}
                  </span>
                  <ChevronRightIcon className="h-5 w-5 shrink-0 text-[var(--text-muted)]" />
                </button>
                <button
                  className="flex w-full items-center gap-3 px-4 py-3 text-left active:opacity-80"
                  type="button"
                  onClick={() => open_section("external_accounts")}
                >
                  <ServerStackIcon className="h-5 w-5 shrink-0 text-[var(--text-primary)]" />
                  <span className="min-w-0 flex-1 text-[15px] text-[var(--text-primary)]">
                    {t("settings.external_accounts")}
                  </span>
                  <ChevronRightIcon className="h-5 w-5 shrink-0 text-[var(--text-muted)]" />
                </button>
                <button
                  className="flex w-full items-center gap-3 px-4 py-3 text-left active:opacity-80"
                  type="button"
                  onClick={() => open_section("sender_filters")}
                >
                  <FunnelIcon className="h-5 w-5 shrink-0 text-[var(--text-primary)]" />
                  <span className="min-w-0 flex-1 text-[15px] text-[var(--text-primary)]">
                    {t("settings.mail_management")}
                  </span>
                  <ChevronRightIcon className="h-5 w-5 shrink-0 text-[var(--text-muted)]" />
                </button>
              </SettingsGroup>

              <SettingsGroup title={t("settings.about")}>
                <button
                  className="flex w-full items-center gap-3 px-4 py-3 text-left active:opacity-80"
                  type="button"
                  onClick={() => open_section("about")}
                >
                  <InformationCircleIcon className="h-5 w-5 shrink-0 text-[var(--text-primary)]" />
                  <span className="min-w-0 flex-1 text-[15px] text-[var(--text-primary)]">
                    {t("settings.advanced")}
                  </span>
                  <ChevronRightIcon className="h-5 w-5 shrink-0 text-[var(--text-muted)]" />
                </button>
                <button
                  className="flex w-full items-center gap-3 px-4 py-3 text-left active:opacity-80"
                  type="button"
                  onClick={() => open_section("feedback")}
                >
                  <ChatBubbleBottomCenterTextIcon className="h-5 w-5 shrink-0 text-[var(--text-primary)]" />
                  <span className="min-w-0 flex-1 text-[15px] text-[var(--text-primary)]">
                    {t("settings.feedback")}
                  </span>
                  <ChevronRightIcon className="h-5 w-5 shrink-0 text-[var(--text-muted)]" />
                </button>
              </SettingsGroup>

              <div className="px-4 pt-4 pb-2">
                <motion.button
                  className="flex w-full items-center justify-center gap-2.5 rounded-2xl px-4 py-3.5 text-white active:opacity-90"
                  style={{
                    background:
                      "linear-gradient(180deg, #ef4444 0%, #dc2626 100%)",
                    boxShadow:
                      "0 2px 4px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.15)",
                  }}
                  type="button"
                  onClick={handle_logout}
                >
                  <ArrowRightStartOnRectangleIcon className="h-5 w-5 shrink-0" />
                  <span className="text-[16px] font-semibold">
                    {t("auth.sign_out")}
                  </span>
                </motion.button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <ConfirmationModal
        show_dont_ask_again
        cancel_text={t("common.cancel")}
        confirm_text={t("auth.sign_out")}
        is_open={show_logout_confirm}
        message={t("common.sign_out_confirmation")}
        on_cancel={() => set_show_logout_confirm(false)}
        on_confirm={do_logout}
        on_dont_ask_again={handle_logout_dont_ask_again}
        title={t("auth.sign_out")}
        variant="danger"
      />
    </motion.div>
  );
}

export default MobileSettingsPage;
