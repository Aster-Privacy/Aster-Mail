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
import type { LanguageCode } from "@/lib/i18n/types";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
  useCallback,
  useRef,
} from "react";

import { use_auth } from "@/contexts/auth_context";
import { useTheme } from "@/contexts/theme_context";
import {
  get_preferences,
  save_preferences,
  save_dev_mode,
  sync_quiet_hours_to_server,
  cache_sidebar_state,
  get_cached_sidebar_state,
  cache_preferences_locally,
  get_cached_preferences,
  prepare_preferences_payload,
  DEFAULT_PREFERENCES,
  type UserPreferences,
} from "@/services/api/preferences";
import { get_csrf_token_from_cookie } from "@/services/api/csrf";
import { get_effective_base_url } from "@/services/routing/routing_provider";
import { connection_store } from "@/services/routing/connection_store";
import { sync_haptic_state } from "@/native/haptic_feedback";
import {
  load_notification_preferences,
  request_notification_permission,
} from "@/services/notification_service";
import { use_i18n } from "@/lib/i18n/context";
import {
  get_supported_languages,
  get_display_name,
} from "@/lib/i18n/languages";
import { configure_session_timeout } from "@/services/session_timeout_service";

const LANGUAGE_OPTIONS = get_supported_languages().map((lang) => ({
  code: lang.code,
  label: get_display_name(lang.code),
}));

function label_to_language_code(label: string): LanguageCode | null {
  const match = LANGUAGE_OPTIONS.find((l) => l.label === label);

  return match ? (match.code as LanguageCode) : null;
}

export type SaveStatus = "idle" | "pending" | "saving" | "saved" | "error";

interface PreferencesContextType {
  preferences: UserPreferences;
  update_preference: <K extends keyof UserPreferences>(
    key: K,
    value: UserPreferences[K],
    immediate?: boolean,
  ) => void;
  update_preferences: (updates: Partial<UserPreferences>, immediate?: boolean) => void;
  reset_to_defaults: () => void;
  reset_section: (keys: (keyof UserPreferences)[]) => void;
  save_now: () => Promise<void>;
  reload_preferences: () => Promise<void>;
  is_loading: boolean;
  has_loaded_from_server: boolean;
  save_status: SaveStatus;
  has_unsaved_changes: boolean;
}

const PreferencesContext = createContext<PreferencesContextType | null>(null);

interface PreferencesProviderProps {
  children: ReactNode;
}

export function PreferencesProvider({ children }: PreferencesProviderProps) {
  const { vault, is_completing_registration } = use_auth();
  const { set_theme_preference } = useTheme();
  const { set_language } = use_i18n();

  const [preferences, set_preferences] = useState<UserPreferences>(() => {
    const cached = get_cached_preferences();
    const base = cached ?? DEFAULT_PREFERENCES;

    return {
      ...base,
      sidebar_more_collapsed: get_cached_sidebar_state("sidebar_more_collapsed"),
      sidebar_folders_collapsed: get_cached_sidebar_state(
        "sidebar_folders_collapsed",
      ),
      sidebar_labels_collapsed: get_cached_sidebar_state(
        "sidebar_labels_collapsed",
      ),
      sidebar_aliases_collapsed: get_cached_sidebar_state(
        "sidebar_aliases_collapsed",
      ),
    };
  });
  const [is_loading, set_is_loading] = useState(true);
  const [has_loaded_from_server, set_has_loaded_from_server] = useState(false);
  const [save_status, set_save_status] = useState<SaveStatus>("idle");

  const vault_ref = useRef(vault);

  if (vault) {
    vault_ref.current = vault;
  }

  const set_theme_ref = useRef(set_theme_preference);
  set_theme_ref.current = set_theme_preference;

  const set_language_ref = useRef(set_language);
  set_language_ref.current = set_language;

  const has_loaded_ref = useRef(false);

  const debounce_timer = useRef<number | null>(null);
  const saved_indicator_timer = useRef<number | null>(null);
  const latest_prefs_ref = useRef<UserPreferences | null>(null);
  const is_saving_ref = useRef(false);
  const beacon_payload_ref = useRef<{
    encrypted: string;
    nonce: string;
  } | null>(null);

  const do_save = useCallback(async (prefs: UserPreferences): Promise<boolean> => {
    if (!has_loaded_ref.current) {
      return false;
    }

    const v = vault_ref.current;

    if (!v || !v.identity_key) {
      return false;
    }

    try {
      const result = await save_preferences(prefs, v);

      if (!result.data.success) {
        return false;
      }

      return true;
    } catch (err) {
      console.error("[prefs] do_save: exception during save_preferences:", err);

      return false;
    }
  }, []);

  const flush_save = useCallback(async () => {
    if (is_saving_ref.current) return;

    const prefs = latest_prefs_ref.current;

    if (!prefs) return;

    is_saving_ref.current = true;
    latest_prefs_ref.current = null;
    set_save_status("saving");

    if (saved_indicator_timer.current) {
      clearTimeout(saved_indicator_timer.current);
      saved_indicator_timer.current = null;
    }

    const ok = await do_save(prefs);

    if (ok) {
      cache_preferences_locally(prefs);
      beacon_payload_ref.current = null;
      set_save_status("saved");

      saved_indicator_timer.current = window.setTimeout(() => {
        set_save_status("idle");
        saved_indicator_timer.current = null;
      }, 2000);

      const v = vault_ref.current;

      if (v) {
        load_notification_preferences(v).catch(() => {});
      }
    } else {
      set_save_status("error");

      window.setTimeout(() => {
        is_saving_ref.current = false;

        if (latest_prefs_ref.current) {
          flush_save_ref.current();
        }
      }, 3000);

      is_saving_ref.current = false;

      return;
    }

    is_saving_ref.current = false;

    if (latest_prefs_ref.current) {
      flush_save_ref.current();
    }
  }, [do_save]);

  const flush_save_ref = useRef(flush_save);
  flush_save_ref.current = flush_save;

  const schedule_save = useCallback((prefs: UserPreferences) => {
    latest_prefs_ref.current = prefs;
    set_save_status("pending");

    if (saved_indicator_timer.current) {
      clearTimeout(saved_indicator_timer.current);
      saved_indicator_timer.current = null;
    }

    if (debounce_timer.current) {
      clearTimeout(debounce_timer.current);
    }

    const v = vault_ref.current;

    if (v) {
      prepare_preferences_payload(prefs, v).then((payload) => {
        if (latest_prefs_ref.current === prefs) {
          beacon_payload_ref.current = payload;
        }
      });
    }

    debounce_timer.current = window.setTimeout(() => {
      debounce_timer.current = null;
      flush_save_ref.current();
    }, 400);
  }, []);

  const trigger_save = useCallback((prefs: UserPreferences) => {
    schedule_save(prefs);
  }, [schedule_save]);

  const update_preference = useCallback(
    <K extends keyof UserPreferences>(
      key: K,
      value: UserPreferences[K],
      immediate?: boolean,
    ) => {
      set_preferences((prev) => {
        const updated = { ...prev, [key]: value };

        if (
          key === "session_timeout_enabled" ||
          key === "session_timeout_minutes"
        ) {
          configure_session_timeout(
            updated.session_timeout_enabled,
            updated.session_timeout_minutes,
          );
        }

        if (
          key === "quiet_hours_enabled" ||
          key === "quiet_hours_start" ||
          key === "quiet_hours_end"
        ) {
          sync_quiet_hours_to_server(
            updated.quiet_hours_enabled,
            updated.quiet_hours_start,
            updated.quiet_hours_end,
          );
        }

        if (immediate) {
          latest_prefs_ref.current = updated;

          if (debounce_timer.current) {
            clearTimeout(debounce_timer.current);
            debounce_timer.current = null;
          }

          do_save(updated).then((ok) => {
            if (ok) {
              cache_preferences_locally(updated);
              set_save_status("saved");
              window.setTimeout(() => set_save_status("idle"), 2000);
            } else {
              set_save_status("error");
            }
          });
        } else {
          trigger_save(updated);
        }

        return updated;
      });
    },
    [trigger_save, do_save],
  );

  const update_preferences = useCallback(
    (updates: Partial<UserPreferences>, immediate?: boolean) => {
      set_preferences((prev) => {
        const updated = { ...prev, ...updates };

        if (immediate) {
          latest_prefs_ref.current = updated;

          if (debounce_timer.current) {
            clearTimeout(debounce_timer.current);
            debounce_timer.current = null;
          }

          do_save(updated).then((ok) => {
            if (ok) {
              cache_preferences_locally(updated);
              set_save_status("saved");
              window.setTimeout(() => set_save_status("idle"), 2000);
            } else {
              set_save_status("error");
            }
          });
        } else {
          trigger_save(updated);
        }

        return updated;
      });
    },
    [trigger_save, do_save],
  );

  const reset_to_defaults = useCallback(() => {
    set_preferences(DEFAULT_PREFERENCES);
    set_theme_ref.current(DEFAULT_PREFERENCES.theme);

    const language_code = label_to_language_code(DEFAULT_PREFERENCES.language);

    if (language_code) {
      set_language_ref.current(language_code);
    }

    configure_session_timeout(
      DEFAULT_PREFERENCES.session_timeout_enabled,
      DEFAULT_PREFERENCES.session_timeout_minutes,
    );

    document.documentElement.style.setProperty(
      "--accent-color",
      DEFAULT_PREFERENCES.accent_color,
    );
    document.documentElement.style.setProperty(
      "--accent-color-hover",
      DEFAULT_PREFERENCES.accent_color_hover,
    );

    sync_haptic_state(false);

    const v = vault_ref.current;

    if (v) {
      save_dev_mode(false, v);
    }

    sync_quiet_hours_to_server(
      DEFAULT_PREFERENCES.quiet_hours_enabled,
      DEFAULT_PREFERENCES.quiet_hours_start,
      DEFAULT_PREFERENCES.quiet_hours_end,
    );

    if (debounce_timer.current) {
      clearTimeout(debounce_timer.current);
      debounce_timer.current = null;
    }

    latest_prefs_ref.current = DEFAULT_PREFERENCES;
    do_save(DEFAULT_PREFERENCES);
  }, [do_save]);

  const reset_section = useCallback(
    (keys: (keyof UserPreferences)[]) => {
      set_preferences((prev) => {
        const updated = { ...prev };

        for (const key of keys) {
          (updated as Record<string, unknown>)[key] = DEFAULT_PREFERENCES[key];
        }

        if (debounce_timer.current) {
          clearTimeout(debounce_timer.current);
          debounce_timer.current = null;
        }

        latest_prefs_ref.current = updated;
        do_save(updated);

        return updated;
      });
    },
    [do_save],
  );

  const apply_visual_preferences = useCallback((prefs: Partial<UserPreferences>) => {
    if (prefs.theme) {
      set_theme_ref.current(prefs.theme);
    }

    const language_code = prefs.language
      ? label_to_language_code(prefs.language)
      : null;

    if (language_code) {
      set_language_ref.current(language_code);
    }

    configure_session_timeout(
      prefs.session_timeout_enabled ?? DEFAULT_PREFERENCES.session_timeout_enabled,
      prefs.session_timeout_minutes ?? DEFAULT_PREFERENCES.session_timeout_minutes,
    );

    if (prefs.accent_color) {
      document.documentElement.style.setProperty(
        "--accent-color",
        prefs.accent_color,
      );
    }
    if (prefs.accent_color_hover) {
      document.documentElement.style.setProperty(
        "--accent-color-hover",
        prefs.accent_color_hover,
      );
    }

    const root = document.documentElement;

    root.classList.toggle("reduce-motion", prefs.reduce_motion ?? false);
    root.classList.toggle("compact-mode", prefs.compact_mode ?? false);

    root.classList.remove(
      "font-size-small",
      "font-size-large",
      "font-size-extra-large",
    );
    if (prefs.font_size_scale === "small")
      root.classList.add("font-size-small");
    else if (prefs.font_size_scale === "large")
      root.classList.add("font-size-large");
    else if (prefs.font_size_scale === "extra_large")
      root.classList.add("font-size-extra-large");

    root.classList.toggle("high-contrast", prefs.high_contrast ?? false);
    root.classList.toggle(
      "reduce-transparency",
      prefs.reduce_transparency ?? false,
    );
    root.classList.toggle("link-underlines", prefs.link_underlines ?? false);
    root.classList.toggle("dyslexia-font", prefs.dyslexia_font ?? false);
    root.classList.toggle("text-spacing", prefs.text_spacing ?? false);
  }, []);

  const reload_preferences = useCallback(async () => {
    const v = vault_ref.current;

    if (!v) return;

    let response = await get_preferences(v);
    let attempt = 0;

    while (!response.loaded_from_server && attempt < 6) {
      attempt += 1;
      const delay_ms = Math.min(500 * 2 ** (attempt - 1), 8000);

      await new Promise((resolve) => setTimeout(resolve, delay_ms));
      response = await get_preferences(v);
    }

    if (response.loaded_from_server && response.data) {
      const merged = { ...DEFAULT_PREFERENCES, ...response.data };

      set_preferences(merged);
      apply_visual_preferences(response.data);
    } else {
      const cached = get_cached_preferences();

      if (cached) {
        set_preferences(cached);
        apply_visual_preferences(cached);
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
    has_loaded_ref.current = false;

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
            response = { data: cached, loaded_from_server: false };
            set_preferences(cached);
            apply_visual_preferences(cached);
          }
        }

        if (response.loaded_from_server && response.data) {
          has_loaded_ref.current = true;
          cache_preferences_locally(response.data);
          if (debounce_timer.current) {
            clearTimeout(debounce_timer.current);
            debounce_timer.current = null;
          }
          latest_prefs_ref.current = null;
          beacon_payload_ref.current = null;

          const merged = { ...DEFAULT_PREFERENCES, ...response.data };

          set_preferences(merged);
          cache_sidebar_state(
            "sidebar_more_collapsed",
            merged.sidebar_more_collapsed,
          );
          cache_sidebar_state(
            "sidebar_folders_collapsed",
            merged.sidebar_folders_collapsed,
          );
          cache_sidebar_state(
            "sidebar_labels_collapsed",
            merged.sidebar_labels_collapsed,
          );
          cache_sidebar_state(
            "sidebar_aliases_collapsed",
            merged.sidebar_aliases_collapsed,
          );
          apply_visual_preferences(response.data);

          await load_notification_preferences(v);

          if (
            response.data.desktop_notifications &&
            "Notification" in window
          ) {
            if (Notification.permission === "default") {
              request_notification_permission();
            }
          }

          if (response.data.quiet_hours_enabled) {
            sync_quiet_hours_to_server(
              response.data.quiet_hours_enabled,
              response.data.quiet_hours_start,
              response.data.quiet_hours_end,
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
    const root = document.documentElement;

    root.classList.remove(
      "font-size-small",
      "font-size-large",
      "font-size-extra-large",
    );
    if (preferences.font_size_scale === "small")
      root.classList.add("font-size-small");
    else if (preferences.font_size_scale === "large")
      root.classList.add("font-size-large");
    else if (preferences.font_size_scale === "extra_large")
      root.classList.add("font-size-extra-large");
  }, [preferences.font_size_scale]);

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

  return (
    <PreferencesContext.Provider
      value={{
        preferences,
        update_preference,
        update_preferences,
        reset_to_defaults,
        reset_section,
        save_now,
        reload_preferences,
        is_loading,
        has_loaded_from_server,
        save_status,
        has_unsaved_changes,
      }}
    >
      {children}
    </PreferencesContext.Provider>
  );
}

export function use_preferences(): PreferencesContextType {
  const context = useContext(PreferencesContext);

  if (!context) {
    throw new Error("use_preferences must be used within PreferencesProvider");
  }

  return context;
}
