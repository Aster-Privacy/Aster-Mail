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
import { useEffect, useState } from "react";
import { Button } from "@aster/ui";

import { use_i18n } from "@/lib/i18n/context";

async function clear_cache_and_reload(): Promise<void> {
  try {
    if (window.caches) {
      const keys = await caches.keys();

      await Promise.all(keys.map((key) => caches.delete(key)));
    }

    if (navigator.serviceWorker) {
      const registrations = await navigator.serviceWorker.getRegistrations();

      await Promise.all(registrations.map((reg) => reg.unregister()));
    }
  } catch {
    /* ignore */
  }

  window.location.reload();
}

let active_count = 0;

function dismiss_loader() {
  const el = document.getElementById("initial-loader");

  if (!el) return;

  el.style.transition = "opacity 0.15s ease-out";
  el.style.opacity = "0";
  setTimeout(() => el.remove(), 150);
}

export function FullPageLoader() {
  const { t } = use_i18n();
  const loading_label = t("common.loading").replace(/(\.{3}|…)\s*$/, "");
  const [static_present, set_static_present] = useState(
    () => !!document.getElementById("initial-loader"),
  );
  const [stuck, set_stuck] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => set_stuck(true), 10000);

    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    active_count++;

    return () => {
      active_count--;
      requestAnimationFrame(() => {
        if (active_count === 0) {
          dismiss_loader();
        }
      });
    };
  }, []);

  useEffect(() => {
    if (!static_present) return;

    if (!document.getElementById("initial-loader")) {
      set_static_present(false);

      return;
    }

    const interval = window.setInterval(() => {
      if (!document.getElementById("initial-loader")) {
        set_static_present(false);
        window.clearInterval(interval);
      }
    }, 250);

    return () => window.clearInterval(interval);
  }, [static_present]);

  if (static_present) return null;

  return (
    <div className="full-page-loader bg-surf-secondary">
      <div className="full-page-loader-content">
        <img
          alt="Aster"
          className="h-7"
          draggable={false}
          src="/text_logo.png"
        />
        <div className="loader-stack">
          <div className="loader-spinner" />
          <div className="loader-text">
            {loading_label}
            <span className="loader-dots">
              <span>.</span>
              <span>.</span>
              <span>.</span>
            </span>
          </div>
          {stuck && (
            <div className="flex flex-col items-center gap-2 mt-1">
              <span className="text-xs text-txt-tertiary">
                {t("common.loading_stuck")}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  onClick={() => window.location.reload()}
                  size="sm"
                  variant="outline"
                >
                  {t("common.reload_page")}
                </Button>
                <Button
                  onClick={clear_cache_and_reload}
                  size="sm"
                  variant="outline"
                >
                  {t("settings.clear_cache_reload")}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
