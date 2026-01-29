import { useRef, useState } from "react";
import {
  ArrowDownTrayIcon,
  ArrowUpTrayIcon,
  CheckIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";

import { Button } from "@/components/ui/button";
import { use_preferences } from "@/contexts/preferences_context";
import {
  DEFAULT_PREFERENCES,
  type UserPreferences,
} from "@/services/api/preferences";

type ImportStatus = "idle" | "success" | "error";

const PREFERENCE_VALIDATORS: Record<
  keyof UserPreferences,
  (value: unknown) => boolean
> = {
  theme: (v) => v === "light" || v === "dark" || v === "auto",
  language: (v) => typeof v === "string" && v.length > 0,
  time_zone: (v) => typeof v === "string",
  date_format: (v) => typeof v === "string",
  time_format: (v) => v === "12h" || v === "24h",
  auto_save_drafts: (v) => typeof v === "boolean",
  density: (v) => typeof v === "string",
  show_profile_pictures: (v) => typeof v === "boolean",
  show_email_preview: (v) => typeof v === "boolean",
  default_send_mode: (v) => typeof v === "string",
  undo_send_period: (v) => typeof v === "string",
  undo_send_enabled: (v) => typeof v === "boolean",
  undo_send_seconds: (v) => typeof v === "number" && v >= 0 && v <= 30,
  conversation_view: (v) => typeof v === "boolean",
  auto_advance: (v) => typeof v === "string",
  smart_reply: (v) => typeof v === "boolean",
  desktop_notifications: (v) => typeof v === "boolean",
  sound: (v) => typeof v === "boolean",
  badge_count: (v) => typeof v === "boolean",
  push_notifications: (v) => typeof v === "boolean",
  notify_new_email: (v) => typeof v === "boolean",
  notify_replies: (v) => typeof v === "boolean",
  notify_mentions: (v) => typeof v === "boolean",
  quiet_hours_enabled: (v) => typeof v === "boolean",
  quiet_hours_start: (v) => typeof v === "string" && /^\d{2}:\d{2}$/.test(v),
  quiet_hours_end: (v) => typeof v === "string" && /^\d{2}:\d{2}$/.test(v),
  two_factor_auth: (v) => typeof v === "boolean",
  show_read_receipts: (v) => typeof v === "boolean",
  block_external_images: (v) => typeof v === "boolean",
  encrypt_emails: (v) => typeof v === "boolean",
  warn_external_recipients: (v) => typeof v === "boolean",
  signature_mode: (v) => v === "disabled" || v === "auto" || v === "manual",
  signature_placement: (v) => v === "below" || v === "above",
  default_signature_id: (v) => v === null || typeof v === "string",
  profile_color: (v) => typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v),
  email_view_mode: (v) => v === "popup" || v === "split" || v === "fullpage",
  keyboard_shortcuts_enabled: (v) => typeof v === "boolean",
  confirm_before_delete: (v) => typeof v === "boolean",
  confirm_before_archive: (v) => typeof v === "boolean",
  confirm_before_spam: (v) => typeof v === "boolean",
  mark_as_read_delay: (v) =>
    v === "immediate" || v === "1_second" || v === "3_seconds" || v === "never",
  reading_pane_position: (v) =>
    v === "right" || v === "bottom" || v === "hidden",
  default_reply_behavior: (v) => v === "reply" || v === "reply_all",
  load_remote_images: (v) => v === "always" || v === "ask" || v === "never",
  skip_logout_confirmation: (v) => typeof v === "boolean",
  split_pane_width: (v) => typeof v === "number" && v >= 200 && v <= 1200,
  contacts_pane_width: (v) => typeof v === "number" && v >= 200 && v <= 800,
  session_timeout_enabled: (v) => typeof v === "boolean",
  session_timeout_minutes: (v) => typeof v === "number" && v >= 1 && v <= 480,
  forward_secrecy_enabled: (v) => typeof v === "boolean",
  key_rotation_hours: (v) => typeof v === "number" && v >= 1 && v <= 8760,
  key_history_limit: (v) => typeof v === "number" && v >= 0 && v <= 100,
  accent_color: (v) => typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v),
  accent_color_hover: (v) =>
    typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v),
  reduce_motion: (v) => typeof v === "boolean",
  compact_mode: (v) => typeof v === "boolean",
  categories_enabled: (v) => typeof v === "boolean",
  default_category_view: (v) =>
    v === "all" ||
    v === "primary" ||
    v === "social" ||
    v === "promotions" ||
    v === "updates" ||
    v === "forums" ||
    v === "purchases",
};

function validate_preferences(data: unknown): {
  valid: boolean;
  sanitized: Partial<UserPreferences>;
} {
  if (typeof data !== "object" || data === null) {
    return { valid: false, sanitized: {} };
  }

  const valid_keys = Object.keys(
    DEFAULT_PREFERENCES,
  ) as (keyof UserPreferences)[];
  const sanitized: Partial<UserPreferences> = {};
  let has_valid_fields = false;

  for (const key of valid_keys) {
    if (key in data) {
      const value = (data as Record<string, unknown>)[key];
      const validator = PREFERENCE_VALIDATORS[key];

      if (validator && validator(value)) {
        (sanitized as Record<string, unknown>)[key] = value;
        has_valid_fields = true;
      }
    }
  }

  return { valid: has_valid_fields, sanitized };
}

export function SettingsExportImport() {
  const { preferences, update_preferences } = use_preferences();
  const [import_status, set_import_status] = useState<ImportStatus>("idle");
  const [error_message, set_error_message] = useState("");
  const file_input_ref = useRef<HTMLInputElement>(null);

  const handle_export = () => {
    const data = JSON.stringify(preferences, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");

    link.href = url;
    link.download = `aster-mail-settings-${new Date().toISOString().split("T")[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handle_import_click = () => {
    file_input_ref.current?.click();
  };

  const handle_file_change = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];

    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const { valid, sanitized } = validate_preferences(data);

      if (!valid) {
        set_error_message(
          "Invalid settings file format or no valid preferences found",
        );
        set_import_status("error");

        return;
      }

      update_preferences(sanitized);
      set_import_status("success");
      set_error_message("");

      setTimeout(() => {
        set_import_status("idle");
      }, 3000);
    } catch {
      set_error_message("Failed to parse settings file");
      set_import_status("error");
    }

    if (file_input_ref.current) {
      file_input_ref.current.value = "";
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h4
          className="text-sm font-medium mb-1"
          style={{ color: "var(--text-primary)" }}
        >
          Export & Import Settings
        </h4>
        <p className="text-xs mb-4" style={{ color: "var(--text-muted)" }}>
          Backup your settings or transfer them to another account
        </p>

        <div className="flex items-center gap-3">
          <Button type="button" variant="primary" onClick={handle_export}>
            <ArrowDownTrayIcon className="w-4 h-4" />
            Export Settings
          </Button>

          <Button
            type="button"
            variant="secondary"
            onClick={handle_import_click}
          >
            <ArrowUpTrayIcon className="w-4 h-4" />
            Import Settings
          </Button>

          <input
            ref={file_input_ref}
            accept=".json"
            className="hidden"
            type="file"
            onChange={handle_file_change}
          />
        </div>
      </div>

      {import_status === "success" && (
        <div
          className="flex items-center gap-2 p-3 rounded-lg text-sm"
          style={{
            backgroundColor: "rgba(34, 197, 94, 0.1)",
            color: "var(--color-success, #22c55e)",
          }}
        >
          <CheckIcon className="w-4 h-4" />
          Settings imported successfully
        </div>
      )}

      {import_status === "error" && (
        <div
          className="flex items-center gap-2 p-3 rounded-lg text-sm"
          style={{
            backgroundColor: "rgba(239, 68, 68, 0.1)",
            color: "var(--color-error, #ef4444)",
          }}
        >
          <ExclamationTriangleIcon className="w-4 h-4" />
          {error_message}
        </div>
      )}
    </div>
  );
}
