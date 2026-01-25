import type { TranslationKey } from "@/lib/i18n/types";
import type { Setting, SettingsSection } from "@/components/settings/types";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";

import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent } from "@/components/ui/card";
import { useTheme } from "@/contexts/theme_context";
import { use_auth } from "@/contexts/auth_context";
import { use_preferences } from "@/contexts/preferences_context";
import { use_mail_stats } from "@/hooks/use_mail_stats";
import { type UserPreferences, get_dev_mode } from "@/services/api/preferences";
import { request_notification_permission } from "@/services/notification_service";
import { get_vault_from_memory } from "@/services/crypto/memory_key_store";
import { cn, format_bytes } from "@/lib/utils";
import {
  get_supported_languages,
  get_display_name,
} from "@/lib/i18n/languages";
import { use_i18n } from "@/lib/i18n/context";
import { update_display_name } from "@/services/api/user";
import {
  NAV_GROUPS,
  DEVELOPER_NAV_ITEM,
} from "@/components/settings/nav_config";
import { BillingSection } from "@/components/settings/billing_section";
import { BlockedSection } from "@/components/settings/blocked_section";
import { SpamSection } from "@/components/settings/spam_section";
import { AllowlistSection } from "@/components/settings/allowlist_section";
import { SubscriptionsSection } from "@/components/settings/subscriptions_section";
import { TemplatesSection } from "@/components/settings/templates_section";
import { DeveloperSection } from "@/components/settings/developer_section";
import { UndoSendSection } from "@/components/settings/undo_send_section";
import { FeedbackSection } from "@/components/settings/feedback_section";
import { PrivacySection } from "@/components/settings/privacy_section";
import { SettingsSaveIndicatorInline } from "@/components/settings/settings_save_indicator";
import { ErrorBoundary } from "@/components/ui/error_boundary";
import { Button } from "@/components/ui/button";

type LanguageCode = ReturnType<typeof get_supported_languages>[0]["code"];

let persisted_settings_tab: string | null = null;

const MAX_STORAGE_BYTES = 1024 * 1024 * 1024;

const LANGUAGE_OPTIONS = get_supported_languages().map((lang) => ({
  code: lang.code,
  label: get_display_name(lang.code),
}));

function label_to_language_code(label: string): LanguageCode | null {
  const match = LANGUAGE_OPTIONS.find((l) => l.label === label);

  return match ? match.code : null;
}

function theme_to_display(theme: string): string {
  const map: Record<string, string> = {
    light: "Light",
    dark: "Dark",
    auto: "Auto",
  };

  return map[theme] || "Light";
}

function display_to_theme(display: string): "light" | "dark" | "auto" {
  const map: Record<string, "light" | "dark" | "auto"> = {
    Light: "light",
    Dark: "dark",
    Auto: "auto",
  };

  return map[display] || "light";
}

function format_storage_display(bytes: number): string {
  const used = format_bytes(bytes);
  const total = format_bytes(MAX_STORAGE_BYTES);

  return `${used} of ${total}`;
}

interface SettingsModalProps {
  is_open: boolean;
  on_close: () => void;
  initial_section?: string;
}

export function SettingsModal({
  is_open,
  on_close,
  initial_section,
}: SettingsModalProps) {
  const { theme_preference, set_theme_preference } = useTheme();
  const { user, update_user } = use_auth();
  const { preferences, update_preference } = use_preferences();
  const { set_language, t } = use_i18n();

  const [active_tab, set_active_tab] = useState("account");
  const [visible_tab, set_visible_tab] = useState("account");
  const tab_timer_ref = useRef<NodeJS.Timeout | null>(null);
  const [indicator_style, set_indicator_style] = useState<{
    top?: number;
    height?: number;
    opacity: number;
  }>({ opacity: 0 });
  const nav_container_ref = useRef<HTMLElement>(null);
  const nav_button_refs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const [notification_permission, set_notification_permission] =
    useState<NotificationPermission>("default");
  const [dev_mode_enabled, set_dev_mode_enabled] = useState(false);
  const [display_name_input, set_display_name_input] = useState(
    user?.display_name || user?.username || "",
  );
  const mail_stats = use_mail_stats();

  useEffect(() => {
    if (is_open) {
      const load_dev_state = async () => {
        const vault = get_vault_from_memory();
        const result = await get_dev_mode(vault);

        set_dev_mode_enabled(result.data);
      };

      load_dev_state();
    }
  }, [is_open]);

  useEffect(() => {
    set_display_name_input(user?.display_name || user?.username || "");
  }, [user?.display_name, user?.username]);

  const save_display_name = async () => {
    const new_name = display_name_input.trim();

    if (!new_name || !user || new_name === (user.display_name || user.username))
      return;
    try {
      const r = await update_display_name(new_name);

      if (r.data?.user) {
        await update_user({
          ...user,
          display_name: r.data.user.display_name || undefined,
        });
      }
    } catch {
      return;
    }
  };

  const visible_nav_groups = useMemo(() => {
    const groups = NAV_GROUPS.map((g) => ({ ...g, items: [...g.items] }));

    if (dev_mode_enabled) {
      groups[1].items.push(DEVELOPER_NAV_ITEM);
    }

    return groups;
  }, [dev_mode_enabled]);

  useEffect(() => {
    if (!is_open) {
      set_indicator_style({ opacity: 0 });

      return;
    }

    requestAnimationFrame(() => {
      const button = nav_button_refs.current.get(active_tab);
      const container = nav_container_ref.current;

      if (button && container) {
        const button_rect = button.getBoundingClientRect();
        const container_rect = container.getBoundingClientRect();

        set_indicator_style({
          top: button_rect.top - container_rect.top,
          height: button_rect.height,
          opacity: 1,
        });
      }
    });
  }, [is_open, active_tab, visible_nav_groups]);

  const get_account_settings = useCallback(
    () => [
      {
        label: "Email Address",
        value: user?.email || "",
        key: "email_address",
        type: "info" as const,
        description: "Your primary email address",
      },
      {
        label: "Display Name",
        value: display_name_input,
        key: "display_name",
        type: "text" as const,
        description: "Name shown to recipients",
      },
      {
        label: "Signature",
        value:
          preferences.signature_mode === "disabled"
            ? "Off"
            : preferences.signature_mode === "auto"
              ? "Auto"
              : "Manual",
        key: "signature_mode",
        type: "select" as const,
        description: "Email signature settings",
        options: ["Off", "Auto", "Manual"],
      },
      {
        label: "Storage Used",
        value: format_storage_display(mail_stats.stats.storage_used_bytes),
        key: "storage_used",
        type: "info" as const,
        description: "Current storage usage",
      },
    ],
    [
      user?.email,
      display_name_input,
      preferences.signature_mode,
      mail_stats.stats.storage_used_bytes,
    ],
  );

  const handle_setting_change = async (
    key: string,
    value: string | boolean,
  ) => {
    if (key === "theme") {
      const theme_value = display_to_theme(value as string);

      update_preference("theme", theme_value, true);
      set_theme_preference(theme_value);
    } else if (key === "language") {
      const language_code = label_to_language_code(value as string);

      if (language_code) {
        update_preference("language", value as string);
        set_language(language_code);
      }
    } else if (key === "desktop_notifications" && value === true) {
      const granted = await request_notification_permission();

      if (granted) {
        update_preference(key as keyof UserPreferences, value as never);
        set_notification_permission("granted");
      } else {
        set_notification_permission(Notification.permission);
      }
    } else if (key === "display_name") {
      return;
    } else if (key === "signature_mode") {
      const mode_map: Record<string, "disabled" | "auto" | "manual"> = {
        Off: "disabled",
        Auto: "auto",
        Manual: "manual",
      };

      update_preference("signature_mode", mode_map[value as string] || "auto");
    } else if (key === "mark_as_read_delay") {
      const delay_map: Record<
        string,
        "immediate" | "1_second" | "3_seconds" | "never"
      > = {
        Immediately: "immediate",
        "After 1 second": "1_second",
        "After 3 seconds": "3_seconds",
        "Never (manual only)": "never",
      };

      update_preference("mark_as_read_delay", delay_map[value as string]);
    } else if (key === "reading_pane_position") {
      const position_map: Record<string, "right" | "bottom" | "hidden"> = {
        "Right side": "right",
        Bottom: "bottom",
        "Hidden (click to open)": "hidden",
      };

      update_preference("reading_pane_position", position_map[value as string]);
    } else if (key === "default_reply_behavior") {
      const reply_map: Record<string, "reply" | "reply_all"> = {
        "Reply to sender": "reply",
        "Reply to all": "reply_all",
      };

      update_preference("default_reply_behavior", reply_map[value as string]);
    } else if (key === "load_remote_images") {
      const images_map: Record<string, "always" | "ask" | "never"> = {
        "Always load": "always",
        "Ask each time": "ask",
        "Never load": "never",
      };

      update_preference("load_remote_images", images_map[value as string]);
    } else {
      update_preference(key as keyof UserPreferences, value as never);
    }
  };

  const handle_tab_change = useCallback(
    (new_tab: string) => {
      if (new_tab === active_tab) return;

      if (tab_timer_ref.current) {
        clearTimeout(tab_timer_ref.current);
      }

      set_active_tab(new_tab);
      set_visible_tab(new_tab);
      persisted_settings_tab = new_tab;
    },
    [active_tab],
  );

  useEffect(() => {
    return () => {
      if (tab_timer_ref.current) {
        clearTimeout(tab_timer_ref.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!is_open) return;

    const tab = initial_section || persisted_settings_tab || "account";

    set_active_tab(tab);
    set_visible_tab(tab);
    if (tab_timer_ref.current) {
      clearTimeout(tab_timer_ref.current);
      tab_timer_ref.current = null;
    }

    if ("Notification" in window) {
      set_notification_permission(Notification.permission);
    }

    const handle_escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") on_close();
    };

    document.addEventListener("keydown", handle_escape);

    return () => document.removeEventListener("keydown", handle_escape);
  }, [is_open, on_close, initial_section]);

  const generate_random_display_name = () => {
    const adjectives = [
      "Swift",
      "Bright",
      "Cool",
      "Rapid",
      "Bold",
      "Keen",
      "Calm",
      "Quick",
      "Fresh",
      "Smart",
      "Sharp",
      "Brave",
      "Sleek",
      "Agile",
      "Prime",
      "Vivid",
      "Noble",
      "Cosmic",
      "Stellar",
      "Clever",
    ];
    const nouns = [
      "Fox",
      "Hawk",
      "Wolf",
      "Bear",
      "Lynx",
      "Owl",
      "Eagle",
      "Tiger",
      "Falcon",
      "Raven",
      "Cobra",
      "Phoenix",
      "Dragon",
      "Panther",
      "Jaguar",
      "Lion",
      "Panda",
      "Otter",
      "Badger",
      "Viper",
    ];
    const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];

    return `${adjective} ${noun}`;
  };

  const get_settings_content = useCallback(
    (): Record<string, SettingsSection> => ({
      general: {
        title: t("settings.general"),
        description: t("settings.language_description"),
        settings: [
          {
            label: t("settings.language"),
            value: preferences.language,
            key: "language",
            type: "select",
            description: t("settings.language_description"),
            options: LANGUAGE_OPTIONS.map((l) => l.label),
          },
          {
            label: "Date Format",
            value: preferences.date_format,
            key: "date_format",
            type: "select",
            description: "Choose how dates are displayed",
            options: ["MM/DD/YYYY", "DD/MM/YYYY", "YYYY-MM-DD", "DD MMM YYYY"],
          },
          {
            label: "Auto-save Drafts",
            value: preferences.auto_save_drafts,
            key: "auto_save_drafts",
            type: "toggle",
            description: "Automatically save drafts while composing",
          },
        ],
      },
      appearance: {
        title: t("settings.appearance"),
        description: t("settings.theme_description"),
        settings: [
          {
            label: "Theme",
            value: theme_to_display(theme_preference),
            key: "theme",
            type: "select",
            description: "Choose between light and dark themes",
            options: ["Light", "Dark", "Auto"],
          },
          {
            label: "Density",
            value: preferences.density,
            key: "density",
            type: "select",
            description: "Adjust spacing and layout density",
            options: ["Compact", "Comfortable", "Spacious"],
          },
          {
            label: "Show Profile Pictures",
            value: preferences.show_profile_pictures,
            key: "show_profile_pictures",
            type: "toggle",
            description: "Display sender profile pictures in inbox",
          },
          {
            label: "Show Email Preview",
            value: preferences.show_email_preview,
            key: "show_email_preview",
            type: "toggle",
            description: "Show message preview text in list",
          },
        ],
      },
      email: {
        title: t("settings.compose"),
        description: t("settings.auto_save_drafts_description"),
        settings: [
          {
            label: "Default Send Mode",
            value: preferences.default_send_mode,
            key: "default_send_mode",
            type: "select",
            description: "Choose default action when sending",
            options: ["Send", "Send and Archive", "Send Later"],
          },
          {
            label: "Undo Send Period",
            value: preferences.undo_send_period,
            key: "undo_send_period",
            type: "select",
            description: "Time window to undo sent emails",
            options: ["5 seconds", "10 seconds", "20 seconds", "30 seconds"],
          },
          {
            label: "Conversation View",
            value: preferences.conversation_view,
            key: "conversation_view",
            type: "toggle",
            description: "Group related messages together",
          },
          {
            label: "Auto-advance",
            value: preferences.auto_advance,
            key: "auto_advance",
            type: "select",
            description: "What to show after archiving or deleting",
            options: [
              "Go to next message",
              "Go to previous message",
              "Return to inbox",
            ],
          },
          {
            label: "Smart Reply",
            value: preferences.smart_reply,
            key: "smart_reply",
            type: "toggle",
            description: "Show AI-suggested quick replies",
          },
        ],
      },
      notifications: {
        title: t("settings.notifications"),
        description: t("settings.desktop_notifications_description"),
        settings: [
          {
            label: "Desktop Notifications",
            value: preferences.desktop_notifications,
            key: "desktop_notifications",
            type: "toggle",
            description: "Show desktop notifications for new mail",
          },
          {
            label: "Sound",
            value: preferences.sound,
            key: "sound",
            type: "toggle",
            description: "Play sound for new messages",
          },
          {
            label: "Badge Count",
            value: preferences.badge_count,
            key: "badge_count",
            type: "toggle",
            description: "Show unread count on app icon",
          },
        ],
      },
      privacy: {
        title: t("settings.security"),
        description: t("settings.security_description"),
        settings: [
          {
            label: "Show Read Receipts",
            value: preferences.show_read_receipts,
            key: "show_read_receipts",
            type: "toggle",
            description: "Let senders know when you read their email",
          },
          {
            label: "Block External Images",
            value: preferences.block_external_images,
            key: "block_external_images",
            type: "toggle",
            description: "Prevent tracking pixels and external images",
          },
          {
            label: "Warn on External Recipients",
            value: preferences.warn_external_recipients,
            key: "warn_external_recipients",
            type: "toggle",
            description:
              "Show warning when sending to non-encrypted external recipients",
          },
        ],
      },
      account: {
        title: t("settings.account"),
        description: t("settings.display_name_description"),
        settings: get_account_settings(),
      },
      templates: {
        title: t("settings.templates"),
        description: t("settings.signature_description"),
      },
      feedback: {
        title: t("settings.feedback"),
        description: t("settings.feedback_description"),
      },
      developer: {
        title: t("settings.developer"),
        description: t("settings.developer_description"),
      },
      billing: {
        title: t("settings.billing"),
        description: t("settings.billing_description"),
      },
      undo_send: {
        title: t("settings.undo_send"),
        description: t("settings.undo_send_description"),
      },
      behavior: {
        title: t("settings.behavior"),
        description: t("settings.behavior_description"),
        settings: [
          {
            label: "Keyboard Shortcuts",
            value: preferences.keyboard_shortcuts_enabled,
            key: "keyboard_shortcuts_enabled",
            type: "toggle",
            description: "Use keyboard shortcuts for common actions",
          },
          {
            label: "Mark as Read",
            value:
              preferences.mark_as_read_delay === "immediate"
                ? "Immediately"
                : preferences.mark_as_read_delay === "1_second"
                  ? "After 1 second"
                  : preferences.mark_as_read_delay === "3_seconds"
                    ? "After 3 seconds"
                    : "Never (manual only)",
            key: "mark_as_read_delay",
            type: "select",
            description: "When to mark emails as read",
            options: [
              "Immediately",
              "After 1 second",
              "After 3 seconds",
              "Never (manual only)",
            ],
          },
          {
            label: "Reading Pane",
            value:
              preferences.reading_pane_position === "right"
                ? "Right side"
                : preferences.reading_pane_position === "bottom"
                  ? "Bottom"
                  : "Hidden (click to open)",
            key: "reading_pane_position",
            type: "select",
            description: "Where to show the email preview",
            options: ["Right side", "Bottom", "Hidden (click to open)"],
          },
          {
            label: "Default Reply",
            value:
              preferences.default_reply_behavior === "reply"
                ? "Reply to sender"
                : "Reply to all",
            key: "default_reply_behavior",
            type: "select",
            description: "Default action when replying to emails",
            options: ["Reply to sender", "Reply to all"],
          },
          {
            label: "Remote Images",
            value:
              preferences.load_remote_images === "always"
                ? "Always load"
                : preferences.load_remote_images === "ask"
                  ? "Ask each time"
                  : "Never load",
            key: "load_remote_images",
            type: "select",
            description: "How to handle images from external sources",
            options: ["Always load", "Ask each time", "Never load"],
          },
          {
            label: "Confirm Delete",
            value: preferences.confirm_before_delete,
            key: "confirm_before_delete",
            type: "toggle",
            description: "Confirm before permanently deleting emails",
          },
          {
            label: "Confirm Archive",
            value: preferences.confirm_before_archive,
            key: "confirm_before_archive",
            type: "toggle",
            description: "Confirm before archiving emails",
          },
          {
            label: "Confirm Spam",
            value: preferences.confirm_before_spam,
            key: "confirm_before_spam",
            type: "toggle",
            description: "Confirm before marking emails as spam",
          },
        ],
      },
      blocked: {
        title: "Blocked Senders",
        description: "Manage blocked email addresses",
      },
      spam: {
        title: "Spam & Filters",
        description: "Configure spam filtering settings",
      },
      subscriptions: {
        title: "Subscriptions",
        description: "Manage email subscriptions",
      },
    }),
    [t, preferences, theme_preference, get_account_settings],
  );

  const current_content = get_settings_content()[
    visible_tab
  ] as SettingsSection;
  const header_content = get_settings_content()[active_tab] as SettingsSection;

  const render_settings_card = (settings: Setting[]) => (
    <Card className="border-[var(--border-secondary)] bg-[var(--bg-card)] shadow-none">
      <CardContent className="p-0">
        {settings.map((setting: Setting, idx: number) => (
          <motion.div
            key={`${visible_tab}-${idx}`}
            animate={{ opacity: 1 }}
            className="px-5 py-3 transition-colors duration-200"
            initial={{ opacity: 0 }}
            transition={{ duration: 0.3, delay: idx * 0.03 }}
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
              <div className="flex-1 min-w-0">
                <label
                  className="text-sm font-medium block"
                  style={{ color: "var(--text-primary)" }}
                >
                  {setting.label}
                </label>
                <p
                  className="text-xs mt-0.5"
                  style={{ color: "var(--text-muted)" }}
                >
                  {setting.description}
                </p>
              </div>

              <div className="flex-shrink-0">
                {setting.type === "toggle" && (
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={setting.value}
                      onCheckedChange={(checked) =>
                        handle_setting_change(setting.key, checked)
                      }
                    />
                    {setting.key === "desktop_notifications" &&
                      notification_permission === "denied" && (
                        <span className="text-xs text-red-500">Denied</span>
                      )}
                    {setting.key === "desktop_notifications" &&
                      notification_permission === "default" &&
                      !setting.value && (
                        <Button
                          className="h-7 px-3 text-xs"
                          size="sm"
                          variant="secondary"
                          onClick={async () => {
                            const granted =
                              await request_notification_permission();

                            set_notification_permission(
                              Notification.permission,
                            );
                            if (granted) {
                              handle_setting_change(setting.key, true);
                            }
                          }}
                        >
                          Grant
                        </Button>
                      )}
                  </div>
                )}
                {setting.type === "select" && (
                  <Select
                    value={setting.value}
                    onValueChange={(value) =>
                      handle_setting_change(setting.key, value)
                    }
                  >
                    <SelectTrigger className="w-[160px] h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {setting.options.map((option) => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {setting.type === "text" && (
                  <div className="flex items-center gap-2">
                    {setting.key === "display_name" && (
                      <button
                        className="h-9 px-2 rounded-md transition-colors hover:bg-[var(--bg-hover)]"
                        style={{ color: "var(--accent-blue)" }}
                        type="button"
                        onClick={() =>
                          set_display_name_input(generate_random_display_name())
                        }
                      >
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          viewBox="0 0 24 24"
                        >
                          <path
                            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </button>
                    )}
                    <Input
                      className="h-9 px-3 text-sm min-w-[160px]"
                      type="text"
                      value={setting.value}
                      onBlur={
                        setting.key === "display_name"
                          ? save_display_name
                          : undefined
                      }
                      onChange={(e) =>
                        setting.key === "display_name"
                          ? set_display_name_input(e.target.value)
                          : handle_setting_change(setting.key, e.target.value)
                      }
                      onKeyDown={(e) => {
                        if (
                          setting.key === "display_name" &&
                          e.key === "Enter"
                        ) {
                          (e.target as HTMLInputElement).blur();
                        }
                      }}
                    />
                  </div>
                )}
                {setting.type === "info" && (
                  <span
                    className="text-sm font-medium"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {setting.value}
                  </span>
                )}
              </div>
            </div>
          </motion.div>
        ))}
      </CardContent>
    </Card>
  );

  const render_section_content = () => {
    switch (visible_tab) {
      case "templates":
        return <TemplatesSection />;
      case "feedback":
        return <FeedbackSection />;
      case "developer":
        return <DeveloperSection />;
      case "billing":
        return <BillingSection />;
      case "blocked":
        return <BlockedSection />;
      case "spam":
        return (
          <div className="space-y-8">
            <SpamSection />
            <AllowlistSection />
          </div>
        );
      case "subscriptions":
        return <SubscriptionsSection />;
      case "undo_send":
        return <UndoSendSection />;
      case "privacy":
        return (
          <>
            {current_content?.settings &&
              render_settings_card(current_content.settings)}
            <div className="mt-6">
              <PrivacySection />
            </div>
          </>
        );
      default:
        return current_content?.settings
          ? render_settings_card(current_content.settings)
          : null;
    }
  };

  return (
    <AnimatePresence>
      {is_open && (
        <motion.div
          animate={{ opacity: 1 }}
          className="fixed inset-0 bg-black/40 backdrop-blur-md flex items-center justify-center z-50 p-4 sm:p-8"
          exit={{ opacity: 0 }}
          initial={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onClick={on_close}
        >
          <motion.div
            animate={{ scale: 1, opacity: 1 }}
            className="rounded-none sm:rounded-xl shadow-2xl w-full h-full sm:w-[960px] sm:h-[720px] sm:max-h-[90vh] overflow-hidden flex flex-col sm:flex-row transition-colors duration-200"
            exit={{ scale: 0.96, opacity: 0 }}
            initial={{ scale: 0.96, opacity: 0 }}
            style={{
              backgroundColor: "var(--modal-bg)",
              border: "1px solid var(--border-secondary)",
            }}
            transition={{ duration: 0.15 }}
            onClick={(e) => e.stopPropagation()}
          >
            <ErrorBoundary>
              <div
                className="w-full sm:w-52 sm:h-full flex flex-col transition-colors duration-200 flex-shrink-0 sm:border-b-0 border-b"
                style={{ borderColor: "var(--border-secondary)" }}
              >
                <div
                  className="flex sm:hidden items-center justify-between p-3 border-b"
                  style={{ borderColor: "var(--border-secondary)" }}
                >
                  <h2
                    className="text-base font-semibold"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {t("settings.title")}
                  </h2>
                  <Button
                    className="h-7 w-7 p-0"
                    size="sm"
                    variant="ghost"
                    onClick={on_close}
                  >
                    <svg
                      className="w-4 h-4"
                      fill="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                    </svg>
                  </Button>
                </div>
                <nav
                  ref={nav_container_ref}
                  className="hidden sm:flex relative overflow-y-auto px-3 py-3 flex-col gap-0"
                >
                  <div
                    className="pointer-events-none absolute rounded-md"
                    style={{
                      left: 0,
                      right: 0,
                      top: indicator_style.top,
                      height: indicator_style.height,
                      backgroundColor: "var(--indicator-bg)",
                      border: "1px solid var(--border-primary)",
                      zIndex: 0,
                      transition:
                        indicator_style.opacity === 0
                          ? "opacity 100ms ease"
                          : "top 200ms ease, height 200ms ease, opacity 200ms ease",
                      opacity: indicator_style.opacity,
                    }}
                  />
                  {visible_nav_groups.map((group, group_idx) => (
                    <div key={group.label} className="flex flex-col gap-0">
                      <span
                        className={cn(
                          "px-3 py-2 text-[11px] font-medium uppercase tracking-wider",
                          group_idx > 0 && "mt-4",
                        )}
                        style={{ color: "var(--text-muted)" }}
                      >
                        {t(group.label as TranslationKey)}
                      </span>
                      {group.items.map((item) => (
                        <button
                          key={item.id}
                          ref={(el) => {
                            if (el) nav_button_refs.current.set(item.id, el);
                          }}
                          className={cn(
                            "relative z-10 flex items-center gap-3 px-3 py-2.5 rounded-lg text-left w-full",
                            active_tab === item.id
                              ? "text-[var(--accent-blue)]"
                              : "text-[var(--text-secondary)]",
                          )}
                          onClick={() => handle_tab_change(item.id)}
                        >
                          <svg
                            className={cn(
                              "w-[18px] h-[18px] flex-shrink-0",
                              active_tab === item.id
                                ? "text-[var(--accent-blue)]"
                                : "text-[var(--text-muted)]",
                            )}
                            fill="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path d={item.icon} />
                          </svg>
                          <span className="text-sm">
                            {t(item.label as TranslationKey)}
                          </span>
                        </button>
                      ))}
                    </div>
                  ))}
                </nav>
                <nav className="sm:hidden relative flex overflow-x-auto px-2 py-2 gap-0.5">
                  {visible_nav_groups.map((group) => (
                    <div key={group.label} className="flex gap-0.5">
                      {group.items.map((item) => (
                        <button
                          key={item.id}
                          className={cn(
                            "relative z-10 flex items-center gap-3 px-3 py-2.5 rounded-lg text-left whitespace-nowrap flex-shrink-0",
                            active_tab === item.id
                              ? "text-[var(--accent-blue)]"
                              : "text-[var(--text-secondary)]",
                          )}
                          onClick={() => handle_tab_change(item.id)}
                        >
                          <svg
                            className={cn(
                              "w-[18px] h-[18px] flex-shrink-0",
                              active_tab === item.id
                                ? "text-[var(--accent-blue)]"
                                : "text-[var(--text-muted)]",
                            )}
                            fill="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path d={item.icon} />
                          </svg>
                          <span className="text-sm">
                            {t(item.label as TranslationKey)}
                          </span>
                        </button>
                      ))}
                    </div>
                  ))}
                </nav>
              </div>

              <Separator
                className="hidden sm:block bg-[var(--border-secondary)]"
                orientation="vertical"
              />

              <div className="flex-1 flex flex-col overflow-hidden min-h-0 h-full">
                <div className="px-5 py-3 sm:px-6 sm:py-4 transition-colors duration-200 flex-shrink-0 flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-3">
                      <h3
                        className="text-lg sm:text-xl font-semibold"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {header_content?.title}
                      </h3>
                      <SettingsSaveIndicatorInline />
                    </div>
                    <p
                      className="text-sm mt-1"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {header_content?.description}
                    </p>
                  </div>
                  <button
                    className="hidden sm:flex w-8 h-8 rounded-lg items-center justify-center transition-colors hover:bg-[var(--bg-hover)]"
                    style={{ color: "var(--text-muted)" }}
                    onClick={on_close}
                  >
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      viewBox="0 0 24 24"
                    >
                      <path
                        d="M6 18L18 6M6 6l12 12"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                </div>

                <div
                  key={visible_tab}
                  className="flex-1 overflow-y-auto px-5 py-3 sm:px-6 sm:py-4 min-h-0"
                >
                  <div className="space-y-3 sm:space-y-4">
                    {render_section_content()}
                  </div>
                </div>
              </div>
            </ErrorBoundary>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
