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
import { Suspense, useEffect, useRef, useState } from "react";
import { Route, Routes } from "react-router-dom";

import {
  activate_subscription,
  clear_checkout_target,
  get_subscription,
  read_checkout_target,
} from "@/services/api/billing";
import { FamilyWelcomeModal } from "@/components/settings/billing/family_welcome_modal";
import { CheckoutReturnHandler } from "@/components/common/checkout_return_handler";
import { request_cache } from "@/services/api/request_cache";
import { invalidate_mail_stats } from "@/hooks/use_mail_stats";
import {
  show_toast,
  TOAST_DURATION_BILLING_MS,
} from "@/components/toast/simple_toast";
import { use_i18n } from "@/lib/i18n/context";
import { use_auth } from "@/contexts/auth_context";
import { ProtectedRoute } from "@/components/common/protected_route";
import { SuspensionBanner } from "@/components/common/suspension_overlay";
import { Family2faDialog } from "@/components/common/family_2fa_dialog";
import { PendingDeletionDialog } from "@/components/common/pending_deletion_dialog";
import { DesktopPairGate } from "@/components/common/desktop_pair_gate";
import { UpdateBanner } from "@/components/updates/update_banner";

const IndexPage = lazy_with_retry(() => import("@/pages/index"));
const SignInPage = lazy_with_retry(() => import("@/pages/sign_in"));
const RegisterPage = lazy_with_retry(() => import("@/pages/register"));
const InvitePage = lazy_with_retry(() => import("@/pages/invite"));
const ForgotPasswordPage = lazy_with_retry(
  () => import("@/pages/forgot_password"),
);
const ResetPasswordPage = lazy_with_retry(
  () => import("@/pages/reset_password"),
);
const EmailDetailPage = lazy_with_retry(
  () => import("@/pages/email_detail_page"),
);
const VerifyRecoveryEmailPage = lazy_with_retry(
  () => import("@/pages/verify_recovery_email"),
);
const SecureViewPage = lazy_with_retry(() => import("@/pages/secure_view"));
const NotFoundPage = lazy_with_retry(() => import("@/pages/not_found"));
const LinkDevicePage = lazy_with_retry(() => import("@/pages/link_device"));
const JoinFamilyPage = lazy_with_retry(() => import("@/pages/join_family"));
const FamilyClaimPage = lazy_with_retry(() => import("@/pages/family_claim"));
const CryptoInvoicePage = lazy_with_retry(
  () => import("@/pages/crypto_invoice"),
);
const ExternalRedirect = ({ url }: { url: string }) => {
  window.location.href = url;

  return null;
};

import { ActionToast } from "@/components/toast/action_toast";
import { SimpleToast } from "@/components/toast/simple_toast";
import { PostQuantumSendPrompt } from "@/components/compose/post_quantum_send_prompt";
import { UnsubscribeConfirmationModal } from "@/components/modals/unsubscribe_confirmation_modal";
import { PurchaseSuccessModal } from "@/components/modals/purchase_success_modal";
import { UpgradeModal } from "@/components/upgrade/upgrade_modal";
import {
  show_checkout_cancelled_upgrade,
  type UpgradeInterval,
} from "@/stores/upgrade_store";
import { PLAN_TIERS } from "@/components/settings/billing/billing_constants";
import { UndoSendContainer } from "@/components/toast/undo_send_container";
import { UndoSendPreviewModal } from "@/components/toast/undo_send_preview_modal";
import { EmailNotificationManager } from "@/components/email/email_notification_manager";
import { FolderUnlockPrompt } from "@/components/folders/folder_unlock_prompt";
import { OfflineIndicator } from "@/components/common/offline_indicator";
import { FullPageLoader } from "@/components/common/full_page_loader";
import { ErrorBoundary } from "@/components/ui/error_boundary";
import { lazy_with_retry } from "@/utils/lazy_with_retry";
import { AppLock } from "@/components/mobile";
import { install_global_autoscroll } from "@/lib/global_autoscroll";
import { ignore_error } from "@/lib/ignore_error";

interface FamilyWelcomeState {
  plan_name: string;
  max_members: number;
  storage_pool_bytes: number;
}

const FAMILY_WELCOME_SEEN_KEY_PREFIX = "aster_family_welcome_seen_";

function has_seen_family_welcome(account_id: string): boolean {
  try {
    return (
      localStorage.getItem(`${FAMILY_WELCOME_SEEN_KEY_PREFIX}${account_id}`) ===
      "1"
    );
  } catch {
    return false;
  }
}

function mark_family_welcome_seen(account_id: string): void {
  try {
    localStorage.setItem(`${FAMILY_WELCOME_SEEN_KEY_PREFIX}${account_id}`, "1");
  } catch {
    // best-effort persistence; a full disk or blocked storage should not crash the app
  }
}

const BILLING_RETURN_KEY = "aster_billing_return";

function upgrade_interval_for(billing_interval: string): UpgradeInterval {
  if (billing_interval === "month") return "month";
  if (billing_interval === "biennial") return "biennial";

  return "year";
}

function BillingSuccessHandler() {
  const { t } = use_i18n();
  const { is_authenticated, current_account_id } = use_auth();
  const handled = useRef(false);
  const [family_welcome, set_family_welcome] =
    useState<FamilyWelcomeState | null>(null);
  const [individual_welcome, set_individual_welcome] = useState<{
    plan: string;
    billing: string;
  } | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const billing = params.get("billing");

    if (billing !== "success" && billing !== "cancelled") return;

    try {
      sessionStorage.setItem(
        BILLING_RETURN_KEY,
        billing === "success" ? "success" : "cancelled",
      );
    } catch (caught) {
      ignore_error("App:BillingSuccessHandler", caught);
    }
    params.delete("billing");
    const query = params.toString();

    window.history.replaceState(
      {},
      "",
      window.location.pathname + (query ? `?${query}` : ""),
    );
  }, []);

  useEffect(() => {
    if (!is_authenticated || handled.current) return;

    let billing: string | null = null;

    try {
      billing = sessionStorage.getItem(BILLING_RETURN_KEY);
    } catch (caught) {
      ignore_error("App:BillingSuccessHandler", caught);
    }

    if (!billing) return;

    handled.current = true;

    try {
      sessionStorage.removeItem(BILLING_RETURN_KEY);
    } catch (caught) {
      ignore_error("App:BillingSuccessHandler", caught);
    }

    if (billing === "cancelled") {
      const target = read_checkout_target();
      const target_tier = target
        ? PLAN_TIERS.find((tier) => tier.id === target.plan_code)
        : null;

      const resumed =
        target && target_tier
          ? show_checkout_cancelled_upgrade({
              plan_code: target.plan_code,
              interval: upgrade_interval_for(target.billing_interval),
            })
          : false;

      if (!resumed) {
        clear_checkout_target();
        show_toast(
          t("settings.billing_checkout_cancelled"),
          "info",
          TOAST_DURATION_BILLING_MS,
        );
      }

      return;
    }

    (async () => {
      request_cache.invalidate("/payments/v1");
      invalidate_mail_stats();
      try {
        await activate_subscription();
      } catch {
        // best-effort; webhook is source of truth
      }
      const target = read_checkout_target()?.plan_code ?? null;

      clear_checkout_target();

      for (let i = 0; i < 8; i++) {
        await new Promise((r) => setTimeout(r, i === 0 ? 800 : 1500));
        request_cache.invalidate("/payments/v1");
        const res = await get_subscription();
        const live = res.data?.plan.code;
        const activated = target
          ? live === target
          : Boolean(live) && live !== "free";

        if (res.data && activated) {
          invalidate_mail_stats();
          window.dispatchEvent(new CustomEvent("aster:plan-changed"));
          const code = res.data.plan.code;

          if (
            (code === "duo" || code === "family") &&
            current_account_id &&
            !has_seen_family_welcome(current_account_id)
          ) {
            const max_members = code === "duo" ? 2 : 6;
            const storage_gb = code === "duo" ? 500 : 3000;

            mark_family_welcome_seen(current_account_id);
            set_family_welcome({
              plan_name:
                res.data.plan.name ?? (code === "duo" ? "Duo" : "Family"),
              max_members,
              storage_pool_bytes: storage_gb * 1073741824,
            });
          } else {
            const billing = (res.data.plan.billing_period || "").startsWith(
              "year",
            )
              ? "year"
              : "month";

            set_individual_welcome({ plan: code, billing });
          }

          return;
        }
      }
      request_cache.invalidate("/payments/v1");
      invalidate_mail_stats();
      window.dispatchEvent(new CustomEvent("aster:plan-changed"));
      show_toast(
        t("settings.payment_processing_delayed"),
        "info",
        TOAST_DURATION_BILLING_MS,
      );
    })();
  }, [is_authenticated, current_account_id, t]);

  if (!family_welcome && !individual_welcome) return null;

  return (
    <>
      {family_welcome && (
        <FamilyWelcomeModal
          is_open={true}
          max_members={family_welcome.max_members}
          on_close={() => set_family_welcome(null)}
          on_go_to_family={() => {
            set_family_welcome(null);
            window.dispatchEvent(
              new CustomEvent("navigate-settings", { detail: "family" }),
            );
          }}
          plan_name={family_welcome.plan_name}
          storage_pool_bytes={family_welcome.storage_pool_bytes}
        />
      )}
      {individual_welcome && (
        <PurchaseSuccessModal
          billing={individual_welcome.billing}
          is_open={true}
          on_close={() => set_individual_welcome(null)}
          on_view_billing={() => {
            set_individual_welcome(null);
            window.dispatchEvent(
              new CustomEvent("navigate-settings", { detail: "billing" }),
            );
          }}
          plan={individual_welcome.plan}
        />
      )}
    </>
  );
}

function App() {
  useEffect(() => install_global_autoscroll(), []);

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const order_id = params.get("domain_order");

      if (order_id && params.get("cancelled") !== "1") {
        sessionStorage.setItem("aster_pending_domain_order", order_id);
      }
    } catch (caught) {
      ignore_error("App:App", caught);
    }
  }, []);

  return (
    <AppLock>
      <BillingSuccessHandler />
      <CheckoutReturnHandler />
      <SuspensionBanner />
      <PendingDeletionDialog />
      <Family2faDialog />
      <UpdateBanner />
      <ErrorBoundary>
        <DesktopPairGate>
          <Suspense fallback={<FullPageLoader />}>
            <Routes>
              <Route
                element={
                  <ProtectedRoute>
                    <IndexPage />
                  </ProtectedRoute>
                }
                path="/"
              />
              <Route
                element={
                  <ProtectedRoute>
                    <IndexPage />
                  </ProtectedRoute>
                }
                path="/all"
              />
              <Route
                element={
                  <ProtectedRoute>
                    <IndexPage />
                  </ProtectedRoute>
                }
                path="/starred"
              />
              <Route
                element={
                  <ProtectedRoute>
                    <IndexPage />
                  </ProtectedRoute>
                }
                path="/sent"
              />
              <Route
                element={
                  <ProtectedRoute>
                    <IndexPage />
                  </ProtectedRoute>
                }
                path="/drafts"
              />
              <Route
                element={
                  <ProtectedRoute>
                    <IndexPage />
                  </ProtectedRoute>
                }
                path="/scheduled"
              />
              <Route
                element={
                  <ProtectedRoute>
                    <IndexPage />
                  </ProtectedRoute>
                }
                path="/snoozed"
              />
              <Route
                element={
                  <ProtectedRoute>
                    <IndexPage />
                  </ProtectedRoute>
                }
                path="/archive"
              />
              <Route
                element={
                  <ProtectedRoute>
                    <IndexPage />
                  </ProtectedRoute>
                }
                path="/spam"
              />
              <Route
                element={
                  <ProtectedRoute>
                    <IndexPage />
                  </ProtectedRoute>
                }
                path="/trash"
              />
              <Route
                element={
                  <ProtectedRoute>
                    <IndexPage />
                  </ProtectedRoute>
                }
                path="/folder/:folder_token"
              />
              <Route
                element={
                  <ProtectedRoute>
                    <IndexPage />
                  </ProtectedRoute>
                }
                path="/tag/:tag_token"
              />
              <Route
                element={
                  <ProtectedRoute>
                    <IndexPage />
                  </ProtectedRoute>
                }
                path="/alias/:alias_address"
              />
              <Route element={<SignInPage />} path="/sign-in" />
              <Route element={<RegisterPage />} path="/register" />
              <Route element={<InvitePage />} path="/invite/:code" />
              <Route element={<RegisterPage />} path="/signup" />
              <Route element={<ForgotPasswordPage />} path="/forgot-password" />
              <Route element={<ResetPasswordPage />} path="/reset-password" />
              <Route
                element={<VerifyRecoveryEmailPage />}
                path="/verify-recovery-email"
              />
              <Route
                element={<ExternalRedirect url="https://astermail.org/terms" />}
                path="/terms"
              />
              <Route
                element={
                  <ExternalRedirect url="https://astermail.org/privacy" />
                }
                path="/privacy"
              />
              <Route
                element={
                  <ProtectedRoute>
                    <EmailDetailPage />
                  </ProtectedRoute>
                }
                path="/email/:email_id"
              />
              <Route
                element={
                  <ProtectedRoute>
                    <IndexPage />
                  </ProtectedRoute>
                }
                path="/contacts"
              />
              <Route
                element={
                  <ProtectedRoute>
                    <IndexPage />
                  </ProtectedRoute>
                }
                path="/subscriptions"
              />
              <Route
                element={
                  <ProtectedRoute>
                    <IndexPage />
                  </ProtectedRoute>
                }
                path="/compose"
              />
              <Route
                element={
                  <ProtectedRoute>
                    <IndexPage />
                  </ProtectedRoute>
                }
                path="/settings/:section?"
              />
              <Route element={<LinkDevicePage />} path="/link-device" />
              <Route element={<JoinFamilyPage />} path="/join/family" />
              <Route
                element={<FamilyClaimPage />}
                path="/family/claim/:token"
              />
              <Route element={<SecureViewPage />} path="/view/:token" />
              <Route
                element={
                  <ProtectedRoute>
                    <CryptoInvoicePage />
                  </ProtectedRoute>
                }
                path="/crypto-invoice/:id"
              />
              <Route element={<NotFoundPage />} path="*" />
            </Routes>
          </Suspense>
        </DesktopPairGate>
      </ErrorBoundary>
      <ActionToast />
      <SimpleToast />
      <UnsubscribeConfirmationModal />
      <PostQuantumSendPrompt />
      <UpgradeModal />
      <UndoSendContainer max_visible={3} position="bottom-center" />
      <UndoSendPreviewModal />
      <EmailNotificationManager />
      <FolderUnlockPrompt />
      <OfflineIndicator position="top" />
    </AppLock>
  );
}

export default App;
