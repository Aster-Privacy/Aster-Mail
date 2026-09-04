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
import type {} from "@/lib/i18n/types";

import { useState, useCallback, useRef } from "react";

import {
  FONT_SIZE_DEFAULT,
  SaveStatus,
  apply_color_theme_class,
  label_to_language_code,
  normalize_font_size_scale,
  normalize_preferences,
} from "./helpers";

import { use_auth } from "@/contexts/auth_context";
import { useTheme } from "@/contexts/theme_context";
import {
  get_preferences,
  save_preferences,
  save_dev_mode,
  sync_quiet_hours_to_server,
  get_cached_sidebar_state,
  cache_preferences_locally,
  get_cached_preferences,
  prepare_preferences_payload,
  reconcile_preferences,
  DEFAULT_PREFERENCES,
  type UserPreferences,
} from "@/services/api/preferences";
import { sync_haptic_state } from "@/native/haptic_feedback";
import { load_notification_preferences } from "@/services/notification_service";
import { use_i18n } from "@/lib/i18n/context";
import { configure_session_timeout } from "@/services/session_timeout_service";
import {
  set_preload_email_font_px,
  set_preload_email_font_stack,
} from "@/components/email/hooks/preload_cache";
import { get_font_stack, get_email_font_stack } from "@/lib/font_options";
import { get_effective_theme_fields } from "@/lib/theme_sync";
import { ignore_error } from "@/lib/ignore_error";
import { get_vault_from_memory } from "@/services/crypto/memory_key_store";

const SAVE_RETRY_BASE_MS = 3000;
const MAX_SAVE_RETRY_DELAY_MS = 60000;
const MAX_SAVE_RETRY_ATTEMPTS = 6;

export function compute_save_retry_delay(attempts: number): number | null {
  if (attempts >= MAX_SAVE_RETRY_ATTEMPTS) return null;

  return Math.min(SAVE_RETRY_BASE_MS * 2 ** attempts, MAX_SAVE_RETRY_DELAY_MS);
}

export function use_preferences_core() {
  const { vault, is_completing_registration } = use_auth();
  const { theme, set_theme_preference } = useTheme();
  const { set_language } = use_i18n();

  const [preferences, set_preferences] = useState<UserPreferences>(() => {
    const cached = get_cached_preferences();
    const base = normalize_preferences(cached ?? DEFAULT_PREFERENCES);
    const scale = normalize_font_size_scale(base.font_size_scale);

    document.documentElement.style.setProperty(
      "--font-scale",
      String(scale / FONT_SIZE_DEFAULT),
    );
    set_preload_email_font_px(Math.round(14 * (scale / FONT_SIZE_DEFAULT)));
    set_preload_email_font_stack(
      get_email_font_stack(base.email_font_choice, base.font_choice),
    );

    return {
      ...base,
      sidebar_more_collapsed: get_cached_sidebar_state(
        "sidebar_more_collapsed",
      ),
      sidebar_folders_collapsed: get_cached_sidebar_state(
        "sidebar_folders_collapsed",
      ),
      sidebar_labels_collapsed: get_cached_sidebar_state(
        "sidebar_labels_collapsed",
      ),
      sidebar_aliases_collapsed: get_cached_sidebar_state(
        "sidebar_aliases_collapsed",
      ),
      sidebar_contact_groups_collapsed: get_cached_sidebar_state(
        "sidebar_contact_groups_collapsed",
      ),
    };
  });
  const [is_loading, set_is_loading] = useState(true);
  const [has_loaded_from_server, set_has_loaded_from_server] = useState(false);
  const [save_status, set_save_status] = useState<SaveStatus>("idle");

  const vault_ref = useRef(vault);

  vault_ref.current = vault ?? vault_ref.current;

  const vault_seen_live_ref = useRef(false);

  const current_vault_for_save = (): typeof vault => {
    const candidate = vault_ref.current;

    if (!candidate || !candidate.identity_key) return null;

    const live = get_vault_from_memory();

    if (live) {
      vault_seen_live_ref.current = true;

      if (live.identity_key !== candidate.identity_key) return null;

      return candidate;
    }

    if (vault_seen_live_ref.current) return null;

    return candidate;
  };

  const set_theme_ref = useRef(set_theme_preference);

  set_theme_ref.current = set_theme_preference;

  const theme_ref = useRef(theme);

  theme_ref.current = theme;

  const set_language_ref = useRef(set_language);

  set_language_ref.current = set_language;

  const preferences_ref = useRef(preferences);

  preferences_ref.current = preferences;

  const pending_keys_ref = useRef<Set<keyof UserPreferences>>(new Set());

  const has_loaded_ref = useRef(false);
  const fallback_base_ref = useRef<UserPreferences | null>(null);
  const server_base_ref = useRef<UserPreferences | null>(null);

  const debounce_timer = useRef<number | null>(null);
  const saved_indicator_timer = useRef<number | null>(null);
  const save_retry_timer = useRef<number | null>(null);
  const save_retry_attempts = useRef(0);
  const latest_prefs_ref = useRef<UserPreferences | null>(null);
  const is_saving_ref = useRef(false);
  const beacon_payload_ref = useRef<{
    encrypted: string;
    nonce: string;
    identity: string;
  } | null>(null);

  const do_save = useCallback(
    async (prefs: UserPreferences): Promise<UserPreferences | null> => {
      if (!has_loaded_ref.current) {
        return null;
      }

      const v = current_vault_for_save();

      if (!v) {
        return null;
      }

      let to_save = prefs;
      const base = fallback_base_ref.current ?? server_base_ref.current;

      if (base) {
        let fresh = null;

        try {
          fresh = await get_preferences(v, true);
        } catch {
          fresh = null;
        }

        if (fresh?.loaded_from_server && fresh.data) {
          if (!fresh.server_blob_unusable) {
            to_save = reconcile_preferences(base, prefs, fresh.data);
          }

          fallback_base_ref.current = null;
        } else {
          return null;
        }
      }

      try {
        const result = await save_preferences(to_save, v);

        if (!result.data.success) {
          return null;
        }

        server_base_ref.current = to_save;

        if (!latest_prefs_ref.current || latest_prefs_ref.current === prefs) {
          pending_keys_ref.current.clear();
        }

        return to_save;
      } catch (err) {
        if (import.meta.env.DEV) {
          console.error(
            "[prefs] do_save: exception during save_preferences:",
            err,
          );
        }

        return null;
      }
    },
    [],
  );

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

    const saved = await do_save(prefs);

    if (saved) {
      cache_preferences_locally(saved);

      if (saved !== prefs && !latest_prefs_ref.current) {
        preferences_ref.current = saved;
        set_preferences(saved);
      }

      beacon_payload_ref.current = null;
      save_retry_attempts.current = 0;
      set_save_status("saved");

      saved_indicator_timer.current = window.setTimeout(() => {
        set_save_status("idle");
        saved_indicator_timer.current = null;
      }, 2000);

      const v = vault_ref.current;

      if (v) {
        load_notification_preferences(v).catch((caught) =>
          ignore_error(
            "contexts/preferences_context/use_preferences_core:use_preferences_core",
            caught,
          ),
        );
      }
    } else {
      set_save_status("error");

      cache_preferences_locally(prefs);

      if (!latest_prefs_ref.current) {
        latest_prefs_ref.current = prefs;
      }

      is_saving_ref.current = false;

      if (save_retry_timer.current) {
        clearTimeout(save_retry_timer.current);
        save_retry_timer.current = null;
      }

      if (!current_vault_for_save()) return;

      const delay = compute_save_retry_delay(save_retry_attempts.current);

      if (delay === null) return;

      save_retry_attempts.current += 1;

      save_retry_timer.current = window.setTimeout(() => {
        save_retry_timer.current = null;

        if (is_saving_ref.current) return;

        if (latest_prefs_ref.current) {
          flush_save_ref.current();
        }
      }, delay);

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

    const v = current_vault_for_save();

    if (v && v.identity_key) {
      const identity = v.identity_key;

      prepare_preferences_payload(prefs, v).then((payload) => {
        if (latest_prefs_ref.current === prefs && has_loaded_ref.current) {
          beacon_payload_ref.current = payload
            ? { encrypted: payload.encrypted, nonce: payload.nonce, identity }
            : null;
        }
      });
    }

    const save_delay = latest_prefs_ref.current?.low_network_mode ? 2000 : 400;

    debounce_timer.current = window.setTimeout(() => {
      debounce_timer.current = null;
      flush_save_ref.current();
    }, save_delay);
  }, []);

  const trigger_save = useCallback(
    (prefs: UserPreferences) => {
      schedule_save(prefs);
    },
    [schedule_save],
  );

  const save_immediately = useCallback((updated: UserPreferences) => {
    latest_prefs_ref.current = updated;
    beacon_payload_ref.current = null;

    if (debounce_timer.current) {
      clearTimeout(debounce_timer.current);
      debounce_timer.current = null;
    }

    if (saved_indicator_timer.current) {
      clearTimeout(saved_indicator_timer.current);
      saved_indicator_timer.current = null;
    }

    const v = current_vault_for_save();

    if (v && v.identity_key) {
      const identity = v.identity_key;

      prepare_preferences_payload(updated, v).then((payload) => {
        if (latest_prefs_ref.current === updated && has_loaded_ref.current) {
          beacon_payload_ref.current = payload
            ? { encrypted: payload.encrypted, nonce: payload.nonce, identity }
            : null;
        }
      });
    }

    void flush_save_ref.current();
  }, []);

  const update_preference = useCallback(
    <K extends keyof UserPreferences>(
      key: K,
      value: UserPreferences[K],
      immediate?: boolean,
    ) => {
      pending_keys_ref.current.add(key);

      const updated: UserPreferences = {
        ...preferences_ref.current,
        [key]: value,
      };

      if (key === "low_network_mode") {
        updated.low_network_mode_user_set = true;
      }

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

      preferences_ref.current = updated;
      set_preferences(updated);

      if (immediate) {
        save_immediately(updated);
      } else {
        trigger_save(updated);
      }
    },
    [trigger_save, save_immediately],
  );

  const update_preferences = useCallback(
    (updates: Partial<UserPreferences>, immediate?: boolean) => {
      for (const key of Object.keys(updates) as (keyof UserPreferences)[]) {
        pending_keys_ref.current.add(key);
      }

      const updated = { ...preferences_ref.current, ...updates };

      preferences_ref.current = updated;
      set_preferences(updated);

      if (immediate) {
        save_immediately(updated);
      } else {
        trigger_save(updated);
      }
    },
    [trigger_save, save_immediately],
  );

  const reset_to_defaults = useCallback(() => {
    for (const key of Object.keys(
      DEFAULT_PREFERENCES,
    ) as (keyof UserPreferences)[]) {
      pending_keys_ref.current.add(key);
    }

    const reset_preferences = {
      ...preferences_ref.current,
      ...DEFAULT_PREFERENCES,
    };

    preferences_ref.current = reset_preferences;
    set_preferences(reset_preferences);
    set_theme_ref.current(DEFAULT_PREFERENCES.theme);

    const language_code = label_to_language_code(DEFAULT_PREFERENCES.language);

    if (language_code) {
      set_language_ref.current(language_code);
    }

    configure_session_timeout(
      DEFAULT_PREFERENCES.session_timeout_enabled,
      DEFAULT_PREFERENCES.session_timeout_minutes,
    );

    apply_color_theme_class(
      DEFAULT_PREFERENCES.color_theme,
      DEFAULT_PREFERENCES.accent_color,
      DEFAULT_PREFERENCES.accent_color_hover,
      DEFAULT_PREFERENCES.custom_theme_seed,
      theme_ref.current === "dark",
      DEFAULT_PREFERENCES.custom_theme_overrides,
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

    latest_prefs_ref.current = reset_preferences;
    void flush_save_ref.current();
  }, []);

  const reset_section = useCallback((keys: (keyof UserPreferences)[]) => {
    for (const key of keys) {
      pending_keys_ref.current.add(key);
    }

    const updated = { ...preferences_ref.current };

    for (const key of keys) {
      (updated as Record<string, unknown>)[key] = DEFAULT_PREFERENCES[key];
    }

    if (debounce_timer.current) {
      clearTimeout(debounce_timer.current);
      debounce_timer.current = null;
    }

    preferences_ref.current = updated;
    set_preferences(updated);

    latest_prefs_ref.current = updated;
    void flush_save_ref.current();
  }, []);

  const apply_visual_preferences = useCallback(
    (prefs: Partial<UserPreferences>) => {
      const effective_theme = get_effective_theme_fields({
        ...DEFAULT_PREFERENCES,
        ...prefs,
      });

      if (prefs.theme || prefs.theme_web) {
        set_theme_ref.current(effective_theme.theme);
      }

      const language_code = prefs.language
        ? label_to_language_code(prefs.language)
        : null;

      if (language_code) {
        set_language_ref.current(language_code);
      }

      configure_session_timeout(
        prefs.session_timeout_enabled ??
          DEFAULT_PREFERENCES.session_timeout_enabled,
        prefs.session_timeout_minutes ??
          DEFAULT_PREFERENCES.session_timeout_minutes,
      );

      if (prefs.color_theme || prefs.color_theme_web) {
        apply_color_theme_class(
          effective_theme.color_theme,
          prefs.accent_color ?? DEFAULT_PREFERENCES.accent_color,
          prefs.accent_color_hover ?? DEFAULT_PREFERENCES.accent_color_hover,
          effective_theme.custom_theme_seed,
          theme_ref.current === "dark",
          prefs.custom_theme_overrides ??
            DEFAULT_PREFERENCES.custom_theme_overrides,
        );
      }

      document.documentElement.style.setProperty(
        "--font-sans",
        get_font_stack(prefs.font_choice ?? DEFAULT_PREFERENCES.font_choice),
      );

      const root = document.documentElement;

      root.classList.toggle("reduce-motion", prefs.reduce_motion ?? false);
      root.classList.toggle("compact-mode", prefs.compact_mode ?? false);

      const email_scale = normalize_font_size_scale(prefs.font_size_scale);

      root.style.setProperty(
        "--font-scale",
        String(email_scale / FONT_SIZE_DEFAULT),
      );
      set_preload_email_font_px(
        Math.round(14 * (email_scale / FONT_SIZE_DEFAULT)),
      );
      set_preload_email_font_stack(
        get_email_font_stack(
          prefs.email_font_choice ?? DEFAULT_PREFERENCES.email_font_choice,
          prefs.font_choice ?? DEFAULT_PREFERENCES.font_choice,
        ),
      );

      root.classList.toggle("high-contrast", prefs.high_contrast ?? false);
      root.classList.toggle(
        "reduce-transparency",
        prefs.reduce_transparency ?? false,
      );
      root.classList.toggle("link-underlines", prefs.link_underlines ?? false);
      root.classList.toggle("dyslexia-font", prefs.dyslexia_font ?? false);
      root.classList.toggle("text-spacing", prefs.text_spacing ?? false);
    },
    [],
  );

  return {
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
    save_retry_timer,
    latest_prefs_ref,
    is_saving_ref,
    beacon_payload_ref,
    do_save,
    flush_save,
    schedule_save,
    update_preference,
    update_preferences,
    reset_to_defaults,
    reset_section,
    apply_visual_preferences,
  };
}
