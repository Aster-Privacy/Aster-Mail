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
import type { CustomCategoryRule } from "@/data/category_catalog";

import { api_client } from "./client";

import { HASH_ALG } from "@/services/crypto/constants";
import { decrypt_aes_gcm_with_fallback } from "@/services/crypto/legacy_keks";
import {
  DEFAULT_ENABLED_CATEGORIES,
  sanitize_custom_categories,
} from "@/data/category_catalog";
import {
  DEFAULT_INBOX_PAGE_SIZE,
  clamp_inbox_page_size,
} from "@/lib/inbox_page_size";
import { ignore_error } from "@/lib/ignore_error";
import { locale_date_format, locale_time_format } from "@/utils/date_format";
import {
  detect_browser_language,
  get_display_name,
} from "@/lib/i18n/languages";

export interface UserPreferences {
  theme: "light" | "dark" | "system";
  language: string;
  time_zone: string;
  date_format: string;
  time_format: "12h" | "24h";
  auto_save_drafts: boolean;
  auto_save_recent_recipients: boolean;
  density: string;
  mail_list_density: string;
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
  toast_position:
    | "top"
    | "bottom"
    | "top-right"
    | "bottom-right"
    | "top-left"
    | "bottom-left";
  toast_duration_ms: number;
  quiet_hours_enabled: boolean;
  quiet_hours_start: string;
  quiet_hours_end: string;
  two_factor_auth: boolean;
  show_read_receipts: boolean;
  review_prompt_web_done: boolean;
  review_prompt_android_done: boolean;
  send_read_receipts: boolean;
  block_external_images: boolean;
  encrypt_emails: boolean;
  warn_external_recipients: boolean;
  auto_discover_keys: boolean;
  require_encryption: boolean;
  obscure_subject_when_encrypted: boolean;
  show_encryption_indicators: boolean;
  publish_to_wkd: boolean;
  publish_to_keyservers: boolean;
  signature_mode: "disabled" | "auto" | "manual";
  signature_placement: "below" | "above";
  default_signature_id: string | null;
  profile_color: string;
  email_view_mode: "popup" | "split" | "fullpage";
  settings_view_mode: "fullpage" | "popup";
  keyboard_shortcuts_enabled: boolean;
  confirm_before_delete: boolean;
  confirm_before_archive: boolean;
  confirm_before_spam: boolean;
  confirm_before_quick_actions: boolean;
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
  color_theme:
    | "default"
    | "custom"
    | "purple"
    | "green"
    | "rose"
    | "orange"
    | "teal"
    | "indigo"
    | "amber"
    | "cyan"
    | "slate"
    | "aster-blue"
    | "lime"
    | "fuchsia"
    | "emerald"
    | "pink"
    | "black";
  custom_theme_seed: string;
  custom_theme_overrides: Record<string, string>;
  theme_sync_enabled_web: boolean;
  theme_web: string;
  color_theme_web: string;
  custom_theme_seed_web: string;
  theme_sync_enabled_ios?: boolean;
  theme_ios?: string;
  color_theme_ios?: string;
  custom_theme_seed_ios?: string;
  theme_sync_enabled_android?: boolean;
  theme_android?: string;
  color_theme_android?: string;
  custom_theme_seed_android?: string;
  font_choice: string;
  email_font_choice: string;
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
  account_security_banner_dismissed: boolean;
  biometric_app_lock_enabled: boolean;
  biometric_send_enabled: boolean;
  biometric_settings_enabled: boolean;
  haptic_enabled: boolean;
  compose_mode: "rich_text" | "plain_text";
  compose_font_size: "small" | "normal" | "large" | "huge";
  compose_font_color: string;
  protected_folder_lock_mode: "session" | "on_leave";
  mobile_toolbar_actions: string[];
  swipe_left_action: string;
  swipe_right_action: string;
  sidebar_more_collapsed: boolean;
  sidebar_folders_collapsed: boolean;
  sidebar_labels_collapsed: boolean;
  sidebar_aliases_collapsed: boolean;
  sidebar_minimized: boolean;
  sidebar_width: number;
  notification_banner_snooze_until: string;
  storage_format: "aster" | "ipfs";
  force_dark_mode_emails: boolean;
  conversation_grouping: boolean;
  conversation_order: "asc" | "desc";
  inbox_sort_order: "newest_first" | "oldest_first";
  inbox_categories_enabled: boolean;
  enabled_categories: string[];
  custom_categories: CustomCategoryRule[];
  show_message_size: boolean;
  show_alias_indicators: boolean;
  show_badges_in_signature: boolean;
  show_aster_branding: boolean;
  show_signature_separator: boolean;
  viewer_toolbar_mode: "simple" | "advanced";
  search_encrypted_content: boolean;
  migration_haptic_v1_done: boolean;
  migration_tracker_blocking_v2_done: boolean;
  migration_toast_position_v1_done: boolean;
  migration_viewer_toolbar_v1_done: boolean;
  migration_signature_placement_v1_done: boolean;
  html_rendering_mode: "html" | "plain_text";
  low_network_mode: boolean;
  low_network_mode_user_set: boolean;
  strip_exif_on_compose: boolean;
  thread_count_position: "left" | "right";
  compose_window_mode: "default" | "fullscreen" | "minimized";
  reactions_enabled: boolean;
  purge_locked_folder_on_delete: boolean;
  family_setup_wizard_dismissed: boolean;
  translate_incoming: "off" | "ask" | "always";
  translate_languages: string[];
  translate_never_languages: string[];
  muted_folder_tokens: string[];
  muted_notification_categories: string[];
  inbox_page_size: number;
}

const QUIET_HOURS_RETRY_DELAY_MS = 2000;

let quiet_hours_sequence = 0;
let quiet_hours_chain: Promise<unknown> = Promise.resolve();

export function sync_quiet_hours_to_server(
  enabled: boolean,
  start_time: string,
  end_time: string,
): Promise<boolean> {
  quiet_hours_sequence += 1;

  const sequence = quiet_hours_sequence;
  const run = quiet_hours_chain.then(() =>
    send_quiet_hours(sequence, enabled, start_time, end_time),
  );

  quiet_hours_chain = run.catch(() => undefined);

  return run;
}

async function send_quiet_hours(
  sequence: number,
  enabled: boolean,
  start_time: string,
  end_time: string,
): Promise<boolean> {
  if (sequence !== quiet_hours_sequence) return true;

  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const attempt = async (): Promise<boolean> => {
    try {
      const response = await api_client.put(
        "/sync/v1/quiet-hours",
        {
          enabled,
          start_time,
          end_time,
          timezone,
        },
        { skip_upgrade_prompt: true },
      );

      return !response.error;
    } catch (e) {
      if (import.meta.env.DEV) console.error(e);

      return false;
    }
  };

  if (await attempt()) return true;

  await new Promise((resolve) =>
    setTimeout(resolve, QUIET_HOURS_RETRY_DELAY_MS),
  );

  if (sequence !== quiet_hours_sequence) return true;

  return attempt();
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

  const decrypted = await decrypt_aes_gcm_with_fallback(
    key,
    encrypted_data,
    nonce_data,
  );

  return JSON.parse(new TextDecoder().decode(decrypted));
}

const PREFS_CACHE_KEY = "aster_preferences_cache";
const MIGRATION_FLAGS_KEY = "aster_pref_migrations_done";

type MigrationFlag =
  | "migration_haptic_v1_done"
  | "migration_tracker_blocking_v2_done"
  | "migration_toast_position_v1_done"
  | "migration_viewer_toolbar_v1_done"
  | "migration_signature_placement_v1_done";

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
  } catch (caught) {
    ignore_error("services/api/preferences:write_local_migration_flag", caught);
  }
}

export function cache_preferences_locally(prefs: UserPreferences): void {
  try {
    localStorage.setItem(PREFS_CACHE_KEY, JSON.stringify(prefs));
  } catch (caught) {
    ignore_error("services/api/preferences:cache_preferences_locally", caught);
  }
}

export function clear_preferences_cache(): void {
  try {
    localStorage.removeItem(PREFS_CACHE_KEY);
  } catch (caught) {
    ignore_error("services/api/preferences:clear_preferences_cache", caught);
  }
}

export function get_cached_preferences(): UserPreferences | null {
  try {
    const cached = localStorage.getItem(PREFS_CACHE_KEY);

    if (cached) {
      const parsed = JSON.parse(cached) as Record<string, unknown>;

      return build_merged_preferences(parsed, null);
    }
  } catch (caught) {
    ignore_error("services/api/preferences:get_cached_preferences", caught);
  }

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
  } catch (caught) {
    ignore_error("services/api/preferences:get_cached_sidebar_state", caught);
  }

  return false;
}

export function cache_sidebar_state(key: string, value: boolean): void {
  try {
    const cached = localStorage.getItem(SIDEBAR_CACHE_KEY);
    const state = cached ? JSON.parse(cached) : {};

    state[key] = value;
    localStorage.setItem(SIDEBAR_CACHE_KEY, JSON.stringify(state));
  } catch (caught) {
    ignore_error("services/api/preferences:cache_sidebar_state", caught);
  }
}

function default_language_label(): string {
  if (typeof navigator === "undefined") return "English";

  try {
    return get_display_name(detect_browser_language());
  } catch {
    return "English";
  }
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  theme: "dark",
  language: default_language_label(),
  time_zone: "auto",
  date_format: locale_date_format(),
  time_format: locale_time_format(),
  auto_save_drafts: true,
  auto_save_recent_recipients: true,
  density: "Comfortable",
  mail_list_density: "compact",
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
  toast_position: "bottom",
  toast_duration_ms: 2000,
  quiet_hours_enabled: false,
  quiet_hours_start: "22:00",
  quiet_hours_end: "07:00",
  two_factor_auth: true,
  show_read_receipts: false,
  review_prompt_web_done: false,
  review_prompt_android_done: false,
  send_read_receipts: false,
  block_external_images: false,
  encrypt_emails: false,
  warn_external_recipients: true,
  auto_discover_keys: false,
  require_encryption: false,
  obscure_subject_when_encrypted: false,
  show_encryption_indicators: true,
  publish_to_wkd: false,
  publish_to_keyservers: false,
  signature_mode: "auto",
  signature_placement: "above",
  default_signature_id: null,
  profile_color: "#3b82f6",
  email_view_mode: "split",
  settings_view_mode: "fullpage",
  keyboard_shortcuts_enabled: true,
  confirm_before_delete: false,
  confirm_before_archive: false,
  confirm_before_spam: false,
  confirm_before_quick_actions: true,
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
  color_theme: "default",
  custom_theme_seed: "#3b82f6",
  custom_theme_overrides: {},
  theme_sync_enabled_web: true,
  theme_web: "",
  color_theme_web: "",
  custom_theme_seed_web: "",
  font_choice: "default",
  email_font_choice: "match_app",
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
  account_security_banner_dismissed: false,
  biometric_app_lock_enabled: false,
  biometric_send_enabled: false,
  biometric_settings_enabled: false,
  haptic_enabled: true,
  compose_mode: "rich_text",
  compose_font_size: "normal",
  compose_font_color: "",
  protected_folder_lock_mode: "session",
  mobile_toolbar_actions: ["mark_read", "trash", "archive", "star"],
  swipe_left_action: "archive",
  swipe_right_action: "toggle_read",
  sidebar_more_collapsed: false,
  sidebar_folders_collapsed: false,
  sidebar_labels_collapsed: false,
  sidebar_aliases_collapsed: false,
  sidebar_minimized: false,
  sidebar_width: 256,
  notification_banner_snooze_until: "",
  storage_format: "aster",
  force_dark_mode_emails: false,
  conversation_grouping: true,
  conversation_order: "asc",
  inbox_sort_order: "newest_first",
  inbox_categories_enabled: true,
  enabled_categories: [...DEFAULT_ENABLED_CATEGORIES],
  custom_categories: [],
  show_message_size: false,
  show_alias_indicators: true,
  show_badges_in_signature: true,
  show_aster_branding: true,
  show_signature_separator: true,
  viewer_toolbar_mode: "advanced",
  search_encrypted_content: true,
  migration_haptic_v1_done: false,
  migration_tracker_blocking_v2_done: false,
  migration_toast_position_v1_done: false,
  migration_viewer_toolbar_v1_done: false,
  migration_signature_placement_v1_done: false,
  html_rendering_mode: "html",
  low_network_mode: false,
  low_network_mode_user_set: false,
  strip_exif_on_compose: true,
  thread_count_position: "left",
  compose_window_mode: "default",
  reactions_enabled: true,
  purge_locked_folder_on_delete: false,
  family_setup_wizard_dismissed: false,
  translate_incoming: "off",
  translate_languages: [],
  translate_never_languages: [],
  muted_folder_tokens: [],
  muted_notification_categories: [],
  inbox_page_size: DEFAULT_INBOX_PAGE_SIZE,
};

type GetPreferencesViaHttpResult =
  | UserPreferences
  | "not_found"
  | "decrypt_failed"
  | null;

async function get_preferences_via_http(
  vault: EncryptedVault,
  skip_cache = false,
): Promise<GetPreferencesViaHttpResult> {
  let response;

  try {
    response = await api_client.get<GetPreferencesApiResponse>(
      "/settings/v1/preferences",
      skip_cache ? { skip_cache: true } : undefined,
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
    return "decrypt_failed";
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

const LEGACY_OLDEST_FIRST = "oldest";
const SUPPORTED_DATE_FORMATS = ["MM/DD/YYYY", "DD/MM/YYYY", "YYYY-MM-DD"];
const SWIPE_ACTION_IDS = [
  "archive",
  "delete",
  "toggle_read",
  "snooze",
  "star",
  "spam",
  "none",
];
const LEGACY_SWIPE_ACTIONS: Record<string, string> = {
  trash: "delete",
  mark_read: "toggle_read",
  mark_unread: "toggle_read",
  read: "toggle_read",
  unread: "toggle_read",
};

function normalize_swipe_action(raw: unknown, fallback: string): string {
  const id = typeof raw === "string" ? raw.trim().toLowerCase() : "";

  if (id === "") return fallback;
  if (LEGACY_SWIPE_ACTIONS[id]) return LEGACY_SWIPE_ACTIONS[id];

  return SWIPE_ACTION_IDS.includes(id) ? id : fallback;
}

const NULLABLE_PREFERENCE_KEYS = new Set<string>(["default_signature_id"]);

export function build_merged_preferences(
  server: Record<string, unknown>,
  cached: UserPreferences | null,
): UserPreferences {
  const cleaned = Object.fromEntries(
    Object.entries(server).filter(
      ([key, value]) =>
        value !== undefined &&
        (value !== null || NULLABLE_PREFERENCE_KEYS.has(key)),
    ),
  );
  const merged = {
    ...DEFAULT_PREFERENCES,
    ...(cached ?? {}),
    ...cleaned,
  } as UserPreferences;

  if (
    merged.theme !== "light" &&
    merged.theme !== "dark" &&
    merged.theme !== "system"
  ) {
    merged.theme = "dark";
  }

  if (server.block_external_content === undefined) {
    if (
      server.load_remote_images !== undefined &&
      merged.load_remote_images === "always" &&
      server.block_tracking_pixels === undefined
    ) {
      merged.block_external_content = false;
    } else {
      merged.block_external_content = true;
    }
  }

  if (server.external_content_blocking_mode === undefined) {
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

  merged.custom_categories = sanitize_custom_categories(
    merged.custom_categories,
  );
  merged.enabled_categories = Array.isArray(merged.enabled_categories)
    ? merged.enabled_categories.filter((c) => typeof c === "string")
    : [...DEFAULT_ENABLED_CATEGORIES];

  if (
    merged.translate_incoming !== "off" &&
    merged.translate_incoming !== "ask" &&
    merged.translate_incoming !== "always"
  ) {
    merged.translate_incoming = "off";
  }
  merged.translate_languages = Array.isArray(merged.translate_languages)
    ? merged.translate_languages.filter((c) => typeof c === "string")
    : [];
  merged.translate_never_languages = Array.isArray(
    merged.translate_never_languages,
  )
    ? merged.translate_never_languages.filter((c) => typeof c === "string")
    : [];
  merged.muted_folder_tokens = Array.isArray(merged.muted_folder_tokens)
    ? merged.muted_folder_tokens.filter((c) => typeof c === "string")
    : [];
  merged.muted_notification_categories = Array.isArray(
    merged.muted_notification_categories,
  )
    ? merged.muted_notification_categories.filter(
        (c) => typeof c === "string" && c !== "primary",
      )
    : [];
  merged.mobile_toolbar_actions = Array.isArray(merged.mobile_toolbar_actions)
    ? merged.mobile_toolbar_actions.filter((c) => typeof c === "string")
    : [...DEFAULT_PREFERENCES.mobile_toolbar_actions];
  merged.inbox_page_size = clamp_inbox_page_size(merged.inbox_page_size);

  if (
    merged.inbox_sort_order !== "newest_first" &&
    merged.inbox_sort_order !== "oldest_first"
  ) {
    merged.inbox_sort_order =
      (merged.conversation_order as string) === LEGACY_OLDEST_FIRST
        ? "oldest_first"
        : DEFAULT_PREFERENCES.inbox_sort_order;
  }

  if (
    merged.conversation_order !== "asc" &&
    merged.conversation_order !== "desc"
  ) {
    merged.conversation_order = DEFAULT_PREFERENCES.conversation_order;
  }

  if (!SUPPORTED_DATE_FORMATS.includes(merged.date_format)) {
    merged.date_format = DEFAULT_PREFERENCES.date_format;
  }

  if (merged.time_format !== "12h" && merged.time_format !== "24h") {
    merged.time_format = DEFAULT_PREFERENCES.time_format;
  }

  merged.swipe_left_action = normalize_swipe_action(
    merged.swipe_left_action,
    DEFAULT_PREFERENCES.swipe_left_action,
  );
  merged.swipe_right_action = normalize_swipe_action(
    merged.swipe_right_action,
    DEFAULT_PREFERENCES.swipe_right_action,
  );

  return merged;
}

export async function get_preferences(
  vault: EncryptedVault | null,
  skip_cache = false,
): Promise<{
  data: UserPreferences;
  loaded_from_server: boolean;
  server_blob_unusable?: boolean;
}> {
  if (!vault) {
    return { data: DEFAULT_PREFERENCES, loaded_from_server: false };
  }

  try {
    let result = await get_preferences_via_http(vault, skip_cache);

    if (result === "not_found") {
      const confirmation = await get_preferences_via_http(vault, true);

      if (confirmation === null) {
        return { data: DEFAULT_PREFERENCES, loaded_from_server: false };
      }

      result = confirmation;
    }

    if (result === "not_found") {
      const initial: UserPreferences = {
        ...DEFAULT_PREFERENCES,
        ...(get_cached_preferences() ?? {}),
        migration_haptic_v1_done: true,
        migration_tracker_blocking_v2_done: true,
        migration_toast_position_v1_done: true,
        migration_viewer_toolbar_v1_done: true,
        migration_signature_placement_v1_done: true,
      };

      write_local_migration_flag("migration_haptic_v1_done");
      write_local_migration_flag("migration_tracker_blocking_v2_done");
      write_local_migration_flag("migration_toast_position_v1_done");
      write_local_migration_flag("migration_viewer_toolbar_v1_done");
      write_local_migration_flag("migration_signature_placement_v1_done");

      return {
        data: initial,
        loaded_from_server: true,
        server_blob_unusable: true,
      };
    }

    if (result === "decrypt_failed") {
      const cached = get_cached_preferences();

      if (cached) {
        const recovered: UserPreferences = {
          ...DEFAULT_PREFERENCES,
          ...cached,
          migration_haptic_v1_done: true,
          migration_tracker_blocking_v2_done: true,
          migration_toast_position_v1_done: true,
          migration_viewer_toolbar_v1_done: true,
          migration_signature_placement_v1_done: true,
        };

        return {
          data: recovered,
          loaded_from_server: true,
          server_blob_unusable: true,
        };
      }

      return { data: DEFAULT_PREFERENCES, loaded_from_server: false };
    }

    if (!result) {
      return { data: DEFAULT_PREFERENCES, loaded_from_server: false };
    }

    const preferences = result;

    let merged = build_merged_preferences(
      preferences as unknown as Record<string, unknown>,
      get_cached_preferences(),
    );

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

    if (
      !merged.migration_toast_position_v1_done &&
      !read_local_migration_flag("migration_toast_position_v1_done")
    ) {
      if (merged.toast_position === "bottom-right") {
        merged.toast_position = "bottom";
      }
      merged.migration_toast_position_v1_done = true;
      write_local_migration_flag("migration_toast_position_v1_done");
      needs_migration_save = true;
    } else if (!merged.migration_toast_position_v1_done) {
      merged.migration_toast_position_v1_done = true;
      needs_migration_save = true;
    }

    if (
      !merged.migration_viewer_toolbar_v1_done &&
      !read_local_migration_flag("migration_viewer_toolbar_v1_done")
    ) {
      merged.viewer_toolbar_mode = "advanced";
      merged.migration_viewer_toolbar_v1_done = true;
      write_local_migration_flag("migration_viewer_toolbar_v1_done");
      needs_migration_save = true;
    } else if (!merged.migration_viewer_toolbar_v1_done) {
      merged.migration_viewer_toolbar_v1_done = true;
      needs_migration_save = true;
    }

    if (
      !merged.migration_signature_placement_v1_done &&
      !read_local_migration_flag("migration_signature_placement_v1_done")
    ) {
      if (merged.signature_placement === "below") {
        merged.signature_placement = "above";
      }
      merged.migration_signature_placement_v1_done = true;
      write_local_migration_flag("migration_signature_placement_v1_done");
      needs_migration_save = true;
    } else if (!merged.migration_signature_placement_v1_done) {
      merged.migration_signature_placement_v1_done = true;
      needs_migration_save = true;
    }

    if (needs_migration_save) {
      const ok = await save_preferences_via_http(merged, vault).catch(
        () => false,
      );

      if (!ok) {
        save_preferences_via_http(merged, vault).catch((caught) =>
          ignore_error("services/api/preferences:get_preferences", caught),
        );
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

function preference_values_equal(left: unknown, right: unknown): boolean {
  if (left === right) return true;

  if (left === null || right === null) return false;

  if (typeof left !== "object" || typeof right !== "object") return false;

  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
}

export function reconcile_preferences(
  base: UserPreferences,
  current: UserPreferences,
  server: UserPreferences,
): UserPreferences {
  const reconciled = { ...server } as UserPreferences;

  for (const key of Object.keys(current) as (keyof UserPreferences)[]) {
    if (!preference_values_equal(current[key], base[key])) {
      (reconciled as unknown as Record<string, unknown>)[key] = current[
        key
      ] as unknown;
    }
  }

  return reconciled;
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

export {
  derive_dev_mode_key_raw,
  get_dev_mode,
  save_dev_mode,
  get_spam_settings,
  save_spam_settings,
} from "./preferences_dev_mode";
export type { SpamSettings } from "./preferences_dev_mode";
