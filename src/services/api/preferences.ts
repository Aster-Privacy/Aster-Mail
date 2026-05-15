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
import type { EncryptedVault } from "@/services/crypto/key_manager";
import { decrypt_aes_gcm_with_fallback } from "@/services/crypto/legacy_keks";

import { api_client } from "./client";

const HASH_ALG = ["SHA", "256"].join("-");

export interface UserPreferences {
  theme: "light" | "dark";
  language: string;
  time_zone: string;
  date_format: string;
  time_format: "12h" | "24h";
  auto_save_drafts: boolean;
  auto_save_recent_recipients: boolean;
  density: string;
  show_profile_pictures: boolean;
  show_email_preview: boolean;
  default_send_mode: string;
  undo_send_period: string;
  undo_send_enabled: boolean;
  undo_send_seconds: number;
  auto_advance: string;
  smart_reply: boolean;
  desktop_notifications: boolean;
  sound: boolean;
  badge_count: boolean;
  push_notifications: boolean;
  notify_new_email: boolean;
  notify_replies: boolean;
  notify_mentions: boolean;
  quiet_hours_enabled: boolean;
  quiet_hours_start: string;
  quiet_hours_end: string;
  two_factor_auth: boolean;
  show_read_receipts: boolean;
  block_external_images: boolean;
  encrypt_emails: boolean;
  warn_external_recipients: boolean;
  auto_discover_keys: boolean;
  require_encryption: boolean;
  show_encryption_indicators: boolean;
  publish_to_wkd: boolean;
  publish_to_keyservers: boolean;
  signature_mode: "disabled" | "auto" | "manual";
  signature_placement: "below" | "above";
  default_signature_id: string | null;
  profile_color: string;
  email_view_mode: "popup" | "split" | "fullpage";
  keyboard_shortcuts_enabled: boolean;
  confirm_before_delete: boolean;
  confirm_before_archive: boolean;
  confirm_before_spam: boolean;
  mark_as_read_delay: "immediate" | "1_second" | "3_seconds" | "never";
  reading_pane_position: "right" | "bottom" | "hidden";
  default_reply_behavior: "reply" | "reply_all";
  load_remote_images: "always" | "ask" | "never";
  block_external_content: boolean;
  external_content_blocking_mode: "trackers" | "images" | "both";
  block_remote_images: boolean;
  block_remote_fonts: boolean;
  block_remote_css: boolean;
  block_tracking_pixels: boolean;
  show_tracking_protection: boolean;
  skip_logout_confirmation: boolean;
  skip_draft_delete_confirmation: boolean;
  split_pane_width: number;
  split_pane_height: number;
  contacts_pane_width: number;
  session_timeout_enabled: boolean;
  session_timeout_minutes: number;
  forward_secrecy_enabled: boolean;
  key_rotation_hours: number;
  key_history_limit: number;
  accent_color: string;
  accent_color_hover: string;
  reduce_motion: boolean;
  compact_mode: boolean;
  font_size_scale: number;
  high_contrast: boolean;
  reduce_transparency: boolean;
  link_underlines: boolean;
  dyslexia_font: boolean;
  text_spacing: boolean;
  color_vision_mode:
    | "none"
    | "protanopia"
    | "deuteranopia"
    | "tritanopia"
    | "achromatopsia";
  external_link_warning_dismissed: boolean;
  notification_banner_dismissed: boolean;
  biometric_app_lock_enabled: boolean;
  biometric_send_enabled: boolean;
  biometric_settings_enabled: boolean;
  haptic_enabled: boolean;
  compose_mode: "rich_text" | "plain_text";
  protected_folder_lock_mode: "session" | "on_leave";
  mobile_toolbar_actions: string[];
  swipe_left_action: string;
  swipe_right_action: string;
  sidebar_more_collapsed: boolean;
  sidebar_folders_collapsed: boolean;
  sidebar_labels_collapsed: boolean;
  sidebar_aliases_collapsed: boolean;
  sidebar_width: number;
  notification_banner_snooze_until: string;
  storage_format: "aster" | "ipfs";
  force_dark_mode_emails: boolean;
  conversation_grouping: boolean;
  conversation_order: "asc" | "desc";
  show_message_size: boolean;
  show_badges_in_signature: boolean;
  show_aster_branding: boolean;
  viewer_toolbar_mode: "simple" | "advanced";
  migration_haptic_v1_done: boolean;
  migration_tracker_blocking_v2_done: boolean;
}

export async function sync_quiet_hours_to_server(
  enabled: boolean,
  start_time: string,
  end_time: string,
): Promise<void> {
  try {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    await api_client.put("/sync/v1/quiet-hours", {
      enabled,
      start_time,
      end_time,
      timezone,
    });
  } catch (e) {
    if (import.meta.env.DEV) console.error(e);
  }
}

interface GetPreferencesApiResponse {
  encrypted_preferences: string | null;
  preferences_nonce: string | null;
}

interface SavePreferencesApiResponse {
  success: boolean;
}

export async function derive_preferences_key_raw(
  identity_key: string,
): Promise<Uint8Array> {
  const key_material = new TextEncoder().encode(
    identity_key + "astermail-preferences-v1",
  );
  const hash = await crypto.subtle.digest(HASH_ALG, key_material);

  return new Uint8Array(hash);
}

async function derive_preferences_key(
  vault: EncryptedVault,
): Promise<CryptoKey> {
  const raw = await derive_preferences_key_raw(vault.identity_key);

  return crypto.subtle.importKey(
    "raw",
    raw,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function encrypt_preferences(
  preferences: UserPreferences,
  vault: EncryptedVault,
): Promise<{ encrypted: string; nonce: string }> {
  const key = await derive_preferences_key(vault);
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(JSON.stringify(preferences));

  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    key,
    data,
  );

  return {
    encrypted: btoa(String.fromCharCode(...new Uint8Array(encrypted))),
    nonce: btoa(String.fromCharCode(...nonce)),
  };
}

async function decrypt_preferences(
  encrypted: string,
  nonce: string,
  vault: EncryptedVault,
): Promise<UserPreferences> {
  const key = await derive_preferences_key(vault);
  const encrypted_data = Uint8Array.from(atob(encrypted), (c) =>
    c.charCodeAt(0),
  );
  const nonce_data = Uint8Array.from(atob(nonce), (c) => c.charCodeAt(0));

  const decrypted = await decrypt_aes_gcm_with_fallback(key, encrypted_data, nonce_data);

  return JSON.parse(new TextDecoder().decode(decrypted));
}

const PREFS_CACHE_KEY = "aster_preferences_cache";
const MIGRATION_FLAGS_KEY = "aster_pref_migrations_done";

type MigrationFlag =
  | "migration_haptic_v1_done"
  | "migration_tracker_blocking_v2_done";

function read_local_migration_flag(flag: MigrationFlag): boolean {
  try {
    const raw = localStorage.getItem(MIGRATION_FLAGS_KEY);

    if (!raw) return false;
    const parsed = JSON.parse(raw);

    return parsed?.[flag] === true;
  } catch {
    return false;
  }
}

function write_local_migration_flag(flag: MigrationFlag): void {
  try {
    const raw = localStorage.getItem(MIGRATION_FLAGS_KEY);
    const state = raw ? JSON.parse(raw) : {};

    state[flag] = true;
    localStorage.setItem(MIGRATION_FLAGS_KEY, JSON.stringify(state));
  } catch {}
}

export function cache_preferences_locally(prefs: UserPreferences): void {
  try {
    localStorage.setItem(PREFS_CACHE_KEY, JSON.stringify(prefs));
  } catch {}
}

export function get_cached_preferences(): UserPreferences | null {
  try {
    const cached = localStorage.getItem(PREFS_CACHE_KEY);

    if (cached) {
      const parsed = JSON.parse(cached) as UserPreferences;

      return { ...DEFAULT_PREFERENCES, ...parsed };
    }
  } catch {}

  return null;
}

const SIDEBAR_CACHE_KEY = "aster_sidebar_state";

export function get_cached_sidebar_state(key: string): boolean {
  try {
    const cached = localStorage.getItem(SIDEBAR_CACHE_KEY);

    if (cached) {
      const parsed = JSON.parse(cached);

      if (typeof parsed[key] === "boolean") return parsed[key];
    }
  } catch {}

  return false;
}

export function cache_sidebar_state(key: string, value: boolean): void {
  try {
    const cached = localStorage.getItem(SIDEBAR_CACHE_KEY);
    const state = cached ? JSON.parse(cached) : {};

    state[key] = value;
    localStorage.setItem(SIDEBAR_CACHE_KEY, JSON.stringify(state));
  } catch {}
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  theme: "light",
  language: "English",
  time_zone: "UTC-5 (Eastern)",
  date_format: "MM/DD/YYYY",
  time_format: "12h",
  auto_save_drafts: true,
  auto_save_recent_recipients: true,
  density: "Comfortable",
  show_profile_pictures: true,
  show_email_preview: true,
  default_send_mode: "Send",
  undo_send_period: "10 seconds",
  undo_send_enabled: true,
  undo_send_seconds: 10,
  auto_advance: "Go to next message",
  smart_reply: true,
  desktop_notifications: false,
  sound: true,
  badge_count: true,
  push_notifications: true,
  notify_new_email: true,
  notify_replies: true,
  notify_mentions: true,
  quiet_hours_enabled: false,
  quiet_hours_start: "22:00",
  quiet_hours_end: "07:00",
  two_factor_auth: true,
  show_read_receipts: false,
  block_external_images: false,
  encrypt_emails: false,
  warn_external_recipients: true,
  auto_discover_keys: false,
  require_encryption: false,
  show_encryption_indicators: true,
  publish_to_wkd: false,
  publish_to_keyservers: false,
  signature_mode: "auto",
  signature_placement: "below",
  default_signature_id: null,
  profile_color: "#3b82f6",
  email_view_mode: "split",
  keyboard_shortcuts_enabled: true,
  confirm_before_delete: false,
  confirm_before_archive: false,
  confirm_before_spam: false,
  mark_as_read_delay: "immediate",
  reading_pane_position: "right",
  default_reply_behavior: "reply",
  load_remote_images: "never",
  block_external_content: true,
  external_content_blocking_mode: "both",
  block_remote_images: true,
  block_remote_fonts: true,
  block_remote_css: true,
  block_tracking_pixels: true,
  show_tracking_protection: true,
  skip_logout_confirmation: false,
  skip_draft_delete_confirmation: false,
  split_pane_width: 0,
  split_pane_height: 0,
  contacts_pane_width: 400,
  session_timeout_enabled: false,
  session_timeout_minutes: 30,
  forward_secrecy_enabled: false,
  key_rotation_hours: 168,
  key_history_limit: 0,
  accent_color: "#3b82f6",
  accent_color_hover: "#2563eb",
  reduce_motion: false,
  compact_mode: false,
  font_size_scale: 15,
  high_contrast: false,
  reduce_transparency: false,
  link_underlines: false,
  dyslexia_font: false,
  text_spacing: false,
  color_vision_mode: "none",
  external_link_warning_dismissed: false,
  notification_banner_dismissed: false,
  biometric_app_lock_enabled: false,
  biometric_send_enabled: false,
  biometric_settings_enabled: false,
  haptic_enabled: true,
  compose_mode: "rich_text",
  protected_folder_lock_mode: "session",
  mobile_toolbar_actions: ["trash", "star"],
  swipe_left_action: "archive",
  swipe_right_action: "toggle_read",
  sidebar_more_collapsed: false,
  sidebar_folders_collapsed: false,
  sidebar_labels_collapsed: false,
  sidebar_aliases_collapsed: false,
  sidebar_width: 256,
  notification_banner_snooze_until: "",
  storage_format: "aster",
  force_dark_mode_emails: false,
  conversation_grouping: true,
  conversation_order: "asc",
  show_message_size: false,
  show_badges_in_signature: true,
  show_aster_branding: true,
  viewer_toolbar_mode: "simple",
  migration_haptic_v1_done: false,
  migration_tracker_blocking_v2_done: false,
};

type GetPreferencesViaHttpResult = UserPreferences | "not_found" | null;

async function get_preferences_via_http(
  vault: EncryptedVault,
): Promise<GetPreferencesViaHttpResult> {
  let response;

  try {
    response = await api_client.get<GetPreferencesApiResponse>(
      "/settings/v1/preferences",
    );
  } catch {
    return null;
  }

  if (response.error || !response.data) {
    return null;
  }

  const { encrypted_preferences, preferences_nonce } = response.data;

  if (!encrypted_preferences || !preferences_nonce) {
    return "not_found";
  }

  try {
    return await decrypt_preferences(
      encrypted_preferences,
      preferences_nonce,
      vault,
    );
  } catch {
    return null;
  }
}

async function save_preferences_via_http(
  preferences: UserPreferences,
  vault: EncryptedVault,
): Promise<boolean> {
  const { encrypted, nonce } = await encrypt_preferences(preferences, vault);

  const response = await api_client.put<SavePreferencesApiResponse>(
    "/settings/v1/preferences",
    {
      encrypted_preferences: encrypted,
      preferences_nonce: nonce,
    },
  );

  return !response.error && response.data?.success === true;
}

export async function get_preferences(
  vault: EncryptedVault | null,
): Promise<{ data: UserPreferences; loaded_from_server: boolean }> {
  if (!vault) {
    return { data: DEFAULT_PREFERENCES, loaded_from_server: false };
  }

  try {
    const result = await get_preferences_via_http(vault);

    if (result === "not_found") {
      const initial: UserPreferences = {
        ...DEFAULT_PREFERENCES,
        migration_haptic_v1_done: true,
        migration_tracker_blocking_v2_done: true,
      };
      const saved = await save_preferences_via_http(initial, vault).catch(
        () => false,
      );

      if (saved) {
        write_local_migration_flag("migration_haptic_v1_done");
        write_local_migration_flag("migration_tracker_blocking_v2_done");

        return { data: initial, loaded_from_server: true };
      }

      return { data: DEFAULT_PREFERENCES, loaded_from_server: false };
    }

    if (!result) {
      return { data: DEFAULT_PREFERENCES, loaded_from_server: false };
    }

    const preferences = result;

    const cleaned = Object.fromEntries(
      Object.entries(preferences as unknown as Record<string, unknown>).filter(
        ([, v]) => v !== undefined && v !== null,
      ),
    );
    let merged = { ...DEFAULT_PREFERENCES, ...cleaned } as UserPreferences;

    const raw = preferences as unknown as Record<string, unknown>;

    if (raw.block_external_content === undefined) {
      if (
        raw.load_remote_images !== undefined &&
        preferences.load_remote_images === "always" &&
        raw.block_tracking_pixels === undefined
      ) {
        merged.block_external_content = false;
      } else {
        merged.block_external_content = true;
      }
    }

    if (raw.external_content_blocking_mode === undefined) {
      if (!merged.block_external_content) {
        merged.external_content_blocking_mode = "trackers";
      } else if (merged.block_remote_images && merged.block_tracking_pixels) {
        merged.external_content_blocking_mode = "both";
      } else if (merged.block_remote_images) {
        merged.external_content_blocking_mode = "images";
      } else {
        merged.external_content_blocking_mode = "trackers";
      }
    }

    let needs_migration_save = false;

    if (
      !merged.migration_haptic_v1_done &&
      !read_local_migration_flag("migration_haptic_v1_done")
    ) {
      merged.haptic_enabled = true;
      merged.migration_haptic_v1_done = true;
      write_local_migration_flag("migration_haptic_v1_done");
      needs_migration_save = true;
    } else if (!merged.migration_haptic_v1_done) {
      merged.migration_haptic_v1_done = true;
      needs_migration_save = true;
    }

    if (
      !merged.migration_tracker_blocking_v2_done &&
      !read_local_migration_flag("migration_tracker_blocking_v2_done")
    ) {
      merged.block_external_content = true;
      merged.external_content_blocking_mode = "both";
      merged.block_remote_images = true;
      merged.block_tracking_pixels = true;
      merged.block_remote_fonts = true;
      merged.block_remote_css = true;
      merged.load_remote_images = "never";
      merged.migration_tracker_blocking_v2_done = true;
      write_local_migration_flag("migration_tracker_blocking_v2_done");
      needs_migration_save = true;
    } else if (!merged.migration_tracker_blocking_v2_done) {
      merged.migration_tracker_blocking_v2_done = true;
      needs_migration_save = true;
    }

    if (needs_migration_save) {
      const ok = await save_preferences_via_http(merged, vault).catch(
        () => false,
      );

      if (!ok) {
        save_preferences_via_http(merged, vault).catch(() => {});
      }
    }

    return { data: merged, loaded_from_server: true };
  } catch {
    return { data: DEFAULT_PREFERENCES, loaded_from_server: false };
  }
}

export async function save_preferences(
  preferences: UserPreferences,
  vault: EncryptedVault,
): Promise<{ data: { success: boolean } }> {
  try {
    const success = await save_preferences_via_http(preferences, vault);

    return { data: { success } };
  } catch {
    return { data: { success: false } };
  }
}

export async function prepare_preferences_payload(
  preferences: UserPreferences,
  vault: EncryptedVault,
): Promise<{ encrypted: string; nonce: string } | null> {
  try {
    const { encrypted, nonce } = await encrypt_preferences(preferences, vault);

    return { encrypted, nonce };
  } catch {
    return null;
  }
}

interface GetDevModeApiResponse {
  encrypted_dev_mode: string | null;
  dev_mode_nonce: string | null;
}

interface SaveDevModeApiResponse {
  success: boolean;
}

export async function derive_dev_mode_key_raw(
  identity_key: string,
): Promise<Uint8Array> {
  const key_material = new TextEncoder().encode(
    identity_key + "astermail-devmode-v1",
  );
  const hash = await crypto.subtle.digest(HASH_ALG, key_material);

  return new Uint8Array(hash);
}

async function derive_dev_mode_key(vault: EncryptedVault): Promise<CryptoKey> {
  const raw = await derive_dev_mode_key_raw(vault.identity_key);

  return crypto.subtle.importKey(
    "raw",
    raw,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function encrypt_dev_mode(
  enabled: boolean,
  vault: EncryptedVault,
): Promise<{ encrypted: string; nonce: string }> {
  const key = await derive_dev_mode_key(vault);
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(
    JSON.stringify({ enabled, timestamp: Date.now() }),
  );

  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    key,
    data,
  );

  return {
    encrypted: btoa(String.fromCharCode(...new Uint8Array(encrypted))),
    nonce: btoa(String.fromCharCode(...nonce)),
  };
}

async function decrypt_dev_mode(
  encrypted: string,
  nonce: string,
  vault: EncryptedVault,
): Promise<boolean> {
  const key = await derive_dev_mode_key(vault);
  const encrypted_data = Uint8Array.from(atob(encrypted), (c) =>
    c.charCodeAt(0),
  );
  const nonce_data = Uint8Array.from(atob(nonce), (c) => c.charCodeAt(0));

  const decrypted = await decrypt_aes_gcm_with_fallback(key, encrypted_data, nonce_data);

  const result = JSON.parse(new TextDecoder().decode(decrypted));

  return result.enabled === true;
}

export async function get_dev_mode(
  vault: EncryptedVault | null,
): Promise<{ data: boolean }> {
  if (!vault) {
    return { data: false };
  }

  try {
    const response = await api_client.get<GetDevModeApiResponse>(
      "/settings/v1/preferences/dev-mode",
    );

    if (response.error || !response.data) {
      return { data: false };
    }

    const { encrypted_dev_mode, dev_mode_nonce } = response.data;

    if (!encrypted_dev_mode || !dev_mode_nonce) {
      return { data: false };
    }

    const enabled = await decrypt_dev_mode(
      encrypted_dev_mode,
      dev_mode_nonce,
      vault,
    );

    return { data: enabled };
  } catch {
    return { data: false };
  }
}

export async function save_dev_mode(
  enabled: boolean,
  vault: EncryptedVault,
): Promise<{ data: { success: boolean } }> {
  try {
    const { encrypted, nonce } = await encrypt_dev_mode(enabled, vault);

    const response = await api_client.put<SaveDevModeApiResponse>(
      "/settings/v1/preferences/dev-mode",
      {
        encrypted_dev_mode: encrypted,
        dev_mode_nonce: nonce,
      },
    );

    return {
      data: { success: !response.error && response.data?.success === true },
    };
  } catch {
    return { data: { success: false } };
  }
}

export interface SpamSettings {
  spam_retention_days: number;
  spam_sensitivity: string;
  spam_filter_enabled: boolean;
}

export async function get_spam_settings(): Promise<{
  data: SpamSettings | null;
}> {
  try {
    const response = await api_client.get<SpamSettings>(
      "/settings/v1/preferences/spam",
    );

    if (response.error || !response.data) {
      return { data: null };
    }

    return { data: response.data };
  } catch {
    return { data: null };
  }
}

export async function save_spam_settings(
  settings: SpamSettings,
): Promise<{ data: { success: boolean } }> {
  try {
    const response = await api_client.put<{ success: boolean }>(
      "/settings/v1/preferences/spam",
      settings,
    );

    return {
      data: { success: !response.error && response.data?.success === true },
    };
  } catch {
    return { data: { success: false } };
  }
}
