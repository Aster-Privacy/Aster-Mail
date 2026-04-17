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
  DEFAULT_PREFERENCES,
  type UserPreferences,
} from "@/services/api/preferences";
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
  update_preferences: (updates: Partial<UserPreferences>) => void;
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
  const [preferences, set_preferences] = useState<UserPreferences>(() => ({
    ...DEFAULT_PREFERENCES,
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
  }));
  const [is_loading, set_is_loading] = useState(true);
  const [has_loaded_from_server, set_has_loaded_from_server] = useState(false);
  const [save_status, set_save_status] = useState<SaveStatus>("idle");
  const save_timeout = useRef<number | null>(null);
  const pending_preferences = useRef<UserPreferences | null>(null);
  const saved_indicator_timeout = useRef<number | null>(null);
  const initial_load_done = useRef(false);
  const set_theme_preference_ref = useRef(set_theme_preference);

  set_theme_preference_ref.current = set_theme_preference;
  const set_language_ref = useRef(set_language);

  set_language_ref.current = set_language;

  const load_preferences = useCallback(async () => {
    if (!vault || is_completing_registration) {
      initial_load_done.current = false;
      set_has_loaded_from_server(false);
      set_is_loading(false);

      return;
    }

    initial_load_done.current = false;
    let response = await get_preferences(vault);
    let attempt = 0;

    while (!response.loaded_from_server && attempt < 6) {
      attempt += 1;
      const delay_ms = Math.min(500 * 2 ** (attempt - 1), 8000);

      await new Promise((resolve) => setTimeout(resolve, delay_ms));
      response = await get_preferences(vault);
    }

    if (!response.loaded_from_server) {
      set_is_loading(false);

      return;
    }

    if (response.loaded_from_server && response.data) {
      if (save_timeout.current) {
        clearTimeout(save_timeout.current);
        save_timeout.current = null;
      }
      pending_preferences.current = null;

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
      set_theme_preference_ref.current(response.data.theme);

      const language_code = label_to_language_code(response.data.language);

      if (language_code) {
        set_language_ref.current(language_code);
      }

      configure_session_timeout(
        response.data.session_timeout_enabled,
        response.data.session_timeout_minutes,
      );

      if (response.data.accent_color) {
        document.documentElement.style.setProperty(
          "--accent-color",
          response.data.accent_color,
        );
      }
      if (response.data.accent_color_hover) {
        document.documentElement.style.setProperty(
          "--accent-color-hover",
          response.data.accent_color_hover,
        );
      }

      const root = document.documentElement;

      root.classList.toggle("reduce-motion", response.data.reduce_motion);
      root.classList.toggle("compact-mode", response.data.compact_mode);

      root.classList.remove(
        "font-size-small",
        "font-size-large",
        "font-size-extra-large",
      );
      if (response.data.font_size_scale === "small")
        root.classList.add("font-size-small");
      else if (response.data.font_size_scale === "large")
        root.classList.add("font-size-large");
      else if (response.data.font_size_scale === "extra_large")
        root.classList.add("font-size-extra-large");

      root.classList.toggle("high-contrast", response.data.high_contrast);
      root.classList.toggle(
        "reduce-transparency",
        response.data.reduce_transparency,
      );
      root.classList.toggle("link-underlines", response.data.link_underlines);
      root.classList.toggle("dyslexia-font", response.data.dyslexia_font);
      root.classList.toggle("text-spacing", response.data.text_spacing);

      await load_notification_preferences(vault);

      if (response.data.desktop_notifications && "Notification" in window) {
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
    initial_load_done.current = true;
    set_has_loaded_from_server(true);
    set_is_loading(false);
  }, [vault, is_completing_registration]);

  const save_debounced = useCallback(
    async (prefs: UserPreferences) => {
      if (!vault || is_completing_registration) {
        set_save_status("idle");
        pending_preferences.current = null;

        return;
      }

      if (!initial_load_done.current) {
        return;
      }

      set_save_status("saving");

      if (saved_indicator_timeout.current) {
        clearTimeout(saved_indicator_timeout.current);
        saved_indicator_timeout.current = null;
      }

      try {
        await save_preferences(prefs, vault);
        await load_notification_preferences(vault);
        pending_preferences.current = null;
        set_save_status("saved");

        saved_indicator_timeout.current = window.setTimeout(() => {
          set_save_status("idle");
          saved_indicator_timeout.current = null;
        }, 2000);
      } catch {
        set_save_status("error");
        window.dispatchEvent(
          new CustomEvent("astermail:preferences-save-failed"),
        );

        saved_indicator_timeout.current = window.setTimeout(() => {
          set_save_status("idle");
          saved_indicator_timeout.current = null;
        }, 3000);
      }
    },
    [vault, is_completing_registration],
  );

  const schedule_save = useCallback(
    (updated: UserPreferences) => {
      pending_preferences.current = updated;
      set_save_status("pending");

      if (saved_indicator_timeout.current) {
        clearTimeout(saved_indicator_timeout.current);
        saved_indicator_timeout.current = null;
      }

      if (save_timeout.current) {
        clearTimeout(save_timeout.current);
      }

      save_timeout.current = window.setTimeout(() => {
        if (pending_preferences.current) {
          save_debounced(pending_preferences.current);
        }
      }, 1000);
    },
    [save_debounced],
  );

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
          if (save_timeout.current) {
            clearTimeout(save_timeout.current);
            save_timeout.current = null;
          }
          pending_preferences.current = updated;
          save_debounced(updated);
        } else {
          schedule_save(updated);
        }

        return updated;
      });
    },
    [schedule_save, save_debounced],
  );

  const update_preferences = useCallback(
    (updates: Partial<UserPreferences>) => {
      set_preferences((prev) => {
        const updated = { ...prev, ...updates };

        schedule_save(updated);

        return updated;
      });
    },
    [schedule_save],
  );

  const reset_to_defaults = useCallback(() => {
    set_preferences(DEFAULT_PREFERENCES);
    set_theme_preference_ref.current(DEFAULT_PREFERENCES.theme);

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

    if (vault) {
      save_dev_mode(false, vault);
    }

    sync_quiet_hours_to_server(
      DEFAULT_PREFERENCES.quiet_hours_enabled,
      DEFAULT_PREFERENCES.quiet_hours_start,
      DEFAULT_PREFERENCES.quiet_hours_end,
    );

    if (save_timeout.current) {
      clearTimeout(save_timeout.current);
      save_timeout.current = null;
    }
    pending_preferences.current = DEFAULT_PREFERENCES;
    save_debounced(DEFAULT_PREFERENCES);
  }, [vault, save_debounced]);

  const reset_section = useCallback(
    (keys: (keyof UserPreferences)[]) => {
      set_preferences((prev) => {
        const updated = { ...prev };

        for (const key of keys) {
          (updated as Record<string, unknown>)[key] = DEFAULT_PREFERENCES[key];
        }

        if (save_timeout.current) {
          clearTimeout(save_timeout.current);
          save_timeout.current = null;
        }
        pending_preferences.current = updated;
        save_debounced(updated);

        return updated;
      });
    },
    [save_debounced],
  );

  const reload_preferences = useCallback(async () => {
    await load_preferences();
  }, [load_preferences]);

  const save_now = useCallback(async () => {
    if (!vault || !pending_preferences.current) return;
    if (save_timeout.current) {
      clearTimeout(save_timeout.current);
      save_timeout.current = null;
    }
    await save_debounced(pending_preferences.current);
  }, [vault, save_debounced]);

  useEffect(() => {
    if (save_timeout.current) {
      clearTimeout(save_timeout.current);
      save_timeout.current = null;
    }
    pending_preferences.current = null;
    load_preferences();
  }, [load_preferences]);

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
    return () => {
      if (save_timeout.current) {
        clearTimeout(save_timeout.current);
      }
      if (saved_indicator_timeout.current) {
        clearTimeout(saved_indicator_timeout.current);
      }
    };
  }, []);

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
