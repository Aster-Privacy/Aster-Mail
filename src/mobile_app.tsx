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
import type { EditDraftData } from "@/components/compose/compose_shared";

import {
  lazy,
  Suspense,
  useState,
  useCallback,
  useRef,
  useEffect,
} from "react";
import {
  Routes,
  Route,
  Navigate,
  useNavigate,
  useLocation,
} from "react-router-dom";
import { AnimatePresence } from "framer-motion";

import { use_auth } from "@/contexts/auth_context";
import { use_background_subscription_scan } from "@/hooks/use_background_subscription_scan";
import { AppLock } from "@/components/mobile/app_lock";
import { Skeleton } from "@/components/ui/skeleton";
import { MobileDrawer } from "@/components/mobile/mobile_drawer";
import { MobileFab } from "@/components/mobile/mobile_fab";
import { SimpleToast } from "@/components/toast/simple_toast";
import { ActionToast } from "@/components/toast/action_toast";
import { UndoSendContainer } from "@/components/toast/undo_send_container";
import { UndoSendPreviewModal } from "@/components/toast/undo_send_preview_modal";
import { ErrorBoundary } from "@/components/ui/error_boundary";

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

function lazy_with_retry(
  import_fn: () => Promise<{ default: React.ComponentType<any> }>,
  retries = 3,
  delay = 1000,
) {
  return lazy(() => {
    const attempt = (
      remaining: number,
    ): Promise<{ default: React.ComponentType<any> }> =>
      import_fn().catch((error: unknown) => {
        if (is_chunk_load_error(error)) {
          const reloaded_key = "astermail:chunk-reload";
          const last_reload = sessionStorage.getItem(reloaded_key);
          const now = Date.now();

          if (!last_reload || now - Number(last_reload) > 10000) {
            sessionStorage.setItem(reloaded_key, String(now));
            window.location.reload();

            return new Promise<{ default: React.ComponentType<any> }>(() => {});
          }
        }

        if (remaining <= 0) throw error;

        return new Promise<{ default: React.ComponentType<any> }>((resolve) =>
          setTimeout(() => resolve(attempt(remaining - 1)), delay),
        );
      });

    return attempt(retries);
  });
}

const MobileInbox = lazy_with_retry(
  () => import("@/pages/mobile/mobile_inbox"),
);
const MobileMailDetail = lazy_with_retry(
  () => import("@/pages/mobile/mobile_mail_detail"),
);
const MobileComposePage = lazy_with_retry(
  () => import("@/pages/mobile/mobile_compose_page"),
);
const MobileSearchPage = lazy_with_retry(
  () => import("@/pages/mobile/mobile_search_page"),
);
const MobileContactsPage = lazy_with_retry(
  () => import("@/pages/mobile/mobile_contacts_page"),
);
const MobileSettingsPage = lazy_with_retry(
  () => import("@/pages/mobile/mobile_settings_page"),
);
const MobileSubscriptionsPage = lazy_with_retry(
  () => import("@/pages/mobile/mobile_subscriptions_page"),
);
const MobileWelcomePage = lazy_with_retry(
  () => import("@/pages/mobile/mobile_welcome"),
);
const SignInPage = lazy_with_retry(
  () => import("@/pages/mobile/mobile_sign_in"),
);
const RegisterPage = lazy_with_retry(
  () => import("@/pages/mobile/mobile_register"),
);

import("@/pages/mobile/mobile_sign_in").catch(() => {});
import("@/pages/mobile/mobile_register").catch(() => {});
import("@/pages/mobile/mobile_welcome").catch(() => {});
const ForgotPasswordPage = lazy_with_retry(
  () => import("@/pages/mobile/mobile_forgot_password"),
);
const BrowserLoginPage = lazy_with_retry(
  () => import("@/pages/mobile/mobile_browser_login"),
);
const ExternalRedirect = ({ url }: { url: string }) => {
  window.location.href = url;

  return null;
};
const NotFoundPage = lazy_with_retry(() => import("@/pages/not_found"));

function MobileLoader() {
  return (
    <div className="flex h-screen w-full flex-col bg-[var(--bg-primary)]">
      <div className="flex items-center gap-3 px-4 pt-[env(safe-area-inset-top)] pb-2">
        <Skeleton className="h-8 w-8 rounded-full" />
        <Skeleton className="h-5 w-32 rounded" />
      </div>
      <div className="flex-1 space-y-1 px-4 pt-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 rounded-xl p-3">
            <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-3/4 rounded" />
              <Skeleton className="h-3 w-1/2 rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MobileProtectedRoute({ children }: { children: React.ReactNode }) {
  const { is_authenticated, is_loading, is_completing_registration } =
    use_auth();
  const location = useLocation();

  if (is_loading) {
    return null;
  }

  if (!is_authenticated && !is_completing_registration) {
    return <Navigate replace state={{ from: location }} to="/welcome" />;
  }

  return <>{children}</>;
}

const AUTH_PREFIXES = [
  "/welcome",
  "/sign-in",
  "/register",
  "/signup",
  "/forgot-password",
  "/browser-login",
  "/terms",
  "/privacy",
];

const LIST_PATHS = [
  "/",
  "/inbox",
  "/all",
  "/starred",
  "/sent",
  "/drafts",
  "/scheduled",
  "/snoozed",
  "/archive",
  "/spam",
  "/trash",
];

function is_list_page(pathname: string): boolean {
  if (LIST_PATHS.includes(pathname)) return true;
  if (
    pathname.startsWith("/folder/") ||
    pathname.startsWith("/tag/") ||
    pathname.startsWith("/alias/")
  )
    return true;

  return false;
}

function MobileApp() {
  const navigate = useNavigate();
  const location = useLocation();
  const [is_compose_open, set_is_compose_open] = useState(false);
  const [is_drawer_open, set_is_drawer_open] = useState(false);
  const [is_selection_active, set_is_selection_active] = useState(false);
  const edit_draft_ref = useRef<EditDraftData | null>(null);

  use_background_subscription_scan();

  const handle_selection_mode_change = useCallback((active: boolean) => {
    set_is_selection_active(active);
  }, []);

  const handle_compose_open = useCallback((to?: string) => {
    if (to) {
      const recipients = to
        .split(",")
        .map((e) => e.trim())
        .filter(Boolean);

      edit_draft_ref.current = {
        id: "",
        version: 0,
        draft_type: "new",
        to_recipients: recipients,
        cc_recipients: [],
        bcc_recipients: [],
        subject: "",
        message: "",
        updated_at: new Date().toISOString(),
      };
    } else {
      edit_draft_ref.current = null;
    }
    set_is_compose_open(true);
  }, []);

  const handle_compose_close = useCallback(() => {
    edit_draft_ref.current = null;
    set_is_compose_open(false);
  }, []);

  const handle_draft_click = useCallback(
    (draft: {
      id: string;
      version: number;
      draft_type: string;
      reply_to_id?: string;
      forward_from_id?: string;
      subject: string;
      full_message: string;
      to_recipients: string[];
      cc_recipients: string[];
      bcc_recipients: string[];
      updated_at: string;
    }) => {
      edit_draft_ref.current = {
        id: draft.id,
        version: draft.version,
        draft_type: draft.draft_type as "new" | "reply" | "forward",
        reply_to_id: draft.reply_to_id,
        forward_from_id: draft.forward_from_id,
        subject: draft.subject,
        message: draft.full_message,
        to_recipients: draft.to_recipients,
        cc_recipients: draft.cc_recipients,
        bcc_recipients: draft.bcc_recipients,
        updated_at: draft.updated_at,
      };
      set_is_compose_open(true);
    },
    [],
  );

  const handle_open_drawer = useCallback(() => {
    set_is_drawer_open(true);
  }, []);

  const handle_close_drawer = useCallback(() => {
    set_is_drawer_open(false);
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const data = (
        e as CustomEvent<{
          to_recipients: string[];
          cc_recipients: string[];
          bcc_recipients: string[];
          subject: string;
          message: string;
          draft_type: "reply" | "forward" | "new";
          reply_to_id?: string;
          forward_from_id?: string;
          thread_token?: string;
        }>
      ).detail;

      edit_draft_ref.current = {
        id: "",
        version: 0,
        draft_type: data.draft_type,
        reply_to_id: data.reply_to_id,
        forward_from_id: data.forward_from_id,
        thread_token: data.thread_token,
        to_recipients: data.to_recipients,
        cc_recipients: data.cc_recipients,
        bcc_recipients: data.bcc_recipients,
        subject: data.subject,
        message: data.message,
        updated_at: new Date().toISOString(),
      };
      set_is_compose_open(true);
    };

    window.addEventListener("aster:mobile-compose", handler);

    return () => window.removeEventListener("aster:mobile-compose", handler);
  }, []);

  useEffect(() => {
    const open_compose = (to?: string, subject?: string, body?: string) => {
      edit_draft_ref.current = {
        id: "",
        version: 0,
        draft_type: "new",
        to_recipients: to ? [to] : [],
        cc_recipients: [],
        bcc_recipients: [],
        subject: subject || "",
        message: body || "",
        updated_at: new Date().toISOString(),
      };
      set_is_compose_open(true);
    };

    const pending = (window as unknown as Record<string, unknown>)
      .__aster_pending_compose as
      | { to: string; subject: string; body: string }
      | undefined;

    if (pending) {
      delete (window as unknown as Record<string, unknown>)
        .__aster_pending_compose;
      open_compose(pending.to, pending.subject, pending.body);

      return;
    }

    const params = new URLSearchParams(window.location.search);

    if (params.get("compose") === "true") {
      open_compose(
        params.get("to") || undefined,
        params.get("subject") || undefined,
        params.get("body") || undefined,
      );
      window.history.replaceState({}, "", "/");
    }
  }, []);

  useEffect(() => {
    const handle_internal_link = (e: Event) => {
      const path = (e as CustomEvent<{ path: string }>).detail?.path || "";

      if (path.startsWith("settings")) {
        const section = path.split("/")[1];

        if (section) {
          navigate(`/settings?section=${encodeURIComponent(section)}`);
        } else {
          navigate("/settings");
        }
      }
    };

    window.addEventListener("aster-internal-link", handle_internal_link);

    return () =>
      window.removeEventListener("aster-internal-link", handle_internal_link);
  }, [navigate]);

  const handle_navigate = useCallback(
    (path: string) => {
      navigate(path);
    },
    [navigate],
  );

  useEffect(() => {
    const handle_back = (e: Event) => {
      if (is_compose_open) {
        e.preventDefault();
        handle_compose_close();
      } else if (is_drawer_open) {
        e.preventDefault();
        handle_close_drawer();
      } else if (is_selection_active) {
        e.preventDefault();
        handle_selection_mode_change(false);
      }
    };

    window.addEventListener("capacitor:backbutton", handle_back);

    return () =>
      window.removeEventListener("capacitor:backbutton", handle_back);
  }, [
    is_compose_open,
    is_drawer_open,
    is_selection_active,
    handle_compose_close,
    handle_close_drawer,
    handle_selection_mode_change,
  ]);

  const is_auth_route = AUTH_PREFIXES.some((p) =>
    location.pathname.startsWith(p),
  );
  const show_fab =
    is_list_page(location.pathname) && !is_auth_route && !is_selection_active;

  return (
    <AppLock>
      <div className="relative flex h-[100dvh] flex-col bg-[var(--bg-primary)]">
        <ErrorBoundary>
          <Suspense fallback={<MobileLoader />}>
            <Routes>
              <Route
                element={
                  <MobileProtectedRoute>
                    <MobileInbox
                      key="inbox"
                      on_compose={handle_compose_open}
                      on_open_drawer={handle_open_drawer}
                      on_selection_mode_change={handle_selection_mode_change}
                    />
                  </MobileProtectedRoute>
                }
                path="/"
              />
              <Route
                element={
                  <MobileProtectedRoute>
                    <MobileInbox
                      key="inbox"
                      on_compose={handle_compose_open}
                      on_open_drawer={handle_open_drawer}
                      on_selection_mode_change={handle_selection_mode_change}
                    />
                  </MobileProtectedRoute>
                }
                path="/inbox"
              />
              <Route
                element={
                  <MobileProtectedRoute>
                    <MobileInbox
                      key="all"
                      mailbox="all"
                      on_compose={handle_compose_open}
                      on_open_drawer={handle_open_drawer}
                      on_selection_mode_change={handle_selection_mode_change}
                    />
                  </MobileProtectedRoute>
                }
                path="/all"
              />
              <Route
                element={
                  <MobileProtectedRoute>
                    <MobileInbox
                      key="starred"
                      mailbox="starred"
                      on_compose={handle_compose_open}
                      on_open_drawer={handle_open_drawer}
                      on_selection_mode_change={handle_selection_mode_change}
                    />
                  </MobileProtectedRoute>
                }
                path="/starred"
              />
              <Route
                element={
                  <MobileProtectedRoute>
                    <MobileInbox
                      key="sent"
                      mailbox="sent"
                      on_compose={handle_compose_open}
                      on_open_drawer={handle_open_drawer}
                      on_selection_mode_change={handle_selection_mode_change}
                    />
                  </MobileProtectedRoute>
                }
                path="/sent"
              />
              <Route
                element={
                  <MobileProtectedRoute>
                    <MobileInbox
                      key="drafts"
                      mailbox="drafts"
                      on_compose={handle_compose_open}
                      on_draft_click={handle_draft_click}
                      on_open_drawer={handle_open_drawer}
                      on_selection_mode_change={handle_selection_mode_change}
                    />
                  </MobileProtectedRoute>
                }
                path="/drafts"
              />
              <Route
                element={
                  <MobileProtectedRoute>
                    <MobileInbox
                      key="scheduled"
                      mailbox="scheduled"
                      on_compose={handle_compose_open}
                      on_open_drawer={handle_open_drawer}
                      on_selection_mode_change={handle_selection_mode_change}
                    />
                  </MobileProtectedRoute>
                }
                path="/scheduled"
              />
              <Route
                element={
                  <MobileProtectedRoute>
                    <MobileInbox
                      key="snoozed"
                      mailbox="snoozed"
                      on_compose={handle_compose_open}
                      on_open_drawer={handle_open_drawer}
                      on_selection_mode_change={handle_selection_mode_change}
                    />
                  </MobileProtectedRoute>
                }
                path="/snoozed"
              />
              <Route
                element={
                  <MobileProtectedRoute>
                    <MobileInbox
                      key="archive"
                      mailbox="archive"
                      on_compose={handle_compose_open}
                      on_open_drawer={handle_open_drawer}
                      on_selection_mode_change={handle_selection_mode_change}
                    />
                  </MobileProtectedRoute>
                }
                path="/archive"
              />
              <Route
                element={
                  <MobileProtectedRoute>
                    <MobileInbox
                      key="spam"
                      mailbox="spam"
                      on_compose={handle_compose_open}
                      on_open_drawer={handle_open_drawer}
                      on_selection_mode_change={handle_selection_mode_change}
                    />
                  </MobileProtectedRoute>
                }
                path="/spam"
              />
              <Route
                element={
                  <MobileProtectedRoute>
                    <MobileInbox
                      key="trash"
                      mailbox="trash"
                      on_compose={handle_compose_open}
                      on_open_drawer={handle_open_drawer}
                      on_selection_mode_change={handle_selection_mode_change}
                    />
                  </MobileProtectedRoute>
                }
                path="/trash"
              />
              <Route
                element={
                  <MobileProtectedRoute>
                    <MobileInbox
                      on_compose={handle_compose_open}
                      on_open_drawer={handle_open_drawer}
                      on_selection_mode_change={handle_selection_mode_change}
                    />
                  </MobileProtectedRoute>
                }
                path="/folder/:folder_token"
              />
              <Route
                element={
                  <MobileProtectedRoute>
                    <MobileInbox
                      on_compose={handle_compose_open}
                      on_open_drawer={handle_open_drawer}
                      on_selection_mode_change={handle_selection_mode_change}
                    />
                  </MobileProtectedRoute>
                }
                path="/tag/:tag_token"
              />
              <Route
                element={
                  <MobileProtectedRoute>
                    <MobileInbox
                      on_compose={handle_compose_open}
                      on_open_drawer={handle_open_drawer}
                      on_selection_mode_change={handle_selection_mode_change}
                    />
                  </MobileProtectedRoute>
                }
                path="/alias/:alias_address"
              />
              <Route
                element={
                  <MobileProtectedRoute>
                    <MobileMailDetail />
                  </MobileProtectedRoute>
                }
                path="/email/:email_id"
              />
              <Route
                element={
                  <MobileProtectedRoute>
                    <MobileSearchPage />
                  </MobileProtectedRoute>
                }
                path="/search"
              />
              <Route
                element={
                  <MobileProtectedRoute>
                    <MobileContactsPage
                      on_compose={handle_compose_open}
                      on_open_drawer={handle_open_drawer}
                    />
                  </MobileProtectedRoute>
                }
                path="/contacts"
              />
              <Route
                element={
                  <MobileProtectedRoute>
                    <MobileSubscriptionsPage
                      on_open_drawer={handle_open_drawer}
                    />
                  </MobileProtectedRoute>
                }
                path="/subscriptions"
              />
              <Route
                element={
                  <MobileProtectedRoute>
                    <MobileSettingsPage />
                  </MobileProtectedRoute>
                }
                path="/settings"
              />
              <Route element={<MobileWelcomePage />} path="/welcome" />
              <Route element={<SignInPage />} path="/sign-in" />
              <Route element={<RegisterPage />} path="/register" />
              <Route element={<RegisterPage />} path="/signup" />
              <Route element={<ForgotPasswordPage />} path="/forgot-password" />
              <Route element={<BrowserLoginPage />} path="/browser-login" />
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
              <Route element={<NotFoundPage />} path="*" />
            </Routes>
          </Suspense>
        </ErrorBoundary>

        {show_fab && <MobileFab on_press={handle_compose_open} />}

        {!is_auth_route && (
          <MobileDrawer
            active_path={location.pathname}
            is_open={is_drawer_open}
            on_close={handle_close_drawer}
            on_navigate={handle_navigate}
          />
        )}

        <AnimatePresence>
          {is_compose_open && (
            <Suspense fallback={null}>
              <MobileComposePage
                edit_draft={edit_draft_ref.current}
                on_close={handle_compose_close}
              />
            </Suspense>
          )}
        </AnimatePresence>
        <SimpleToast position="top" />
        <ActionToast position="top" />
        <UndoSendContainer is_mobile max_visible={1} position="bottom-center" />
        <UndoSendPreviewModal />
      </div>
    </AppLock>
  );
}

export default MobileApp;
