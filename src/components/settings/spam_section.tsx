import { useState, useEffect } from "react";
import { ArrowPathIcon, ShieldCheckIcon } from "@heroicons/react/24/outline";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api_client } from "@/services/api/client";
import { show_toast } from "@/components/toast/simple_toast";

interface SpamSettings {
  spam_retention_days: number;
  spam_sensitivity: string;
}

const SENSITIVITY_OPTIONS = [
  {
    value: "low",
    label: "Low",
    description: "Only obvious spam is filtered",
  },
  {
    value: "medium",
    label: "Medium (Recommended)",
    description: "Balanced filtering",
  },
  {
    value: "high",
    label: "High",
    description: "Aggressive filtering, may catch some legitimate emails",
  },
];

const RETENTION_OPTIONS = [
  { value: 7, label: "7 days" },
  { value: 14, label: "14 days" },
  { value: 30, label: "30 days" },
  { value: 60, label: "60 days" },
  { value: 90, label: "90 days" },
  { value: 0, label: "Never (keep forever)" },
];

export function SpamSection() {
  const [settings, set_settings] = useState<SpamSettings>({
    spam_retention_days: 30,
    spam_sensitivity: "medium",
  });
  const [is_loading, set_is_loading] = useState(true);
  const [is_saving, set_is_saving] = useState(false);
  const [has_changes, set_has_changes] = useState(false);
  const [original_settings, set_original_settings] = useState<SpamSettings>({
    spam_retention_days: 30,
    spam_sensitivity: "medium",
  });

  useEffect(() => {
    const fetch_settings = async () => {
      try {
        const response =
          await api_client.get<SpamSettings>("/preferences/spam");

        if (response.data) {
          set_settings(response.data);
          set_original_settings(response.data);
        }
      } finally {
        set_is_loading(false);
      }
    };

    fetch_settings();
  }, []);

  useEffect(() => {
    set_has_changes(
      settings.spam_retention_days !== original_settings.spam_retention_days ||
        settings.spam_sensitivity !== original_settings.spam_sensitivity,
    );
  }, [settings, original_settings]);

  const handle_save = async () => {
    set_is_saving(true);
    try {
      const response = await api_client.put<{ success: boolean }>(
        "/preferences/spam",
        settings,
      );

      if (response.data?.success) {
        set_original_settings(settings);
        set_has_changes(false);
        show_toast("Spam settings saved", "success");
      } else if (response.error) {
        show_toast(response.error, "error");
      }
    } finally {
      set_is_saving(false);
    }
  };

  if (is_loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <ArrowPathIcon
          className="w-6 h-6 animate-spin"
          style={{ color: "var(--text-muted)" }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3
          className="text-lg font-semibold"
          style={{ color: "var(--text-primary)" }}
        >
          Spam Filtering
        </h3>
        <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
          Configure how spam is detected and managed.
        </p>
      </div>

      <div
        className="p-4 rounded-lg border space-y-6"
        style={{
          backgroundColor: "var(--bg-secondary)",
          borderColor: "var(--border-secondary)",
        }}
      >
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <ShieldCheckIcon
              className="w-5 h-5"
              style={{ color: "var(--accent-blue)" }}
            />
            <span
              className="text-sm font-medium"
              style={{ color: "var(--text-primary)" }}
            >
              Spam Sensitivity
            </span>
          </div>
          <Select
            value={settings.spam_sensitivity}
            onValueChange={(value) =>
              set_settings({ ...settings, spam_sensitivity: value })
            }
          >
            <SelectTrigger className="w-full max-w-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SENSITIVITY_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  <div className="flex flex-col">
                    <span>{option.label}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            {
              SENSITIVITY_OPTIONS.find(
                (o) => o.value === settings.spam_sensitivity,
              )?.description
            }
          </p>
        </div>

        <div className="space-y-3">
          <span
            className="text-sm font-medium"
            style={{ color: "var(--text-primary)" }}
          >
            Auto-delete spam after
          </span>
          <Select
            value={String(settings.spam_retention_days)}
            onValueChange={(value) =>
              set_settings({
                ...settings,
                spam_retention_days: parseInt(value),
              })
            }
          >
            <SelectTrigger className="w-full max-w-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RETENTION_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={String(option.value)}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            Spam emails older than this will be permanently deleted
          </p>
        </div>
      </div>

      {has_changes && (
        <div className="flex justify-end">
          <Button disabled={is_saving} onClick={handle_save}>
            {is_saving ? (
              <>
                <ArrowPathIcon className="w-4 h-4 animate-spin mr-2" />
                Saving...
              </>
            ) : (
              "Save Changes"
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
