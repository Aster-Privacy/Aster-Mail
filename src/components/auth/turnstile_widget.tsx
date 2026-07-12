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
import {
  useRef,
  useState,
  useEffect,
  useCallback,
  useImperativeHandle,
  forwardRef,
} from "react";

import { useTheme } from "@/contexts/theme_context";
import { use_i18n } from "@/lib/i18n/context";
import { is_onion_host } from "@/lib/onion_host";
import { is_tauri } from "@/native/desktop_device_auth";

// Onion and Tauri desktop users are exempt. The Cloudflare challenge iframe
// cannot load inside Tauri's WebView2 (tauri.localhost origin is blocked).
// The backend already exempts tauri-desktop from the captcha requirement
// server-side via the client_platform header. Prod web is unchanged.
export const TURNSTILE_SITE_KEY =
  typeof window !== "undefined" && (is_onion_host() || is_tauri())
    ? ""
    : (import.meta.env.VITE_TURNSTILE_SITE_KEY || "");
const SCRIPT_URL =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

const LOAD_TIMEOUT_MS = 15000;

interface TurnstileWidgetProps {
  on_verify: (token: string) => void;
  on_expire?: () => void;
  on_unavailable?: () => void;
  class_name?: string;
}

export interface TurnstileWidgetRef {
  reset: () => void;
}

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: Record<string, unknown>,
      ) => string;
      reset: (widget_id: string) => void;
      remove: (widget_id: string) => void;
    };
  }
}

let script_loaded = false;
let script_loading = false;
const load_callbacks: ((ok: boolean) => void)[] = [];

function load_turnstile_script(): Promise<boolean> {
  if (script_loaded && window.turnstile) return Promise.resolve(true);

  return new Promise((resolve) => {
    if (script_loading) {
      load_callbacks.push(resolve);

      return;
    }

    script_loading = true;
    load_callbacks.push(resolve);

    const script = document.createElement("script");

    script.src = SCRIPT_URL;
    script.async = true;
    script.onload = () => {
      script_loaded = true;
      script_loading = false;
      load_callbacks.forEach((cb) => cb(true));
      load_callbacks.length = 0;
    };
    script.onerror = () => {
      script_loading = false;
      load_callbacks.forEach((cb) => cb(false));
      load_callbacks.length = 0;
    };
    document.head.appendChild(script);
  });
}

export const TurnstileWidget = forwardRef<
  TurnstileWidgetRef,
  TurnstileWidgetProps
>(({ on_verify, on_expire, on_unavailable, class_name }, ref) => {
  const container_ref = useRef<HTMLDivElement>(null);
  const widget_id_ref = useRef<string | null>(null);
  const on_verify_ref = useRef(on_verify);
  const on_expire_ref = useRef(on_expire);
  const on_unavailable_ref = useRef(on_unavailable);
  const { theme } = useTheme();
  const { t } = use_i18n();
  const [load_failed, set_load_failed] = useState(false);
  const [reload_nonce, set_reload_nonce] = useState(0);

  on_verify_ref.current = on_verify;
  on_expire_ref.current = on_expire;
  on_unavailable_ref.current = on_unavailable;

  const reset = useCallback(() => {
    if (widget_id_ref.current && window.turnstile) {
      window.turnstile.reset(widget_id_ref.current);
    }
  }, []);

  useImperativeHandle(ref, () => ({ reset }), [reset]);

  const mark_unavailable = useCallback(() => {
    set_load_failed(true);
    on_unavailable_ref.current?.();
  }, []);

  const handle_retry = useCallback(() => {
    set_load_failed(false);
    set_reload_nonce((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY || !container_ref.current) return;

    let mounted = true;
    const timeout_id = window.setTimeout(() => {
      if (mounted && !widget_id_ref.current) {
        mark_unavailable();
      }
    }, LOAD_TIMEOUT_MS);

    load_turnstile_script().then((ok) => {
      if (!mounted || !container_ref.current || !window.turnstile) {
        if (mounted && !ok) mark_unavailable();

        return;
      }

      if (!ok) {
        mark_unavailable();

        return;
      }

      if (widget_id_ref.current) {
        window.turnstile.remove(widget_id_ref.current);
        widget_id_ref.current = null;
      }

      container_ref.current.innerHTML = "";

      try {
        widget_id_ref.current = window.turnstile.render(container_ref.current, {
          sitekey: TURNSTILE_SITE_KEY,
          theme,
          callback: (token: string) => on_verify_ref.current(token),
          "expired-callback": () => on_expire_ref.current?.(),
          "error-callback": () => mark_unavailable(),
        });
      } catch {
        mark_unavailable();
      }
    });

    return () => {
      mounted = false;
      window.clearTimeout(timeout_id);
      if (widget_id_ref.current && window.turnstile) {
        window.turnstile.remove(widget_id_ref.current);
        widget_id_ref.current = null;
      }
    };
  }, [theme, reload_nonce, mark_unavailable]);

  if (!TURNSTILE_SITE_KEY) return null;

  if (load_failed) {
    return (
      <div className={class_name || "flex flex-col items-center gap-2 mt-4"}>
        <p className="text-xs text-center text-txt-muted">
          {t("auth.captcha_load_failed")}
        </p>
        <button
          className="text-sm font-medium transition-colors hover:opacity-80 text-txt-secondary"
          type="button"
          onClick={handle_retry}
        >
          {t("common.retry")}
        </button>
      </div>
    );
  }

  return (
    <div className={class_name || "flex justify-center mt-4"}>
      <div style={{ overflow: "hidden" }}>
        <div
          ref={container_ref}
          style={{ colorScheme: theme, margin: -3, lineHeight: 0 }}
        />
      </div>
    </div>
  );
});

TurnstileWidget.displayName = "TurnstileWidget";
