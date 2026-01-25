import { Route, Routes } from "react-router-dom";

import IndexPage from "@/pages/index";
import SignInPage from "@/pages/sign_in";
import RegisterPage from "@/pages/register";
import ForgotPasswordPage from "@/pages/forgot_password";
import EmailDetailPage from "@/pages/email_detail_page";
import { ProtectedRoute } from "@/components/protected_route";
import { ActionToast } from "@/components/action_toast";
import { SimpleToast } from "@/components/simple_toast";
import { UndoSendContainer } from "@/components/undo_send_container";
import { EmailNotificationManager } from "@/components/email_notification_manager";
import { OfflineIndicator } from "@/components/offline_indicator";
import { PWAUpdatePrompt } from "@/components/pwa_update_prompt";
import { ErrorBoundary } from "@/components/ui/error_boundary";
import { AppLock } from "@/components/mobile";

function App() {
  return (
    <AppLock>
      <ErrorBoundary>
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
          <Route element={<SignInPage />} path="/sign-in" />
          <Route element={<RegisterPage />} path="/register" />
          <Route element={<RegisterPage />} path="/signup" />
          <Route element={<ForgotPasswordPage />} path="/forgot-password" />
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
        </Routes>
      </ErrorBoundary>
      <ActionToast />
      <SimpleToast />
      <UndoSendContainer max_visible={3} position="bottom-center" />
      <EmailNotificationManager />
      <OfflineIndicator position="top" />
      <PWAUpdatePrompt />
    </AppLock>
  );
}

export default App;
