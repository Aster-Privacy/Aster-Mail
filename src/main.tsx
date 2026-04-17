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
import { BrowserRouter } from "react-router-dom";
import { Capacitor } from "@capacitor/core";

import App from "@/App";
import { Provider } from "@/provider";
import { initialize_capacitor, hide_splash } from "@/native/capacitor_bridge";
import { start_version_check } from "@/lib/version_check";
import "@/styles/fonts.css";
import "@/styles/globals.css";
import "@/styles/mobile.css";

const MobileApp = lazy(() => import("@/mobile_app"));

function is_mobile_experience(): boolean {
  if (Capacitor.isNativePlatform()) return true;

  const ua = navigator.userAgent.toLowerCase();
  const is_mobile_ua = /android|iphone|ipad|ipod|mobile/i.test(ua);
  const is_narrow = window.innerWidth < 768;

  const params = new URLSearchParams(window.location.search);

  if (params.get("mobile") === "true") return true;
  if (params.get("mobile") === "false") return false;

  return is_mobile_ua && is_narrow;
}

initialize_capacitor().catch((e) => {
  if (import.meta.env.DEV) console.error(e);
});

start_version_check();

const is_tauri_runtime =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

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
  const reason = event.reason;
  const message =
    typeof reason === "string"
      ? reason
      : reason && typeof reason === "object" && "message" in reason
        ? String((reason as { message: unknown }).message)
        : "";

  if (
    message.includes("Importing a module script failed") ||
    message.includes("Failed to fetch dynamically imported module") ||
    message.includes("error loading dynamically imported module")
  ) {
    event.preventDefault();

    return;
  }

  event.preventDefault();
});

if ("serviceWorker" in navigator && import.meta.env.PROD && !is_tauri_runtime) {
  const legacy_sw_reset = (async (): Promise<boolean> => {
    try {
      let already_reset = false;

      try {
        already_reset = localStorage.getItem("aster_sw_reset_v1") === "1";
      } catch {}

      if (already_reset) return true;

      const regs = await navigator.serviceWorker.getRegistrations();
      const cache_keys =
        typeof caches !== "undefined" ? await caches.keys() : [];
      const has_legacy_state = regs.length > 0 || cache_keys.length > 0;

      try {
        localStorage.setItem("aster_sw_reset_v1", "1");
      } catch {}

      if (!has_legacy_state) return true;

      await Promise.all(regs.map((r) => r.unregister().catch(() => false)));
      await Promise.all(
        cache_keys.map((k) => caches.delete(k).catch(() => false)),
      );

      let already_reloaded = false;

      try {
        already_reloaded =
          sessionStorage.getItem("aster_sw_reset_reloaded") === "1";
      } catch {}

      if (already_reloaded) return true;

      try {
        sessionStorage.setItem("aster_sw_reset_reloaded", "1");
      } catch {}

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
          registration.update().catch(() => {});
        },
        60 * 60 * 1000,
      );
    } catch {}
  });
}

const use_mobile = is_mobile_experience();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <Provider>
      {use_mobile ? (
        <Suspense
          fallback={
            <div className="h-screen w-screen bg-[var(--bg-primary)]" />
          }
        >
          <MobileApp />
        </Suspense>
      ) : (
        <App />
      )}
    </Provider>
  </BrowserRouter>,
);

function dismiss_initial_loader() {
  hide_splash().catch(() => {});
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

setTimeout(dismiss_once, 5000);
