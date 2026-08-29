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
import type * as React from "react";
import type { TranslationKey } from "@/lib/i18n";

import {
  BuildingOffice2Icon,
  SwatchIcon,
  EyeIcon,
  ShieldCheckIcon,
  ArrowDownTrayIcon,
  BellIcon,
  PaintBrushIcon,
  PencilSquareIcon,
  AdjustmentsHorizontalIcon,
  AtSymbolIcon,
  GlobeAltIcon,
  CreditCardIcon,
  KeyIcon,
  DocumentTextIcon,
  ArrowsRightLeftIcon,
  FunnelIcon,
  BoltIcon,
  ChatBubbleBottomCenterTextIcon,
  ComputerDesktopIcon,
  UserGroupIcon,
  HomeModernIcon,
  Squares2X2Icon,
  CircleStackIcon,
} from "@heroicons/react/24/outline";

import {
  read_last_settings_section,
  write_last_settings_section,
} from "@/lib/settings_section_store";
import { is_onion_host } from "@/lib/onion_host";

export type SettingsSection =
  | "account"
  | "appearance"
  | "accessibility"
  | "security"
  | "encryption"
  | "trusted_devices"
  | "aliases"
  | "domains"
  | "billing"
  | "storage"
  | "family"
  | "referral"
  | "import"
  | "notifications"
  | "compose"
  | "signature"
  | "templates"
  | "behavior"
  | "categories"
  | "sender_filters"
  | "mail_rules"
  | "feedback"
  | "updates"
  | "developer"
  | "bridge"
  | "smtp_tokens";

export type Section = SettingsSection;

export const SETTINGS_SECTION_IDS: SettingsSection[] = [
  "account",
  "appearance",
  "accessibility",
  "security",
  "encryption",
  "trusted_devices",
  "aliases",
  "domains",
  "billing",
  "storage",
  "family",
  "referral",
  "import",
  "notifications",
  "compose",
  "signature",
  "templates",
  "behavior",
  "categories",
  "sender_filters",
  "mail_rules",
  "feedback",
  "updates",
  "developer",
  "bridge",
];

export function is_settings_section(value: string): value is SettingsSection {
  return (SETTINGS_SECTION_IDS as string[]).includes(value);
}

const SECTION_ALIASES: Record<string, SettingsSection> = {
  storage_addons: "storage",
  ghost_aliases: "aliases",
  alias_directories: "aliases",
  external_accounts: "import",
  connection: "bridge",
  signatures: "signature",
  about: "updates",
  plans: "billing",
  subscription: "billing",
  smtp_tokens: "bridge",
};

export function resolve_settings_section(
  candidate: string | null | undefined,
): SettingsSection | undefined {
  if (!candidate) return undefined;
  const key = candidate.trim();

  if (is_settings_section(key)) return key;

  return SECTION_ALIASES[key];
}

export interface SettingsContentProps {
  section?: Section;
  on_section_change: (section: Section, replace?: boolean) => void;
  on_close: () => void;
  variant?: "page" | "popup";
}

let persisted_section: Section | null = null;

export function get_persisted_section(): Section | null {
  if (persisted_section) return persisted_section;

  const stored = read_last_settings_section();

  if (stored && is_settings_section(stored)) {
    persisted_section = stored;
  }

  return persisted_section;
}

export function set_persisted_section(section: Section) {
  persisted_section = section;
  write_last_settings_section(section);
}

export interface NavItem {
  id: Section;
  label: string;
  icon: React.ElementType;
  keywords: string[];
  description: string;
}

export interface NavItems {
  general: NavItem[];
  mail: NavItem[];
}

export function get_nav_items(
  t: (key: TranslationKey) => string,
  is_family_plan?: boolean,
): NavItems {
  const on_onion = is_onion_host();

  return {
    general: [
      {
        id: "appearance",
        label: t("settings.appearance"),
        icon: SwatchIcon,
        description:
          "Theme, color scheme, language, date format, and layout density",
        keywords: [
          "theme",
          "dark mode",
          "light mode",
          "system theme",
          "color",
          "layout",
          "compact",
          "density",
          "font",
          "language",
          "locale",
          "time format",
          "date format",
          "24 hour",
          "12 hour",
          "clock",
          "timezone",
        ],
      },
      {
        id: "account",
        label: t("settings.account"),
        icon: BuildingOffice2Icon,
        description:
          "Display name, profile photo, recovery email, and account deletion",
        keywords: [
          "profile",
          "display name",
          "username",
          "avatar",
          "photo",
          "profile picture",
          "change name",
          "recovery email",
          "inactivity timeout",
          "auto logout",
          "delete account",
          "close account",
          "deactivate",
        ],
      },
      {
        id: "accessibility",
        label: t("settings.accessibility"),
        icon: EyeIcon,
        description:
          "Font size, reduce motion, keyboard navigation, and screen reader support",
        keywords: [
          "font size",
          "text size",
          "reduce motion",
          "animations",
          "focus ring",
          "keyboard navigation",
          "screen reader",
          "high contrast",
          "dyslexia",
        ],
      },
      {
        id: "security",
        label: t("settings.security"),
        icon: ShieldCheckIcon,
        description:
          "Password, two-factor authentication, passkeys, hardware keys, and recovery codes",
        keywords: [
          "password",
          "change password",
          "2fa",
          "two factor",
          "two-factor authentication",
          "totp",
          "authenticator app",
          "google authenticator",
          "passkey",
          "hardware key",
          "yubikey",
          "fido",
          "webauthn",
          "biometric",
          "face id",
          "touch id",
          "backup codes",
          "recovery codes",
          "login history",
          "sign out all devices",
          "active sessions",
          "security checkup",
        ],
      },
      {
        id: "encryption",
        label: t("settings.encryption"),
        icon: KeyIcon,
        description:
          "End-to-end encryption keys, PGP certificates, and quantum-safe key rotation",
        keywords: [
          "e2e",
          "end to end",
          "pgp",
          "encryption key",
          "export key",
          "export public key",
          "export private key",
          "import key",
          "key rotation",
          "rotate key",
          "quantum",
          "pq",
          "post quantum",
          "zero access",
          "encrypt",
          "decrypt",
          "vault",
          "recovery codes",
          "regenerate codes",
          "storage format",
          "key algorithm",
          "ecc",
          "curve25519",
        ],
      },
      {
        id: "trusted_devices",
        label: t("settings.trusted_devices"),
        icon: ComputerDesktopIcon,
        description:
          "Devices authorized to access your account - revoke or sign out remotely",
        keywords: [
          "trusted devices",
          "my devices",
          "desktop app",
          "mobile app",
          "paired device",
          "revoke access",
          "sign out device",
          "remove device",
          "active sessions",
        ],
      },
      {
        id: "aliases",
        label: t("settings.alias_tab_aliases"),
        icon: AtSymbolIcon,
        description:
          "Custom email addresses that route mail to your inbox",
        keywords: [
          "alias",
          "email alias",
          "custom email",
          "email address",
          "forwarding address",
          "create alias",
          "ghost alias",
          "directories",
        ],
      },
      {
        id: "domains",
        label: t("settings.alias_tab_domains"),
        icon: GlobeAltIcon,
        description:
          "Domains you own or buy for sending and receiving mail",
        keywords: [
          "domain",
          "custom domain",
          "add domain",
          "buy domain",
          "purchase domain",
          "register domain",
          "domain search",
          "domain verification",
          "dns record",
          "mx record",
          "dkim",
          "spf",
          "dmarc",
        ],
      },
      ...(!on_onion
        ? [
            {
              id: "billing" as Section,
              label: t("settings.billing"),
              icon: CreditCardIcon,
              description:
                "Subscription plan, payment methods, invoices, storage add-ons, and upgrades",
              keywords: [
                "plan",
                "subscription",
                "upgrade plan",
                "downgrade plan",
                "payment method",
                "credit card",
                "invoice",
                "billing history",
                "storage",
                "storage addon",
                "add storage",
                "star plan",
                "supernova plan",
                "cancel subscription",
                "renew",
                "price",
              ],
            },
          ]
        : []),
      ...(!on_onion
        ? [
            {
              id: "storage" as Section,
              label: t("settings.storage"),
              icon: CircleStackIcon,
              description:
                "Storage usage by category, cleanup tools, and storage add-ons",
              keywords: [
                "storage",
                "space",
                "quota",
                "usage",
                "disk",
                "gb",
                "tb",
                "full",
                "storage addon",
                "add storage",
                "buy storage",
                "free up space",
                "empty trash",
                "empty spam",
                "attachments size",
              ],
            },
          ]
        : []),
      ...(is_family_plan
        ? [
            {
              id: "family" as Section,
              label: t("settings.plan_type_family"),
              icon: HomeModernIcon,
              description:
                "Manage family plan members, invites, and children's accounts",
              keywords: [
                "family plan",
                "family members",
                "invite member",
                "children accounts",
                "kids",
                "child account",
                "manage family",
                "family invite",
              ],
            },
          ]
        : []),
      {
        id: "referral",
        label: t("settings.invite_friends"),
        icon: UserGroupIcon,
        description:
          "Invite friends to Aster Mail and earn account credits as rewards",
        keywords: [
          "referral",
          "refer a friend",
          "invite friend",
          "referral code",
          "bonus storage",
          "reward",
          "share invite",
        ],
      },
    ],
    mail: [
      ...(!on_onion
        ? [
            {
              id: "import" as Section,
              label: t("common.import"),
              icon: ArrowDownTrayIcon,
              description:
                "Migrate your email from Gmail, Outlook, Proton, or any IMAP provider",
              keywords: [
                "import email",
                "migrate email",
                "gmail import",
                "google import",
                "outlook import",
                "yahoo import",
                "proton import",
                "imap import",
                "pop3 import",
                "migrate from",
                "thunderbird",
                "transfer email",
              ],
            },
          ]
        : []),
      {
        id: "bridge" as Section,
        label: t("settings.bridge"),
        icon: ArrowsRightLeftIcon,
        description:
          "Use Thunderbird, Apple Mail, or any IMAP/SMTP client with your Aster account",
        keywords: [
          "bridge",
          "aster bridge",
          "thunderbird",
          "apple mail",
          "smtp settings",
          "imap settings",
          "smtp port",
          "imap port",
          "mail client",
          "desktop client",
          "external client",
          "third party app",
          "connect app",
          "server settings",
        ],
      },
      {
        id: "notifications",
        label: t("settings.notifications"),
        icon: BellIcon,
        description:
          "Push alerts, notification sounds, badge counts, and email summaries",
        keywords: [
          "notifications",
          "push notifications",
          "desktop notifications",
          "notification sound",
          "badge count",
          "unread badge",
          "email alerts",
          "new mail notification",
          "notify me",
          "alert",
        ],
      },
      {
        id: "compose",
        label: t("settings.compose"),
        icon: PaintBrushIcon,
        description: "Default font size and text color for new messages",
        keywords: [
          "compose",
          "default font",
          "font size",
          "text size",
          "font color",
          "text color",
          "formatting",
          "new message",
        ],
      },
      {
        id: "signature",
        label: t("settings.signature"),
        icon: PencilSquareIcon,
        description:
          "Create HTML or plain-text signatures appended to outgoing messages",
        keywords: [
          "signature",
          "email signature",
          "html signature",
          "plain text signature",
          "sign off",
          "closing",
          "footer text",
          "add signature",
        ],
      },
      {
        id: "templates",
        label: t("settings.templates"),
        icon: DocumentTextIcon,
        description:
          "Save reusable message templates for faster email composition",
        keywords: [
          "templates",
          "email templates",
          "canned responses",
          "quick reply",
          "saved replies",
          "draft template",
          "message template",
          "reusable email",
        ],
      },
      {
        id: "behavior",
        label: t("settings.behavior"),
        icon: AdjustmentsHorizontalIcon,
        description:
          "Reading pane, message threading, undo send, and compose behavior",
        keywords: [
          "reading pane",
          "preview pane",
          "thread view",
          "conversation view",
          "group by thread",
          "undo send",
          "delay send",
          "send delay",
          "auto archive",
          "mark as read",
          "swipe action",
          "keyboard shortcuts",
        ],
      },
      {
        id: "categories",
        label: t("settings.categories_title"),
        icon: Squares2X2Icon,
        description:
          "Enable built-in inbox categories and create custom rule-based categories",
        keywords: [
          "categories",
          "inbox categories",
          "custom category",
          "category tabs",
          "primary",
          "social",
          "promotions",
          "updates",
          "forums",
          "finance",
          "travel",
          "shopping",
          "classify",
          "auto sort",
          "category rule",
          "domain match",
          "keyword match",
        ],
      },
      {
        id: "sender_filters",
        label: t("settings.mail_management"),
        icon: FunnelIcon,
        description:
          "Block senders, manage spam, allowlists, and forwarding rules",
        keywords: [
          "block sender",
          "blocked senders",
          "blocklist",
          "allowlist",
          "whitelist",
          "safe senders",
          "spam filter",
          "junk mail",
          "forward mail",
          "email forwarding",
          "ban sender",
          "unblock",
        ],
      },
      {
        id: "mail_rules",
        label: t("mail_rules.title"),
        icon: BoltIcon,
        description:
          "Automate inbox organization with conditions, labels, and folder actions",
        keywords: [
          "mail rules",
          "email rules",
          "filters",
          "auto label",
          "auto archive",
          "auto forward",
          "auto move",
          "inbox automation",
          "rule condition",
          "rule action",
          "organize mail",
          "sorting rules",
        ],
      },
      {
        id: "feedback",
        label: t("settings.feedback"),
        icon: ChatBubbleBottomCenterTextIcon,
        description:
          "Report bugs, request features, or get in touch with the Aster team",
        keywords: [
          "feedback",
          "report bug",
          "bug report",
          "feature request",
          "contact support",
          "help",
          "get help",
          "support ticket",
          "send feedback",
        ],
      },
    ],
  };
}
