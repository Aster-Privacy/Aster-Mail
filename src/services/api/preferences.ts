import type { EncryptedVault } from "@/services/crypto/key_manager";
import type { EmailCategory } from "@/types/email";

import { api_client } from "./client";

import { STORAGE_KEYS } from "@/constants/storage_keys";
import { sync_client, sync_get_preferences } from "@/services/sync_client";

export interface UserPreferences {
  theme: "light" | "dark" | "auto";
  language: string;
  time_zone: string;
  date_format: string;
  time_format: "12h" | "24h";
  auto_save_drafts: boolean;
  density: string;
  show_profile_pictures: boolean;
  show_email_preview: boolean;
  default_send_mode: string;
  undo_send_period: string;
  undo_send_enabled: boolean;
  undo_send_seconds: number;
  conversation_view: boolean;
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
  skip_logout_confirmation: boolean;
  split_pane_width: number;
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
  categories_enabled: boolean;
  default_category_view: EmailCategory | "all";
}

export async function sync_quiet_hours_to_server(
  enabled: boolean,
  start_time: string,
  end_time: string,
): Promise<void> {
  try {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    await api_client.put("/sync/quiet-hours", {
      enabled,
      start_time,
      end_time,
      timezone,
    });
  } catch {}
}

interface GetPreferencesApiResponse {
  encrypted_preferences: string | null;
  preferences_nonce: string | null;
}

interface SavePreferencesApiResponse {
  success: boolean;
}

async function derive_preferences_key(
  vault: EncryptedVault,
): Promise<CryptoKey> {
  const key_material = new TextEncoder().encode(
    vault.identity_key + "astermail-preferences-v1",
  );
  const hash = await crypto.subtle.digest("SHA-256", key_material);

  return crypto.subtle.importKey(
    "raw",
    hash,
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

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: nonce_data },
    key,
    encrypted_data,
  );

  return JSON.parse(new TextDecoder().decode(decrypted));
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  theme: "auto",
  language: "English",
  time_zone: "UTC-5 (Eastern)",
  date_format: "MM/DD/YYYY",
  time_format: "12h",
  auto_save_drafts: true,
  density: "Comfortable",
  show_profile_pictures: true,
  show_email_preview: true,
  default_send_mode: "Send",
  undo_send_period: "3 seconds",
  undo_send_enabled: true,
  undo_send_seconds: 3,
  conversation_view: true,
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
  encrypt_emails: true,
  warn_external_recipients: true,
  auto_discover_keys: true,
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
  load_remote_images: "ask",
  skip_logout_confirmation: false,
  split_pane_width: 500,
  contacts_pane_width: 400,
  session_timeout_enabled: true,
  session_timeout_minutes: 30,
  forward_secrecy_enabled: false,
  key_rotation_hours: 168,
  key_history_limit: 0,
  accent_color: "#3b82f6",
  accent_color_hover: "#2563eb",
  reduce_motion: false,
  compact_mode: false,
  categories_enabled: true,
  default_category_view: "all",
};

async function get_preferences_via_http(
  vault: EncryptedVault,
): Promise<UserPreferences> {
  try {
    const response =
      await api_client.get<GetPreferencesApiResponse>("/preferences");

    if (response.error || !response.data) {
      return DEFAULT_PREFERENCES;
    }

    const { encrypted_preferences, preferences_nonce } = response.data;

    if (!encrypted_preferences || !preferences_nonce) {
      return DEFAULT_PREFERENCES;
    }

    return await decrypt_preferences(
      encrypted_preferences,
      preferences_nonce,
      vault,
    );
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

async function save_preferences_via_http(
  preferences: UserPreferences,
  vault: EncryptedVault,
): Promise<boolean> {
  const { encrypted, nonce } = await encrypt_preferences(preferences, vault);

  const response = await api_client.put<SavePreferencesApiResponse>(
    "/preferences",
    {
      encrypted_preferences: encrypted,
      preferences_nonce: nonce,
    },
  );

  return !response.error && response.data?.success === true;
}

export async function get_preferences(
  vault: EncryptedVault | null,
): Promise<{ data: UserPreferences }> {
  if (!vault) {
    return { data: DEFAULT_PREFERENCES };
  }

  try {
    let preferences: UserPreferences | null = null;
    let sync_succeeded = false;

    if (sync_client.is_connected()) {
      try {
        const sync_result = await sync_get_preferences<UserPreferences | null>(
          vault,
          null,
        );

        if (sync_result !== null) {
          preferences = sync_result;
          sync_succeeded = true;
        }
      } catch {
        preferences = null;
      }
    }

    if (!sync_succeeded) {
      preferences = await get_preferences_via_http(vault);
    }

    const merged = { ...DEFAULT_PREFERENCES, ...preferences };

    return { data: merged };
  } catch {
    return { data: DEFAULT_PREFERENCES };
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

interface GetDevModeApiResponse {
  encrypted_dev_mode: string | null;
  dev_mode_nonce: string | null;
}

interface SaveDevModeApiResponse {
  success: boolean;
}

async function derive_dev_mode_key(vault: EncryptedVault): Promise<CryptoKey> {
  const key_material = new TextEncoder().encode(
    vault.identity_key + "astermail-devmode-v1",
  );
  const hash = await crypto.subtle.digest("SHA-256", key_material);

  return crypto.subtle.importKey(
    "raw",
    hash,
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

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: nonce_data },
    key,
    encrypted_data,
  );

  const result = JSON.parse(new TextDecoder().decode(decrypted));

  return result.enabled === true;
}

export async function get_dev_mode(
  vault: EncryptedVault | null,
): Promise<{ data: boolean }> {
  if (!vault) {
    const local = localStorage.getItem(STORAGE_KEYS.DEV_MODE);

    return { data: local === "true" };
  }

  try {
    const response = await api_client.get<GetDevModeApiResponse>(
      "/preferences/dev-mode",
    );

    if (response.error || !response.data) {
      const local = localStorage.getItem(STORAGE_KEYS.DEV_MODE);

      return { data: local === "true" };
    }

    const { encrypted_dev_mode, dev_mode_nonce } = response.data;

    if (!encrypted_dev_mode || !dev_mode_nonce) {
      const local = localStorage.getItem(STORAGE_KEYS.DEV_MODE);

      return { data: local === "true" };
    }

    const enabled = await decrypt_dev_mode(
      encrypted_dev_mode,
      dev_mode_nonce,
      vault,
    );

    return { data: enabled };
  } catch {
    const local = localStorage.getItem(STORAGE_KEYS.DEV_MODE);

    return { data: local === "true" };
  }
}

export async function save_dev_mode(
  enabled: boolean,
  vault: EncryptedVault,
): Promise<{ data: { success: boolean } }> {
  localStorage.setItem(STORAGE_KEYS.DEV_MODE, enabled ? "true" : "false");

  try {
    const { encrypted, nonce } = await encrypt_dev_mode(enabled, vault);

    const response = await api_client.put<SaveDevModeApiResponse>(
      "/preferences/dev-mode",
      {
        encrypted_dev_mode: encrypted,
        dev_mode_nonce: nonce,
      },
    );

    return {
      data: { success: !response.error && response.data?.success === true },
    };
  } catch {
    return { data: { success: true } };
  }
}
