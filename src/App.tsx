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
import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";

import { ProtectedRoute } from "@/components/common/protected_route";
import { SuspensionBanner } from "@/components/common/suspension_overlay";
import { DesktopPairGate } from "@/components/common/desktop_pair_gate";

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

function lazy_with_retry<T extends { default: React.ComponentType }>(
  import_fn: () => Promise<T>,
  retries = 3,
  delay = 1000,
): React.LazyExoticComponent<T["default"]> {
  return lazy(() => {
    const attempt = (remaining: number): Promise<T> =>
      import_fn().catch((error: unknown) => {
        if (is_chunk_load_error(error) && remaining <= 0) {
          window.location.reload();

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
const EmailDetailPage = lazy_with_retry(
  () => import("@/pages/email_detail_page"),
);
const VerifyRecoveryEmailPage = lazy_with_retry(
  () => import("@/pages/verify_recovery_email"),
);
const NotFoundPage = lazy_with_retry(() => import("@/pages/not_found"));
const LinkDevicePage = lazy_with_retry(() => import("@/pages/link_device"));
const ExternalRedirect = ({ url }: { url: string }) => {
  window.location.href = url;

  return null;
};

import { ActionToast } from "@/components/toast/action_toast";
import { SimpleToast } from "@/components/toast/simple_toast";
import { UnsubscribeConfirmationModal } from "@/components/modals/unsubscribe_confirmation_modal";
import { UndoSendContainer } from "@/components/toast/undo_send_container";
import { UndoSendPreviewModal } from "@/components/toast/undo_send_preview_modal";
import { EmailNotificationManager } from "@/components/email/email_notification_manager";
import { OfflineIndicator } from "@/components/common/offline_indicator";
import { FullPageLoader } from "@/components/common/full_page_loader";
import { ErrorBoundary } from "@/components/ui/error_boundary";
import { AppLock } from "@/components/mobile";

function App() {
  return (
    <AppLock>
      <SuspensionBanner />
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
              <Route element={<LinkDevicePage />} path="/link-device" />
              <Route element={<NotFoundPage />} path="*" />
            </Routes>
          </Suspense>
        </DesktopPairGate>
      </ErrorBoundary>
      <ActionToast />
      <SimpleToast />
      <UnsubscribeConfirmationModal />
      <UndoSendContainer max_visible={3} position="bottom-center" />
      <UndoSendPreviewModal />
      <EmailNotificationManager />
      <OfflineIndicator position="top" />
    </AppLock>
  );
}

export default App;
