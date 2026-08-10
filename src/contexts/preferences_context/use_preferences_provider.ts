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
import type { } from "@/lib/i18n/types";

import {
  useEffect,
  useCallback,
} from "react";

import {
  get_preferences,
  sync_quiet_hours_to_server,
  cache_sidebar_state,
  cache_preferences_locally,
  get_cached_preferences,
  DEFAULT_PREFERENCES,
} from "@/services/api/preferences";
import { get_csrf_token_from_cookie } from "@/services/api/csrf";
import { get_effective_base_url } from "@/services/routing/routing_provider";
import { connection_store } from "@/services/routing/connection_store";
import { sync_haptic_state } from "@/native/haptic_feedback";
import { set_toast_min_duration } from "@/components/toast/simple_toast";
import { set_display_time_zone } from "@/utils/date_format";
import {
  load_notification_preferences,
  request_notification_permission,
} from "@/services/notification_service";
import { set_low_network_mode } from "@/services/low_network_state";
import { stop_version_check } from "@/lib/version_check";
import { get_font_stack } from "@/lib/font_options";
import {
  get_primary_font_family,
  is_font_family_loaded,
} from "@/lib/loaded_fonts";
import { get_effective_theme_fields } from "@/lib/theme_sync";
import { CROSS_DEVICE_REFRESH_MIN_INTERVAL_MS, CROSS_DEVICE_REFRESH_POLL_MS, FONT_SIZE_DEFAULT, apply_color_theme_class, apply_pending_preferences, normalize_font_size_scale, normalize_preferences, reconcile_low_network_mode } from "./helpers";
import { use_preferences_core } from "./use_preferences_core";

export function use_preferences_provider() {
  const {
    vault,
    is_completing_registration,
    theme,
    preferences,
    set_preferences,
    is_loading,
    set_is_loading,
    has_loaded_from_server,
    set_has_loaded_from_server,
    save_status,
    vault_ref,
    set_theme_ref,
    preferences_ref,
    pending_keys_ref,
    has_loaded_ref,
    fallback_base_ref,
    server_base_ref,
    debounce_timer,
    saved_indicator_timer,
    latest_prefs_ref,
    is_saving_ref,
    beacon_payload_ref,
    do_save,
    schedule_save,
    update_preference,
    update_preferences,
    reset_to_defaults,
    reset_section,
    apply_visual_preferences,
  } = use_preferences_core();

  const reload_preferences = useCallback(async (background = false) => {
    const v = vault_ref.current;

    if (!v) return;

    let response = await get_preferences(v);
    let attempt = 0;

    if (background && !response.loaded_from_server) return;

    while (!response.loaded_from_server && attempt < 6) {
      attempt += 1;
      const delay_ms = Math.min(500 * 2 ** (attempt - 1), 8000);

      await new Promise((resolve) => setTimeout(resolve, delay_ms));
      response = await get_preferences(v);
    }

    if (response.loaded_from_server && response.data) {
      fallback_base_ref.current = null;
      let merged = normalize_preferences({
        ...DEFAULT_PREFERENCES,
        ...response.data,
      });

      const reconciled = reconcile_low_network_mode(merged);

      if (reconciled !== merged) {
        merged = reconciled;
        cache_preferences_locally(merged);
        do_save(merged).catch(() => {});
      }

      const url_low_bandwidth = new URLSearchParams(window.location.search).get(
        "low_bandwidth",
      );
      const is_same_origin_nav =
        !document.referrer ||
        new URL(document.referrer).origin === window.location.origin;
      if (url_low_bandwidth !== null && is_same_origin_nav) {
        const want_enabled =
          url_low_bandwidth === "1" || url_low_bandwidth === "true";
        const want_disabled =
          url_low_bandwidth === "0" || url_low_bandwidth === "false";
        if (want_enabled || want_disabled) {
          merged = {
            ...merged,
            low_network_mode: want_enabled,
            low_network_mode_user_set: true,
          };
          cache_preferences_locally(merged);
          do_save(merged).catch(() => {});
        }
      }

      has_loaded_ref.current = true;
      server_base_ref.current = merged;

      const applied = apply_pending_preferences(
        merged,
        preferences_ref.current,
        pending_keys_ref.current,
      );

      cache_preferences_locally(applied);
      preferences_ref.current = applied;
      set_preferences(applied);
      set_low_network_mode(applied.low_network_mode);
      apply_visual_preferences(applied);
    } else {
      const cached = get_cached_preferences();

      if (cached) {
        const applied = apply_pending_preferences(
          cached,
          preferences_ref.current,
          pending_keys_ref.current,
        );

        preferences_ref.current = applied;
        set_preferences(applied);
        set_low_network_mode(applied.low_network_mode);
        apply_visual_preferences(applied);
        has_loaded_ref.current = true;
        fallback_base_ref.current = applied;
      }
    }

    set_has_loaded_from_server(response.loaded_from_server);
  }, [apply_visual_preferences]);

  const save_now = useCallback(async () => {
    if (!vault_ref.current) return;

    if (debounce_timer.current) {
      clearTimeout(debounce_timer.current);
      debounce_timer.current = null;
    }

    if (latest_prefs_ref.current) {
      await do_save(latest_prefs_ref.current);
      latest_prefs_ref.current = null;
    }
  }, [do_save]);

  const vault_identity = vault?.identity_key ?? null;

  useEffect(() => {
    if (!vault_identity || is_completing_registration) {
      set_has_loaded_from_server(false);
      set_is_loading(false);

      return;
    }

    const v = vault_ref.current;

    if (!v) {
      set_is_loading(false);

      return;
    }

    let cancelled = false;

    if (debounce_timer.current) {
      clearTimeout(debounce_timer.current);
      debounce_timer.current = null;
    }
    latest_prefs_ref.current = null;
    pending_keys_ref.current.clear();
    has_loaded_ref.current = false;
    fallback_base_ref.current = null;
    server_base_ref.current = null;

    (async () => {
      try {
        let response = await get_preferences(v);
        let attempt = 0;

        while (!response.loaded_from_server && attempt < 6) {
          if (cancelled) return;
          attempt += 1;
          const delay_ms = Math.min(500 * 2 ** (attempt - 1), 8000);

          await new Promise((resolve) => setTimeout(resolve, delay_ms));
          response = await get_preferences(v);
        }

        if (cancelled) return;

        if (!response.loaded_from_server) {
          const cached = get_cached_preferences();

          if (cached) {
            const applied = apply_pending_preferences(
              cached,
              preferences_ref.current,
              pending_keys_ref.current,
            );

            response = { data: applied, loaded_from_server: false };
            preferences_ref.current = applied;
            set_preferences(applied);
            apply_visual_preferences(applied);
            has_loaded_ref.current = true;
            fallback_base_ref.current = applied;
          }
        }

        if (response.loaded_from_server && response.data) {
          has_loaded_ref.current = true;
          fallback_base_ref.current = null;

          const normalized = normalize_preferences({
            ...DEFAULT_PREFERENCES,
            ...response.data,
          });
          const merged = reconcile_low_network_mode(normalized);

          server_base_ref.current = merged;

          const applied = apply_pending_preferences(
            merged,
            preferences_ref.current,
            pending_keys_ref.current,
          );

          cache_preferences_locally(applied);
          preferences_ref.current = applied;
          set_preferences(applied);

          if (
            merged !== normalized ||
            latest_prefs_ref.current ||
            pending_keys_ref.current.size > 0
          ) {
            schedule_save(applied);
          }

          cache_sidebar_state(
            "sidebar_more_collapsed",
            applied.sidebar_more_collapsed,
          );
          cache_sidebar_state(
            "sidebar_folders_collapsed",
            applied.sidebar_folders_collapsed,
          );
          cache_sidebar_state(
            "sidebar_labels_collapsed",
            applied.sidebar_labels_collapsed,
          );
          cache_sidebar_state(
            "sidebar_aliases_collapsed",
            applied.sidebar_aliases_collapsed,
          );
          apply_visual_preferences(applied);

          await load_notification_preferences(v);

          if (applied.desktop_notifications && "Notification" in window) {
            if (Notification.permission === "default") {
              request_notification_permission();
            }
          }

          if (applied.quiet_hours_enabled) {
            sync_quiet_hours_to_server(
              applied.quiet_hours_enabled,
              applied.quiet_hours_start,
              applied.quiet_hours_end,
            );
          }
        }

        set_has_loaded_from_server(response.loaded_from_server);
      } finally {
        set_is_loading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [vault_identity, is_completing_registration]);

  useEffect(() => {
    set_display_time_zone(preferences.time_zone);
  }, [preferences.time_zone]);

  useEffect(() => {
    document.documentElement.classList.toggle(
      "reduce-motion",
      preferences.reduce_motion,
    );
  }, [preferences.reduce_motion]);

  useEffect(() => {
    document.documentElement.classList.toggle(
      "compact-mode",
      preferences.compact_mode,
    );
  }, [preferences.compact_mode]);

  useEffect(() => {
    document.documentElement.style.setProperty(
      "--font-scale",
      String(
        normalize_font_size_scale(preferences.font_size_scale) /
          FONT_SIZE_DEFAULT,
      ),
    );
  }, [preferences.font_size_scale]);

  const effective_theme_fields = get_effective_theme_fields(preferences);

  useEffect(() => {
    apply_color_theme_class(
      effective_theme_fields.color_theme,
      preferences.accent_color,
      preferences.accent_color_hover,
      effective_theme_fields.custom_theme_seed,
      theme === "dark",
      preferences.custom_theme_overrides,
    );
  }, [
    effective_theme_fields.color_theme,
    preferences.accent_color,
    preferences.accent_color_hover,
    effective_theme_fields.custom_theme_seed,
    preferences.custom_theme_overrides,
    theme,
  ]);

  useEffect(() => {
    set_theme_ref.current(effective_theme_fields.theme);
  }, [effective_theme_fields.theme]);

  useEffect(() => {
    document.documentElement.style.setProperty(
      "--font-sans",
      get_font_stack(preferences.font_choice),
    );
  }, [preferences.font_choice]);

  useEffect(() => {
    document.documentElement.classList.toggle(
      "high-contrast",
      preferences.high_contrast,
    );
  }, [preferences.high_contrast]);

  useEffect(() => {
    document.documentElement.classList.toggle(
      "reduce-transparency",
      preferences.reduce_transparency,
    );
  }, [preferences.reduce_transparency]);

  useEffect(() => {
    document.documentElement.classList.toggle(
      "link-underlines",
      preferences.link_underlines,
    );
  }, [preferences.link_underlines]);

  useEffect(() => {
    document.documentElement.classList.toggle(
      "dyslexia-font",
      preferences.dyslexia_font,
    );
  }, [preferences.dyslexia_font]);

  useEffect(() => {
    document.documentElement.classList.toggle(
      "text-spacing",
      preferences.text_spacing,
    );
  }, [preferences.text_spacing]);

  useEffect(() => {
    sync_haptic_state(preferences.haptic_enabled);
  }, [preferences.haptic_enabled]);

  useEffect(() => {
    set_toast_min_duration(preferences.toast_duration_ms);
  }, [preferences.toast_duration_ms]);

  useEffect(() => {
    const style_id = "aster-low-network-fonts";

    const sync_low_network_style = () => {
      const existing = document.getElementById(style_id);

      if (!preferences.low_network_mode) {
        existing?.remove();

        return;
      }

      const rules = [
        "@media all { .animate-pulse, [class*='animate-'] { animation: none !important; transition: none !important; } }",
      ];
      const family = get_primary_font_family(
        get_font_stack(preferences.font_choice),
      );

      if (family && !is_font_family_loaded(family)) {
        rules.unshift(
          "*, *::before, *::after { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif !important; }",
        );
      }

      const style = existing ?? document.createElement("style");

      style.id = style_id;
      style.textContent = rules.join("\n");

      if (!existing) document.head.appendChild(style);
    };

    if (preferences.low_network_mode) {
      stop_version_check();
    }

    sync_low_network_style();
    set_low_network_mode(preferences.low_network_mode);

    if (!preferences.low_network_mode || typeof document === "undefined") {
      return;
    }

    const fonts = document.fonts;

    if (!fonts?.addEventListener) return;

    fonts.addEventListener("loadingdone", sync_low_network_style);

    return () => {
      fonts.removeEventListener("loadingdone", sync_low_network_style);
    };
  }, [preferences.low_network_mode, preferences.font_choice]);

  useEffect(() => {
    const nav_conn = (
      navigator as unknown as {
        connection?: {
          saveData?: boolean;
          effectiveType?: string;
          addEventListener: (e: string, h: () => void) => void;
          removeEventListener: (e: string, h: () => void) => void;
        };
      }
    ).connection;

    if (!nav_conn || typeof nav_conn.addEventListener !== "function") return;
    if (preferences.low_network_mode_user_set) return;
    if (preferences.low_network_mode) return;

    const handle_connection_change = () => {
      if (nav_conn.saveData !== true) return;

      update_preferences({ low_network_mode: true }, true);
    };

    nav_conn.addEventListener("change", handle_connection_change);
    return () =>
      nav_conn.removeEventListener("change", handle_connection_change);
  }, [
    preferences.low_network_mode,
    preferences.low_network_mode_user_set,
    update_preferences,
  ]);

  useEffect(() => {
    if (!vault_identity || is_completing_registration) return;

    let cancelled = false;
    let in_flight = false;
    let last_refresh_ms = 0;

    const refresh_from_other_devices = () => {
      if (cancelled || in_flight) return;
      if (document.visibilityState !== "visible") return;
      if (is_saving_ref.current) return;
      if (latest_prefs_ref.current) return;
      if (!has_loaded_ref.current) return;

      const now = Date.now();

      if (now - last_refresh_ms < CROSS_DEVICE_REFRESH_MIN_INTERVAL_MS) return;
      last_refresh_ms = now;
      in_flight = true;

      reload_preferences(true)
        .catch(() => {})
        .finally(() => {
          in_flight = false;
        });
    };

    const poll_id = window.setInterval(
      refresh_from_other_devices,
      CROSS_DEVICE_REFRESH_POLL_MS,
    );

    window.addEventListener("focus", refresh_from_other_devices);
    document.addEventListener("visibilitychange", refresh_from_other_devices);

    return () => {
      cancelled = true;
      window.clearInterval(poll_id);
      window.removeEventListener("focus", refresh_from_other_devices);
      document.removeEventListener(
        "visibilitychange",
        refresh_from_other_devices,
      );
    };
  }, [vault_identity, is_completing_registration, reload_preferences]);

  useEffect(() => {
    const flush_via_beacon = () => {
      if (!latest_prefs_ref.current || !beacon_payload_ref.current) return;

      const method = connection_store.get_method();

      if (method === "tor" || method === "tor_snowflake") {
        beacon_payload_ref.current = null;
        latest_prefs_ref.current = null;
        return;
      }

      let url: string;
      try {
        const api_base = import.meta.env.VITE_API_URL || "/api";
        url = `${get_effective_base_url(api_base)}/settings/v1/preferences`;
      } catch {
        beacon_payload_ref.current = null;
        latest_prefs_ref.current = null;
        return;
      }

      const csrf = get_csrf_token_from_cookie();
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      if (csrf) {
        headers["X-CSRF-Token"] = csrf;
      }

      fetch(url, {
        method: "PUT",
        headers,
        credentials: "include",
        keepalive: true,
        body: JSON.stringify({
          encrypted_preferences: beacon_payload_ref.current.encrypted,
          preferences_nonce: beacon_payload_ref.current.nonce,
        }),
      }).catch(() => {});

      beacon_payload_ref.current = null;
      latest_prefs_ref.current = null;
    };

    window.addEventListener("beforeunload", flush_via_beacon);

    return () => {
      window.removeEventListener("beforeunload", flush_via_beacon);

      if (latest_prefs_ref.current) {
        do_save(latest_prefs_ref.current);
      }

      if (debounce_timer.current) {
        clearTimeout(debounce_timer.current);
      }

      if (saved_indicator_timer.current) {
        clearTimeout(saved_indicator_timer.current);
      }
    };
  }, [do_save]);

  const has_unsaved_changes =
    save_status === "pending" || save_status === "saving";

  return {
    preferences,
    is_loading,
    has_loaded_from_server,
    save_status,
    update_preference,
    update_preferences,
    reset_to_defaults,
    reset_section,
    reload_preferences,
    save_now,
    has_unsaved_changes,
  };
}
