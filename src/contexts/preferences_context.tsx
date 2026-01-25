import type { LanguageCode } from "@/lib/i18n/types";
import type { StylePresetId } from "@/types/style_presets";

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
  DEFAULT_PREFERENCES,
  type UserPreferences,
} from "@/services/api/preferences";
import {
  STYLE_PRESETS,
  STYLE_AFFECTING_PREFERENCES,
} from "@/constants/style_presets";
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
  apply_style_preset: (preset_id: StylePresetId) => void;
  reset_to_defaults: () => void;
  reset_section: (keys: (keyof UserPreferences)[]) => void;
  save_now: () => Promise<void>;
  reload_preferences: () => Promise<void>;
  is_loading: boolean;
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
  const [preferences, set_preferences] =
    useState<UserPreferences>(DEFAULT_PREFERENCES);
  const [is_loading, set_is_loading] = useState(false);
  const [save_status, set_save_status] = useState<SaveStatus>("idle");
  const save_timeout = useRef<number | null>(null);
  const pending_preferences = useRef<UserPreferences | null>(null);
  const saved_indicator_timeout = useRef<number | null>(null);

  const load_preferences = useCallback(async () => {
    if (!vault || is_completing_registration) {
      set_preferences(DEFAULT_PREFERENCES);

      return;
    }

    set_is_loading(true);
    const response = await get_preferences(vault);

    if (response.data) {
      set_preferences(response.data);
      set_theme_preference(response.data.theme);

      const language_code = label_to_language_code(response.data.language);

      if (language_code) {
        set_language(language_code);
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

      await load_notification_preferences(vault);

      if (response.data.desktop_notifications && "Notification" in window) {
        if (Notification.permission === "default") {
          request_notification_permission();
        }
      }
    }
    set_is_loading(false);
  }, [vault, set_theme_preference, set_language, is_completing_registration]);

  const save_debounced = useCallback(
    async (prefs: UserPreferences) => {
      if (!vault || is_completing_registration) {
        set_save_status("idle");
        pending_preferences.current = null;

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

        const is_style_affecting = STYLE_AFFECTING_PREFERENCES.includes(
          key as (typeof STYLE_AFFECTING_PREFERENCES)[number],
        );

        if (
          is_style_affecting &&
          key !== "style_preset" &&
          updated.style_preset !== "custom"
        ) {
          updated.style_preset = "custom";
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

  const apply_style_preset = useCallback(
    (preset_id: StylePresetId) => {
      const preset = STYLE_PRESETS[preset_id];

      if (!preset) return;

      set_preferences((prev) => {
        const is_dark = document.documentElement.classList.contains("dark");
        const colors = is_dark ? preset.colors.dark : preset.colors.light;

        const updated: UserPreferences = {
          ...prev,
          style_preset: preset_id,
          density: preset.density,
          inbox_format: preset.inbox_format,
          email_view_mode: preset.email_view_mode,
          reading_pane_position: preset.reading_pane_position,
          show_profile_pictures: preset.show_profile_pictures,
          show_email_preview: preset.show_email_preview,
          split_pane_width: preset.split_pane_width,
          accent_color: colors.accent,
          accent_color_hover: colors.accent_hover,
        };

        document.documentElement.style.setProperty(
          "--accent-color",
          colors.accent,
        );
        document.documentElement.style.setProperty(
          "--accent-color-hover",
          colors.accent_hover,
        );

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

  const reset_to_defaults = useCallback(() => {
    set_preferences(DEFAULT_PREFERENCES);
    set_theme_preference(DEFAULT_PREFERENCES.theme);

    const language_code = label_to_language_code(DEFAULT_PREFERENCES.language);

    if (language_code) {
      set_language(language_code);
    }

    configure_session_timeout(
      DEFAULT_PREFERENCES.session_timeout_enabled,
      DEFAULT_PREFERENCES.session_timeout_minutes,
    );

    if (save_timeout.current) {
      clearTimeout(save_timeout.current);
      save_timeout.current = null;
    }
    pending_preferences.current = DEFAULT_PREFERENCES;
    save_debounced(DEFAULT_PREFERENCES);
  }, [save_debounced, set_theme_preference, set_language]);

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
    load_preferences();
  }, [load_preferences]);

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
        apply_style_preset,
        reset_to_defaults,
        reset_section,
        save_now,
        reload_preferences,
        is_loading,
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
