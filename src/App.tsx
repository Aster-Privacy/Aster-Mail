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
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Route, Routes } from "react-router-dom";
import { activate_subscription, get_subscription } from "@/services/api/billing";
import { FamilyWelcomeModal } from "@/components/settings/billing/family_welcome_modal";
import { request_cache } from "@/services/api/request_cache";
import { invalidate_mail_stats } from "@/hooks/use_mail_stats";
import { show_toast } from "@/components/toast/simple_toast";
import { use_i18n } from "@/lib/i18n/context";
import { use_auth } from "@/contexts/auth_context";

import { ProtectedRoute } from "@/components/common/protected_route";
import { SuspensionBanner } from "@/components/common/suspension_overlay";
import { PendingDeletionDialog } from "@/components/common/pending_deletion_dialog";
import { DesktopPairGate } from "@/components/common/desktop_pair_gate";
import { UpdateBanner } from "@/components/updates/update_banner";

function is_chunk_load_error(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message.toLowerCase();

  return (
    msg.includes("dynamically imported module") ||
    msg.includes("failed to fetch dynamically imported module") ||
    msg.includes("loading chunk") ||
    msg.includes("loading css chunk")
  );
}

const CHUNK_RELOAD_KEY = "aster:chunk_reload_at";
const CHUNK_RELOAD_COOLDOWN = 30_000;

function safe_chunk_reload(): void {
  try {
    const last = Number(sessionStorage.getItem(CHUNK_RELOAD_KEY) || "0");
    if (Date.now() - last < CHUNK_RELOAD_COOLDOWN) return;
    sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()));
  } catch {
    return;
  }
  window.location.reload();
}

function lazy_with_retry<T extends { default: React.ComponentType }>(
  import_fn: () => Promise<T>,
  retries = 3,
  delay = 1000,
): React.LazyExoticComponent<T["default"]> {
  return lazy(() => {
    const attempt = (remaining: number): Promise<T> =>
      import_fn().catch((error: unknown) => {
        if (is_chunk_load_error(error) && remaining <= 0) {
          safe_chunk_reload();

          return new Promise<T>(() => {});
        }

        if (remaining <= 0) throw error;

        return new Promise<T>((resolve) =>
          setTimeout(() => resolve(attempt(remaining - 1)), delay),
        );
      });

    return attempt(retries);
  });
}

const IndexPage = lazy_with_retry(() => import("@/pages/index"));
const SignInPage = lazy_with_retry(() => import("@/pages/sign_in"));
const RegisterPage = lazy_with_retry(() => import("@/pages/register"));
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
const ExternalRedirect = ({ url }: { url: string }) => {
  window.location.href = url;

  return null;
};

import { ActionToast } from "@/components/toast/action_toast";
import { SimpleToast } from "@/components/toast/simple_toast";
import { UnsubscribeConfirmationModal } from "@/components/modals/unsubscribe_confirmation_modal";
import { UpgradeModal } from "@/components/upgrade/upgrade_modal";
import { UndoSendContainer } from "@/components/toast/undo_send_container";
import { UndoSendPreviewModal } from "@/components/toast/undo_send_preview_modal";
import { EmailNotificationManager } from "@/components/email/email_notification_manager";
import { OfflineIndicator } from "@/components/common/offline_indicator";
import { FullPageLoader } from "@/components/common/full_page_loader";
import { ErrorBoundary } from "@/components/ui/error_boundary";
import { AppLock } from "@/components/mobile";

interface FamilyWelcomeState {
  plan_name: string;
  max_members: number;
  storage_pool_bytes: number;
}

function BillingSuccessHandler() {
  const { t } = use_i18n();
  const { is_authenticated } = use_auth();
  const handled = useRef(false);
  const [family_welcome, set_family_welcome] = useState<FamilyWelcomeState | null>(null);

  useEffect(() => {
    if (!is_authenticated || handled.current) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("billing") !== "success") return;

    handled.current = true;
    window.history.replaceState({}, "", window.location.pathname);

    (async () => {
      request_cache.invalidate("/payments/v1");
      invalidate_mail_stats();
      try {
        await activate_subscription();
      } catch {
        // best-effort; webhook is source of truth
      }
      for (let i = 0; i < 8; i++) {
        await new Promise((r) => setTimeout(r, i === 0 ? 800 : 1500));
        request_cache.invalidate("/payments/v1");
        const res = await get_subscription();
        if (res.data && res.data.plan.code !== "free") {
          invalidate_mail_stats();
          window.dispatchEvent(new CustomEvent("aster:plan-changed"));
          show_toast(t("settings.payment_success"), "success");
          const code = res.data.plan.code;
          if (code === "duo" || code === "family") {
            const max_members = code === "duo" ? 2 : 6;
            const storage_gb = code === "duo" ? 500 : 3000;
            set_family_welcome({
              plan_name: res.data.plan.name ?? (code === "duo" ? "Duo" : "Family"),
              max_members,
              storage_pool_bytes: storage_gb * 1073741824,
            });
          }
          return;
        }
      }
      show_toast(t("settings.payment_success"), "success");
    })();
  }, [is_authenticated, t]);

  if (!family_welcome) return null;

  return (
    <FamilyWelcomeModal
      is_open={true}
      on_close={() => set_family_welcome(null)}
      plan_name={family_welcome.plan_name}
      max_members={family_welcome.max_members}
      storage_pool_bytes={family_welcome.storage_pool_bytes}
      on_go_to_family={() => {
        set_family_welcome(null);
        window.dispatchEvent(new CustomEvent("navigate-settings", { detail: "family" }));
      }}
    />
  );
}

function App() {
  return (
    <AppLock>
      <BillingSuccessHandler />
      <SuspensionBanner />
      <PendingDeletionDialog />
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
              <Route element={<FamilyClaimPage />} path="/family/claim/:token" />
              <Route element={<SecureViewPage />} path="/view/:token" />
              <Route element={<NotFoundPage />} path="*" />
            </Routes>
          </Suspense>
        </DesktopPairGate>
      </ErrorBoundary>
      <ActionToast />
      <SimpleToast />
      <UnsubscribeConfirmationModal />
      <UpgradeModal />
      <UndoSendContainer max_visible={3} position="bottom-center" />
      <UndoSendPreviewModal />
      <EmailNotificationManager />
      <OfflineIndicator position="top" />
    </AppLock>
  );
}

export default App;
