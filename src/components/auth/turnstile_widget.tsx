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
  useEffect,
  useCallback,
  useImperativeHandle,
  useState,
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
    : import.meta.env.VITE_TURNSTILE_SITE_KEY || "";
const SCRIPT_URL =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

interface TurnstileWidgetProps {
  on_verify: (token: string) => void;
  on_expire?: () => void;
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

const TURNSTILE_LANGUAGE_BY_APP_LOCALE: Record<string, string> = {
  en: "en",
  es: "es",
  fr: "fr",
  de: "de",
  it: "it",
  pt: "pt-br",
  "zh-CN": "zh-cn",
  ja: "ja",
  ko: "ko",
  ar: "ar-eg",
  ru: "ru",
  nl: "nl",
  pl: "pl",
  tr: "tr",
};

function turnstile_language(language: string): string {
  return (
    TURNSTILE_LANGUAGE_BY_APP_LOCALE[language] ??
    TURNSTILE_LANGUAGE_BY_APP_LOCALE[language.split("-")[0]] ??
    "auto"
  );
}

let script_loaded = false;
let script_loading = false;
let script_element: HTMLScriptElement | null = null;
const load_callbacks: ((ok: boolean) => void)[] = [];

function settle_load(ok: boolean) {
  script_loading = false;
  load_callbacks.forEach((cb) => cb(ok));
  load_callbacks.length = 0;
}

function load_turnstile_script(): Promise<boolean> {
  if (script_loaded && window.turnstile) return Promise.resolve(true);

  return new Promise((resolve) => {
    if (script_loading) {
      load_callbacks.push(resolve);

      return;
    }

    script_loading = true;
    load_callbacks.push(resolve);

    if (script_element) {
      script_element.remove();
      script_element = null;
    }

    const script = document.createElement("script");

    script.src = SCRIPT_URL;
    script.async = true;
    script.onload = () => {
      script_loaded = true;
      settle_load(!!window.turnstile);
    };
    script.onerror = () => {
      script_loaded = false;
      settle_load(false);
    };
    script_element = script;
    document.head.appendChild(script);
  });
}

export const TurnstileWidget = forwardRef<
  TurnstileWidgetRef,
  TurnstileWidgetProps
>(({ on_verify, on_expire, class_name }, ref) => {
  const container_ref = useRef<HTMLDivElement>(null);
  const widget_id_ref = useRef<string | null>(null);
  const on_verify_ref = useRef(on_verify);
  const on_expire_ref = useRef(on_expire);
  const [attempt, set_attempt] = useState(0);
  const [failed, set_failed] = useState(false);
  const { theme } = useTheme();
  const { t, language } = use_i18n();

  on_verify_ref.current = on_verify;
  on_expire_ref.current = on_expire;

  const reset = useCallback(() => {
    if (widget_id_ref.current && window.turnstile) {
      window.turnstile.reset(widget_id_ref.current);
    }
  }, []);

  useImperativeHandle(ref, () => ({ reset }), [reset]);

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY || !container_ref.current) return;

    let mounted = true;
    const timeout = window.setTimeout(() => {
      if (mounted && !widget_id_ref.current) set_failed(true);
    }, 12000);

    load_turnstile_script().then((ok) => {
      if (!mounted) return;

      if (!ok || !container_ref.current || !window.turnstile) {
        set_failed(true);

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
          language: turnstile_language(language),
          callback: (token: string) => on_verify_ref.current(token),
          "expired-callback": () => on_expire_ref.current?.(),
          "error-callback": () => set_failed(true),
        });
        set_failed(false);
      } catch {
        set_failed(true);
      }
    });

    return () => {
      mounted = false;
      window.clearTimeout(timeout);
      if (widget_id_ref.current && window.turnstile) {
        window.turnstile.remove(widget_id_ref.current);
        widget_id_ref.current = null;
      }
    };
  }, [theme, attempt, language]);

  if (!TURNSTILE_SITE_KEY) return null;

  return (
    <div className={class_name || "flex justify-center mt-4"}>
      {failed ? (
        <div className="flex flex-col items-center gap-2 text-center">
          <p className="text-xs text-txt-muted max-w-[18rem] leading-relaxed">
            {t("auth.captcha_load_failed")}
          </p>
          <button
            className="aster_btn aster_btn_secondary aster_btn_sm"
            type="button"
            onClick={() => {
              set_failed(false);
              set_attempt((n) => n + 1);
            }}
          >
            {t("common.try_again")}
          </button>
        </div>
      ) : (
        <div style={{ overflow: "hidden" }}>
          <div
            ref={container_ref}
            style={{ colorScheme: theme, margin: -3, lineHeight: 0 }}
          />
        </div>
      )}
    </div>
  );
});

TurnstileWidget.displayName = "TurnstileWidget";
