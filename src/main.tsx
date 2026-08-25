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
import ReactDOM from "react-dom/client";
import { BrowserRouter, HashRouter } from "react-router-dom";

import App from "@/App";
import { evict_stale_favicons } from "@/lib/favicon_cache_db";
import UnsupportedBrowserPage from "@/pages/unsupported_browser";
import { Provider } from "@/provider";
import { FullPageLoader } from "@/components/common/full_page_loader";
import {
  initialize_capacitor,
  hide_splash,
  is_native_platform,
} from "@/native/capacitor_bridge";
import { initialize_offline_queue } from "@/native/offline_queue";
import { recover_fallback_sends } from "@/services/send_queue";
import {
  start_version_check,
  version_check_blocking,
} from "@/lib/version_check";
import {
  error_message_of,
  is_chunk_load_error,
  trigger_chunk_recovery,
} from "@/lib/chunk_recovery";
import { show_self_xss_warning } from "@/lib/security/console_warning";
import { start_input_modality_tracking } from "@/lib/input_modality";
import { connection_store } from "@/services/routing/connection_store";
import { apply_desktop_content_protection } from "@/native/desktop_content_protection";
import { start_desktop_link_bridge } from "@/native/desktop_link_bridge";
import { is_any_lockdown_active } from "@/services/lockdown_store";
import { use_mobile_experience } from "@/hooks/use_mobile_experience";
import {
  app_pathname,
  resolve_account_basename,
} from "@/lib/account_index_url";
import "@/styles/fonts.css";
import "@/styles/globals.css";
import "@/styles/mobile.css";

import { ignore_error } from "@/lib/ignore_error";

const MobileApp = lazy(() => import("@/mobile_app"));

start_input_modality_tracking();

initialize_capacitor().catch((e) => {
  if (import.meta.env.DEV) console.error(e);
});

if (!is_native_platform()) {
  recover_fallback_sends().catch((caught) => ignore_error("main", caught));
  initialize_offline_queue().catch((caught) => ignore_error("main", caught));
}

const cached_prefs_raw = localStorage.getItem("aster_preferences_cache");
let low_network_on_startup = false;
try {
  if (cached_prefs_raw) {
    const cached_prefs = JSON.parse(cached_prefs_raw);
    low_network_on_startup = cached_prefs.low_network_mode === true;
  }
} catch (caught) {
  ignore_error("main", caught);
}
if (!low_network_on_startup) {
  start_version_check();
}
if (low_network_on_startup) {
  const style = document.createElement("style");
  style.id = "aster-low-network-fonts";
  style.textContent =
    "*, *::before, *::after { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif !important; }";
  document.head.appendChild(style);
}
show_self_xss_warning();

connection_store.initialize().catch((caught) => ignore_error("main", caught));

const is_tauri_runtime =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

if (is_tauri_runtime) {
  void import("@tauri-apps/api/core")
    .then(({ invoke }) => {
      void invoke("frontend_ready");
      const cached = Number(
        localStorage.getItem("aster_last_unread_badge") || "0",
      );

      if (Number.isFinite(cached) && cached > 0) {
        void invoke("set_unread_badge", { count: Math.floor(cached) }).catch(
          (caught) => ignore_error("main", caught),
        );
      }
    })
    .catch((caught) => ignore_error("main", caught));
  void apply_desktop_content_protection(is_any_lockdown_active());
  void start_desktop_link_bridge();
}

if (is_tauri_runtime && "serviceWorker" in navigator) {
  (async () => {
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      let did_clear = false;

      if (regs.length > 0) {
        await Promise.all(regs.map((r) => r.unregister()));
        did_clear = true;
      }
      if (typeof caches !== "undefined") {
        const keys = await caches.keys();

        if (keys.length > 0) {
          await Promise.all(keys.map((k) => caches.delete(k)));
          did_clear = true;
        }
      }
      if (did_clear && !sessionStorage.getItem("aster:sw-flushed")) {
        sessionStorage.setItem("aster:sw-flushed", "1");
        window.location.reload();
      }
    } catch {
      // ignore
    }
  })();
}

window.addEventListener("unhandledrejection", (event) => {
  const message = error_message_of(event.reason);

  if (is_chunk_load_error(message)) {
    event.preventDefault();
    trigger_chunk_recovery();

    return;
  }

  event.preventDefault();
});

window.addEventListener(
  "error",
  (event) => {
    const target = event.target as
      | (HTMLElement & { src?: string; href?: string })
      | null;

    if (
      target &&
      (target.tagName === "SCRIPT" ||
        target.tagName === "LINK" ||
        target.tagName === "IMG")
    ) {
      const url = target.src || target.href || "";

      if (
        (target.tagName === "SCRIPT" || target.tagName === "LINK") &&
        url.includes("/assets/")
      ) {
        trigger_chunk_recovery();
      }

      return;
    }

    const message = event.message || "";

    if (is_chunk_load_error(message)) {
      trigger_chunk_recovery();
    }
  },
  true,
);

if ("serviceWorker" in navigator && import.meta.env.PROD && !is_tauri_runtime) {
  const legacy_sw_reset = (async (): Promise<boolean> => {
    try {
      let already_reset = false;

      try {
        already_reset = localStorage.getItem("aster_sw_reset_v1") === "1";
      } catch (caught) {
        ignore_error("main:legacy_sw_reset", caught);
      }

      if (already_reset) return true;

      const regs = await navigator.serviceWorker.getRegistrations();
      const cache_keys =
        typeof caches !== "undefined" ? await caches.keys() : [];
      const has_legacy_state = regs.length > 0 || cache_keys.length > 0;

      try {
        localStorage.setItem("aster_sw_reset_v1", "1");
      } catch (caught) {
        ignore_error("main:legacy_sw_reset", caught);
      }

      if (!has_legacy_state) return true;

      await Promise.all(regs.map((r) => r.unregister().catch(() => false)));
      await Promise.all(
        cache_keys.map((k) => caches.delete(k).catch(() => false)),
      );

      let already_reloaded = false;

      try {
        already_reloaded =
          sessionStorage.getItem("aster_sw_reset_reloaded") === "1";
      } catch (caught) {
        ignore_error("main:legacy_sw_reset", caught);
      }

      if (already_reloaded) return true;

      try {
        sessionStorage.setItem("aster_sw_reset_reloaded", "1");
      } catch (caught) {
        ignore_error("main:legacy_sw_reset", caught);
      }

      window.location.reload();

      return false;
    } catch {
      return true;
    }
  })();

  window.addEventListener("load", async () => {
    const should_register = await legacy_sw_reset;

    if (!should_register) return;

    try {
      const registration = await navigator.serviceWorker.register("/sw.js", {
        updateViaCache: "none",
      });

      const activate_waiting = (sw: ServiceWorker) => {
        sw.postMessage({ type: "SKIP_WAITING" });
      };

      if (registration.waiting) {
        activate_waiting(registration.waiting);
      }

      registration.addEventListener("updatefound", () => {
        const new_worker = registration.installing;

        if (!new_worker) return;

        new_worker.addEventListener("statechange", () => {
          if (
            new_worker.state === "installed" &&
            navigator.serviceWorker.controller
          ) {
            activate_waiting(new_worker);
          }
        });
      });

      setInterval(
        () => {
          registration
            .update()
            .catch((caught) => ignore_error("main:activate_waiting", caught));
        },
        60 * 60 * 1000,
      );
    } catch (caught) {
      ignore_error("main:legacy_sw_reset", caught);
    }
  });
}

const browser_supported = typeof window.crypto?.subtle === "object";

const Router = is_tauri_runtime ? HashRouter : BrowserRouter;
const router_basename = resolve_account_basename();

function RootShell(): JSX.Element {
  const use_mobile = use_mobile_experience();

  if (!browser_supported) return <UnsupportedBrowserPage />;

  if (use_mobile) {
    return (
      <Suspense fallback={<FullPageLoader />}>
        <MobileApp />
      </Suspense>
    );
  }

  return <App />;
}

const BOOT_VERSION_CHECK_MARKER = "aster:boot_version_checked_at";
const BOOT_VERSION_CHECK_TTL_MS = 60_000;

async function run_boot_version_check(): Promise<void> {
  if (!import.meta.env.PROD) return;
  if (is_tauri_runtime) return;
  try {
    const last = Number(
      sessionStorage.getItem(BOOT_VERSION_CHECK_MARKER) || "0",
    );

    if (last && Date.now() - last < BOOT_VERSION_CHECK_TTL_MS) return;
  } catch (caught) {
    ignore_error("main:run_boot_version_check", caught);
  }
  try {
    sessionStorage.setItem(BOOT_VERSION_CHECK_MARKER, String(Date.now()));
  } catch (caught) {
    ignore_error("main:run_boot_version_check", caught);
  }

  try {
    await version_check_blocking(1500);
  } catch (caught) {
    ignore_error("main:run_boot_version_check", caught);
  }
}

function mount_app(): void {
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <Router basename={router_basename}>
      <Provider>
        <RootShell />
      </Provider>
    </Router>,
  );
}

mount_app();
void run_boot_version_check();

setTimeout(() => {
  evict_stale_favicons().catch((caught) =>
    ignore_error("main:mount_app", caught),
  );
}, 3000);

function dismiss_initial_loader() {
  hide_splash().catch((caught) =>
    ignore_error("main:dismiss_initial_loader", caught),
  );
  const loader = document.getElementById("initial-loader");

  if (!loader) return;
  const fill = document.getElementById("initial-loader-fill");

  if (fill) {
    fill.style.animation = "none";
    fill.style.transition = "width 0.15s ease-out";
    fill.style.width = "100%";
  }
  setTimeout(() => {
    loader.style.transition = "opacity 0.15s ease-out";
    loader.style.opacity = "0";
    setTimeout(() => loader.remove(), 150);
  }, 100);
}

let loader_dismissed = false;
const dismiss_once = () => {
  if (loader_dismissed) return;
  loader_dismissed = true;
  dismiss_initial_loader();
};

window.addEventListener("astermail:app-ready", dismiss_once, { once: true });

window.addEventListener("astermail:auth-loaded", () => {
  const path = app_pathname();
  if (path.startsWith("/sign-in") || path.startsWith("/register")) {
    dismiss_once();
  }
});

setTimeout(dismiss_once, 5000);
