import type { UserPreferences } from "@/services/api/preferences";

import { useState } from "react";
import {
  ArrowPathIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";

import { show_toast } from "@/components/toast/simple_toast";
import { use_preferences } from "@/contexts/preferences_context";

interface SettingsResetButtonProps {
  section_keys?: (keyof UserPreferences)[];
  label?: string;
}

export function SettingsResetButton({
  section_keys,
  label = "Reset to defaults",
}: SettingsResetButtonProps) {
  const { reset_to_defaults, reset_section } = use_preferences();
  const [show_confirm, set_show_confirm] = useState(false);
  const [confirmation_text, set_confirmation_text] = useState("");

  const is_full_reset = !section_keys;
  const required_text = is_full_reset ? "RESET" : "reset";

  const handle_reset = () => {
    if (confirmation_text.toLowerCase() !== required_text.toLowerCase()) {
      return;
    }
    if (section_keys) {
      reset_section(section_keys);
      show_toast("Section reset to defaults", "success");
    } else {
      reset_to_defaults();
      show_toast("All settings reset to defaults", "success");
    }
    set_show_confirm(false);
    set_confirmation_text("");
  };

  const handle_cancel = () => {
    set_show_confirm(false);
    set_confirmation_text("");
  };

  if (show_confirm) {
    return (
      <div
        className="flex flex-col gap-2 p-3 rounded-lg"
        style={{ backgroundColor: "var(--bg-secondary)" }}
      >
        <div className="flex items-start gap-2">
          <ExclamationTriangleIcon
            className="w-4 h-4 flex-shrink-0 mt-0.5"
            style={{ color: "var(--color-warning, #f59e0b)" }}
          />
          <div className="flex flex-col gap-1">
            <span
              className="text-xs font-medium"
              style={{ color: "var(--text-primary)" }}
            >
              {is_full_reset
                ? "Reset all settings to defaults?"
                : "Reset this section?"}
            </span>
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
              {is_full_reset
                ? "This will reset all your preferences. Type RESET to confirm."
                : `Type "${required_text}" to confirm.`}
            </span>
          </div>
        </div>
        <input
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
          className="px-2 py-1 text-xs rounded border outline-none"
          placeholder={`Type ${required_text}`}
          style={{
            backgroundColor: "var(--bg-primary)",
            borderColor: "var(--border-color)",
            color: "var(--text-primary)",
          }}
          type="text"
          value={confirmation_text}
          onChange={(e) => set_confirmation_text(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handle_reset();
            if (e.key === "Escape") handle_cancel();
          }}
        />
        <div className="flex items-center gap-2">
          <button
            className="px-2 py-1 text-xs font-medium rounded transition-colors disabled:opacity-50"
            disabled={
              confirmation_text.toLowerCase() !== required_text.toLowerCase()
            }
            style={{
              backgroundColor: "var(--color-error, #ef4444)",
              color: "#ffffff",
            }}
            type="button"
            onClick={handle_reset}
          >
            Confirm Reset
          </button>
          <button
            className="px-2 py-1 text-xs font-medium rounded transition-colors"
            style={{
              backgroundColor: "var(--bg-primary)",
              color: "var(--text-secondary)",
            }}
            type="button"
            onClick={handle_cancel}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium rounded transition-colors hover:opacity-80"
      style={{
        backgroundColor: "var(--bg-secondary)",
        color: "var(--text-muted)",
      }}
      type="button"
      onClick={() => set_show_confirm(true)}
    >
      <ArrowPathIcon className="w-3.5 h-3.5" />
      {label}
    </button>
  );
}
