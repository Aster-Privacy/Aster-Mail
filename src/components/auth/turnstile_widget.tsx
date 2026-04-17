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
  forwardRef,
} from "react";

import { useTheme } from "@/contexts/theme_context";

export const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY || "";
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

let script_loaded = false;
let script_loading = false;
const load_callbacks: (() => void)[] = [];

function load_turnstile_script(): Promise<void> {
  if (script_loaded && window.turnstile) return Promise.resolve();

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
      load_callbacks.forEach((cb) => cb());
      load_callbacks.length = 0;
    };
    script.onerror = () => {
      script_loading = false;
      load_callbacks.forEach((cb) => cb());
      load_callbacks.length = 0;
    };
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
  const { theme } = useTheme();

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

    load_turnstile_script().then(() => {
      if (!mounted || !container_ref.current || !window.turnstile) return;

      if (widget_id_ref.current) {
        window.turnstile.remove(widget_id_ref.current);
        widget_id_ref.current = null;
      }

      container_ref.current.innerHTML = "";

      widget_id_ref.current = window.turnstile.render(container_ref.current, {
        sitekey: TURNSTILE_SITE_KEY,
        theme,
        callback: (token: string) => on_verify_ref.current(token),
        "expired-callback": () => on_expire_ref.current?.(),
      });
    });

    return () => {
      mounted = false;
      if (widget_id_ref.current && window.turnstile) {
        window.turnstile.remove(widget_id_ref.current);
        widget_id_ref.current = null;
      }
    };
  }, [theme]);

  if (!TURNSTILE_SITE_KEY) return null;

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
