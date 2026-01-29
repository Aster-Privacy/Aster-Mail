import { useState, useEffect } from "react";
import {
  CommandLineIcon,
  TrashIcon,
  ArchiveBoxIcon,
  ExclamationTriangleIcon,
  ClockIcon,
  ViewColumnsIcon,
  ArrowUturnLeftIcon,
  PhotoIcon,
  CodeBracketIcon,
  LockClosedIcon,
  MagnifyingGlassIcon,
  ShieldCheckIcon,
  EyeIcon,
  GlobeAltIcon,
  ServerIcon,
} from "@heroicons/react/24/outline";

import { SettingsSaveIndicatorInline } from "./settings_save_indicator";

import { use_preferences } from "@/contexts/preferences_context";
import { get_dev_mode, save_dev_mode } from "@/services/api/preferences";
import { get_vault_from_memory } from "@/services/crypto/memory_key_store";
import { show_toast } from "@/components/simple_toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface ToggleSettingProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  enabled: boolean;
  on_toggle: () => void;
}

function ToggleSetting({
  icon,
  title,
  description,
  enabled,
  on_toggle,
}: ToggleSettingProps) {
  return (
    <div
      className="flex items-center justify-between p-4 rounded-lg border transition-colors"
      style={{
        backgroundColor: "var(--bg-tertiary)",
        borderColor: "var(--border-secondary)",
      }}
    >
      <div className="flex items-center gap-4">
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: "var(--bg-secondary)" }}
        >
          {icon}
        </div>
        <div>
          <h4
            className="text-sm font-medium"
            style={{ color: "var(--text-primary)" }}
          >
            {title}
          </h4>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
            {description}
          </p>
        </div>
      </div>
      <button
        className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors"
        style={{
          backgroundColor: enabled ? "#3b82f6" : "var(--border-secondary)",
        }}
        type="button"
        onClick={on_toggle}
      >
        <span
          className={
            "inline-block h-4 w-4 rounded-full transition-transform duration-200 " +
            (enabled ? "translate-x-6" : "translate-x-1")
          }
          style={{
            backgroundColor: enabled ? "#ffffff" : "var(--bg-card)",
          }}
        />
      </button>
    </div>
  );
}

interface SelectSettingProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  value: string;
  options: { value: string; label: string }[];
  on_change: (value: string) => void;
}

function SelectSetting({
  icon,
  title,
  description,
  value,
  options,
  on_change,
}: SelectSettingProps) {
  return (
    <div
      className="flex items-center justify-between p-4 rounded-lg border transition-colors"
      style={{
        backgroundColor: "var(--bg-tertiary)",
        borderColor: "var(--border-secondary)",
      }}
    >
      <div className="flex items-center gap-4">
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: "var(--bg-secondary)" }}
        >
          {icon}
        </div>
        <div>
          <h4
            className="text-sm font-medium"
            style={{ color: "var(--text-primary)" }}
          >
            {title}
          </h4>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
            {description}
          </p>
        </div>
      </div>
      <Select value={value} onValueChange={on_change}>
        <SelectTrigger className="w-[180px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function BehaviorSection() {
  const { preferences, update_preference } = use_preferences();
  const [dev_mode_enabled, set_dev_mode_enabled] = useState(false);

  useEffect(() => {
    const load_dev_mode = async () => {
      const vault = get_vault_from_memory();
      const result = await get_dev_mode(vault);

      set_dev_mode_enabled(result.data);
    };

    load_dev_mode();
  }, []);

  const handle_dev_mode_toggle = () => {
    const new_value = !dev_mode_enabled;

    set_dev_mode_enabled(new_value);
    window.dispatchEvent(
      new CustomEvent("dev-mode-changed", { detail: new_value }),
    );

    const vault = get_vault_from_memory();

    if (vault) {
      save_dev_mode(new_value, vault).catch(() => {
        set_dev_mode_enabled(!new_value);
        window.dispatchEvent(
          new CustomEvent("dev-mode-changed", { detail: !new_value }),
        );
        show_toast("Failed to update developer mode", "error");
      });
    }
  };

  const handle_copy_version = () => {
    navigator.clipboard.writeText("v1.0.0 Aurora");
    show_toast("Version copied", "success");
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3
            className="text-lg font-semibold"
            style={{ color: "var(--text-primary)" }}
          >
            Behavior & Shortcuts
          </h3>
          <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
            Customize how the app behaves
          </p>
        </div>
        <SettingsSaveIndicatorInline />
      </div>

      <div className="space-y-3">
        <div
          className="flex items-center justify-between p-4 rounded-lg border transition-colors"
          style={{
            backgroundColor: "var(--bg-tertiary)",
            borderColor: "var(--border-secondary)",
          }}
        >
          <div className="flex items-center gap-4">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: "var(--bg-secondary)" }}
            >
              <CommandLineIcon
                className="w-6 h-6"
                style={{ color: "var(--text-secondary)" }}
              />
            </div>
            <div>
              <h4
                className="text-sm font-medium"
                style={{ color: "var(--text-primary)" }}
              >
                Keyboard Shortcuts
              </h4>
              <p
                className="text-xs mt-0.5"
                style={{ color: "var(--text-muted)" }}
              >
                Use keyboard shortcuts for common actions
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              className="px-3 py-1.5 text-xs font-medium rounded-lg transition-colors hover:opacity-90"
              style={{
                backgroundColor: "var(--bg-secondary)",
                color: "var(--text-secondary)",
                border: "1px solid var(--border-secondary)",
              }}
              type="button"
              onClick={() =>
                window.dispatchEvent(new CustomEvent("open-shortcuts-modal"))
              }
            >
              View Shortcuts
            </button>
            <button
              className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors"
              style={{
                backgroundColor: preferences.keyboard_shortcuts_enabled
                  ? "#3b82f6"
                  : "var(--border-secondary)",
              }}
              type="button"
              onClick={() =>
                update_preference(
                  "keyboard_shortcuts_enabled",
                  !preferences.keyboard_shortcuts_enabled,
                )
              }
            >
              <span
                className={
                  "inline-block h-4 w-4 rounded-full transition-transform duration-200 " +
                  (preferences.keyboard_shortcuts_enabled
                    ? "translate-x-6"
                    : "translate-x-1")
                }
                style={{
                  backgroundColor: preferences.keyboard_shortcuts_enabled
                    ? "#ffffff"
                    : "var(--bg-card)",
                }}
              />
            </button>
          </div>
        </div>

        <SelectSetting
          description="When to mark emails as read"
          icon={
            <ClockIcon
              className="w-6 h-6"
              style={{ color: "var(--text-secondary)" }}
            />
          }
          on_change={(v) =>
            update_preference(
              "mark_as_read_delay",
              v as "immediate" | "1_second" | "3_seconds" | "never",
            )
          }
          options={[
            { value: "immediate", label: "Immediately" },
            { value: "1_second", label: "After 1 second" },
            { value: "3_seconds", label: "After 3 seconds" },
            { value: "never", label: "Never (manual only)" },
          ]}
          title="Mark as Read"
          value={preferences.mark_as_read_delay}
        />

        <SelectSetting
          description="Where to show the email preview"
          icon={
            <ViewColumnsIcon
              className="w-6 h-6"
              style={{ color: "var(--text-secondary)" }}
            />
          }
          on_change={(v) =>
            update_preference(
              "reading_pane_position",
              v as "right" | "bottom" | "hidden",
            )
          }
          options={[
            { value: "right", label: "Right side" },
            { value: "bottom", label: "Bottom" },
            { value: "hidden", label: "Hidden (click to open)" },
          ]}
          title="Reading Pane Position"
          value={preferences.reading_pane_position}
        />

        <SelectSetting
          description="Default action when replying to emails"
          icon={
            <ArrowUturnLeftIcon
              className="w-6 h-6"
              style={{ color: "var(--text-secondary)" }}
            />
          }
          on_change={(v) =>
            update_preference(
              "default_reply_behavior",
              v as "reply" | "reply_all",
            )
          }
          options={[
            { value: "reply", label: "Reply to sender" },
            { value: "reply_all", label: "Reply to all" },
          ]}
          title="Default Reply"
          value={preferences.default_reply_behavior}
        />

        <SelectSetting
          description="How to handle images from external sources"
          icon={
            <PhotoIcon
              className="w-6 h-6"
              style={{ color: "var(--text-secondary)" }}
            />
          }
          on_change={(v) =>
            update_preference(
              "load_remote_images",
              v as "always" | "ask" | "never",
            )
          }
          options={[
            { value: "always", label: "Always load" },
            { value: "ask", label: "Ask each time" },
            { value: "never", label: "Never load" },
          ]}
          title="Remote Images"
          value={preferences.load_remote_images}
        />
      </div>

      <div className="pt-3">
        <h3
          className="text-lg font-semibold mb-1"
          style={{ color: "var(--text-primary)" }}
        >
          Confirmations
        </h3>
        <p className="text-sm mb-3" style={{ color: "var(--text-muted)" }}>
          Ask for confirmation before these actions
        </p>

        <div className="space-y-3">
          <ToggleSetting
            description="Confirm before permanently deleting emails"
            enabled={preferences.confirm_before_delete}
            icon={
              <TrashIcon
                className="w-6 h-6"
                style={{ color: "var(--text-secondary)" }}
              />
            }
            on_toggle={() =>
              update_preference(
                "confirm_before_delete",
                !preferences.confirm_before_delete,
              )
            }
            title="Confirm Delete"
          />

          <ToggleSetting
            description="Confirm before archiving emails"
            enabled={preferences.confirm_before_archive}
            icon={
              <ArchiveBoxIcon
                className="w-6 h-6"
                style={{ color: "var(--text-secondary)" }}
              />
            }
            on_toggle={() =>
              update_preference(
                "confirm_before_archive",
                !preferences.confirm_before_archive,
              )
            }
            title="Confirm Archive"
          />

          <ToggleSetting
            description="Confirm before marking emails as spam"
            enabled={preferences.confirm_before_spam}
            icon={
              <ExclamationTriangleIcon
                className="w-6 h-6"
                style={{ color: "var(--text-secondary)" }}
              />
            }
            on_toggle={() =>
              update_preference(
                "confirm_before_spam",
                !preferences.confirm_before_spam,
              )
            }
            title="Confirm Spam"
          />
        </div>
      </div>

      <div className="pt-3">
        <h3
          className="text-lg font-semibold mb-1"
          style={{ color: "var(--text-primary)" }}
        >
          Encryption Behavior
        </h3>
        <p className="text-sm mb-3" style={{ color: "var(--text-muted)" }}>
          Control how encryption is applied to your emails
        </p>

        <div className="space-y-3">
          <ToggleSetting
            description="Automatically search WKD and keyservers when composing"
            enabled={preferences.auto_discover_keys}
            icon={
              <MagnifyingGlassIcon
                className="w-6 h-6"
                style={{ color: "var(--text-secondary)" }}
              />
            }
            on_toggle={() =>
              update_preference(
                "auto_discover_keys",
                !preferences.auto_discover_keys,
              )
            }
            title="Auto-discover recipient keys"
          />

          <ToggleSetting
            description="Automatically encrypt when recipient key is available"
            enabled={preferences.encrypt_emails}
            icon={
              <LockClosedIcon
                className="w-6 h-6"
                style={{ color: "var(--text-secondary)" }}
              />
            }
            on_toggle={() =>
              update_preference("encrypt_emails", !preferences.encrypt_emails)
            }
            title="Encrypt by default"
          />

          <ToggleSetting
            description="Prevent sending unencrypted to recipients with known keys"
            enabled={preferences.require_encryption}
            icon={
              <ShieldCheckIcon
                className="w-6 h-6"
                style={{ color: "var(--text-secondary)" }}
              />
            }
            on_toggle={() =>
              update_preference(
                "require_encryption",
                !preferences.require_encryption,
              )
            }
            title="Require encryption"
          />

          <ToggleSetting
            description="Display lock icons on encrypted messages"
            enabled={preferences.show_encryption_indicators}
            icon={
              <EyeIcon
                className="w-6 h-6"
                style={{ color: "var(--text-secondary)" }}
              />
            }
            on_toggle={() =>
              update_preference(
                "show_encryption_indicators",
                !preferences.show_encryption_indicators,
              )
            }
            title="Show encryption indicators"
          />

          <ToggleSetting
            description="Make your keys discoverable via Web Key Directory"
            enabled={preferences.publish_to_wkd}
            icon={
              <GlobeAltIcon
                className="w-6 h-6"
                style={{ color: "var(--text-secondary)" }}
              />
            }
            on_toggle={() =>
              update_preference("publish_to_wkd", !preferences.publish_to_wkd)
            }
            title="Publish keys to WKD"
          />

          <ToggleSetting
            description="Make your keys findable on public keyservers"
            enabled={preferences.publish_to_keyservers}
            icon={
              <ServerIcon
                className="w-6 h-6"
                style={{ color: "var(--text-secondary)" }}
              />
            }
            on_toggle={() =>
              update_preference(
                "publish_to_keyservers",
                !preferences.publish_to_keyservers,
              )
            }
            title="Publish to keyservers"
          />
        </div>
      </div>

      <div className="pt-3">
        <h3
          className="text-lg font-semibold mb-1"
          style={{ color: "var(--text-primary)" }}
        >
          Advanced
        </h3>
        <p className="text-sm mb-3" style={{ color: "var(--text-muted)" }}>
          Developer options and app information
        </p>

        <div
          className="p-4 rounded-lg border transition-colors"
          style={{
            backgroundColor: "var(--bg-tertiary)",
            borderColor: "var(--border-secondary)",
          }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: "var(--bg-secondary)" }}
              >
                <CodeBracketIcon
                  className="w-6 h-6"
                  style={{ color: "var(--text-secondary)" }}
                />
              </div>
              <div>
                <h4
                  className="text-sm font-medium"
                  style={{ color: "var(--text-primary)" }}
                >
                  Developer Mode
                </h4>
                <p
                  className="text-xs mt-0.5"
                  style={{ color: "var(--text-muted)" }}
                >
                  Enable advanced features for developers
                </p>
              </div>
            </div>
            <button
              className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors"
              style={{
                backgroundColor: dev_mode_enabled
                  ? "#3b82f6"
                  : "var(--border-secondary)",
              }}
              type="button"
              onClick={handle_dev_mode_toggle}
            >
              <span
                className={
                  "inline-block h-4 w-4 rounded-full transition-transform duration-200 " +
                  (dev_mode_enabled ? "translate-x-6" : "translate-x-1")
                }
                style={{
                  backgroundColor: dev_mode_enabled
                    ? "#ffffff"
                    : "var(--bg-card)",
                }}
              />
            </button>
          </div>
          <div
            className="mt-3 pt-3 -mx-4 px-4"
            style={{ borderTop: "1px solid var(--border-secondary)" }}
          >
            <button
              className="text-[11px] transition-opacity hover:opacity-70"
              style={{ color: "var(--text-muted)" }}
              onClick={handle_copy_version}
            >
              v1.0.0 Aurora
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
