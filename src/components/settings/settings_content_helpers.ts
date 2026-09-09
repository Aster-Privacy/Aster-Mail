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
  ShieldCheckIcon,
  ArrowDownTrayIcon,
  BellIcon,
  PaintBrushIcon,
  AdjustmentsHorizontalIcon,
  AtSymbolIcon,
  GlobeAltIcon,
  CreditCardIcon,
  ArrowsRightLeftIcon,
  BoltIcon,
  ChatBubbleBottomCenterTextIcon,
  CircleStackIcon,
  UserGroupIcon,
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
  "appearance",
  "account",
  "security",
  "aliases",
  "domains",
  "storage",
  "billing",
  "referral",
  "notifications",
  "behavior",
  "compose",
  "mail_rules",
  "import",
  "bridge",
  "feedback",
];

export function is_settings_section(value: string): value is SettingsSection {
  return (SETTINGS_SECTION_IDS as string[]).includes(value);
}

const SECTION_ALIASES: Record<string, SettingsSection> = {
  storage_addons: "storage",
  credits: "billing",
  ghost_aliases: "aliases",
  alias_directories: "aliases",
  connection: "bridge",
  smtp_tokens: "bridge",
  plans: "billing",
  subscription: "billing",
  about: "feedback",
  help: "feedback",
};

const SECTION_TAB_ALIASES: Record<
  string,
  { section: SettingsSection; tab: string }
> = {
  accessibility: { section: "appearance", tab: "accessibility" },
  trusted_devices: { section: "security", tab: "trusted_devices" },
  encryption: { section: "security", tab: "encryption" },
  family: { section: "billing", tab: "family" },
  categories: { section: "behavior", tab: "categories" },
  signature: { section: "compose", tab: "signature" },
  signatures: { section: "compose", tab: "signature" },
  templates: { section: "compose", tab: "templates" },
  sender_filters: { section: "mail_rules", tab: "blocked" },
  blocked: { section: "mail_rules", tab: "blocked" },
  allowlist: { section: "mail_rules", tab: "allowlist" },
  auto_forward: { section: "mail_rules", tab: "auto_forward" },
  vacation_reply: { section: "mail_rules", tab: "vacation_reply" },
  external_accounts: { section: "import", tab: "external_accounts" },
  export: { section: "import", tab: "export" },
  updates: { section: "feedback", tab: "updates" },
  developer: { section: "feedback", tab: "developer" },
};

export const SETTINGS_TAB_EVENT = "astermail:settings-tab";

let pending_settings_tab: string | null = null;

export function request_settings_tab(tab: string) {
  pending_settings_tab = tab;

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(SETTINGS_TAB_EVENT, { detail: tab }));
  }
}

export function consume_settings_tab(): string | null {
  const tab = pending_settings_tab;

  pending_settings_tab = null;

  return tab;
}

export interface NavTarget {
  section: SettingsSection;
  tab?: string;
}

export function resolve_nav_target(candidate: string): NavTarget {
  if (is_settings_section(candidate)) return { section: candidate };

  const tab_alias = SECTION_TAB_ALIASES[candidate];

  if (tab_alias) return { section: tab_alias.section, tab: tab_alias.tab };

  const alias = SECTION_ALIASES[candidate];

  return { section: alias ?? (candidate as SettingsSection) };
}

export function resolve_settings_section(
  candidate: string | null | undefined,
): SettingsSection | undefined {
  if (!candidate) return undefined;
  const key = candidate.trim();

  if (is_settings_section(key)) return key;

  const tab_alias = SECTION_TAB_ALIASES[key];

  if (tab_alias) {
    request_settings_tab(tab_alias.tab);

    return tab_alias.section;
  }

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
  const resolved = stored ? resolve_settings_section(stored) : undefined;

  if (resolved) {
    persisted_section = resolved;
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

export interface NavGroup {
  id: "general" | "addresses" | "billing" | "mail" | "advanced";
  label: string;
  items: NavItem[];
}

export type NavItems = NavGroup[];

export function flatten_nav_items(groups: NavItems): NavItem[] {
  return groups.flatMap((group) => group.items);
}

export function get_nav_items(
  t: (key: TranslationKey) => string,
  is_family_plan?: boolean,
): NavItems {
  const on_onion = is_onion_host();

  const general: NavItem[] = [
    {
      id: "appearance",
      label: t("settings.appearance"),
      icon: SwatchIcon,
      description:
        "Theme, color scheme, language, date format, layout density, and accessibility",
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
        "accessibility",
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
      id: "security",
      label: t("settings.security"),
      icon: ShieldCheckIcon,
      description:
        "Password, two-factor authentication, passkeys, trusted devices, and encryption keys",
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
        "trusted devices",
        "my devices",
        "desktop app",
        "mobile app",
        "paired device",
        "revoke access",
        "sign out device",
        "remove device",
        "encryption",
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
        "post quantum",
        "zero access",
        "encrypt",
        "decrypt",
        "vault",
        "storage format",
        "key algorithm",
        "ecc",
        "curve25519",
      ],
    },
    {
      id: "aliases",
      label: t("settings.alias_tab_aliases"),
      icon: AtSymbolIcon,
      description: "Custom email addresses that route mail to your inbox",
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
      description: "Domains you own or buy for sending and receiving mail",
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
    {
      id: "billing" as Section,
      label: t("settings.billing"),
      icon: CreditCardIcon,
      description:
        "Subscription plan, payment methods, invoices, family members, and referrals",
      keywords: [
        "plan",
        "subscription",
        "upgrade plan",
        "downgrade plan",
        "payment method",
        "credit card",
        "invoice",
        "billing history",
        "storage addon",
        "add storage",
        "star plan",
        "supernova plan",
        "cancel subscription",
        "renew",
        "price",
        ...(is_family_plan
          ? [
              "family plan",
              "family members",
              "invite member",
              "children accounts",
              "child account",
              "manage family",
            ]
          : []),
      ],
    },
    ...(!on_onion
      ? [
          {
            id: "referral" as Section,
            label: t("settings.invite_friends"),
            icon: UserGroupIcon,
            description:
              "Your invite link, referral rewards, and affiliate payouts",
            keywords: [
              "referral",
              "refer a friend",
              "invite friend",
              "invite friends",
              "referral code",
              "invite link",
              "reward",
              "share invite",
              "affiliate",
              "payout",
            ],
          },
        ]
      : []),
  ];

  const mail: NavItem[] = [
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
      id: "behavior",
      label: t("settings.reading_and_conversations"),
      icon: AdjustmentsHorizontalIcon,
      description:
        "Reading pane, message threading, swipe actions, and inbox categories",
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
        "categories",
        "inbox categories",
        "custom category",
        "category tabs",
        "primary",
        "social",
        "promotions",
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
      id: "compose",
      label: t("settings.compose"),
      icon: PaintBrushIcon,
      description:
        "Default font and color for new messages, signatures, and saved templates",
      keywords: [
        "compose",
        "default font",
        "font size",
        "text size",
        "font color",
        "text color",
        "formatting",
        "new message",
        "signature",
        "email signature",
        "html signature",
        "plain text signature",
        "sign off",
        "closing",
        "footer text",
        "add signature",
        "templates",
        "email templates",
        "canned responses",
        "quick reply",
        "saved replies",
        "message template",
        "reusable email",
      ],
    },
    {
      id: "mail_rules",
      label: t("mail_rules.title"),
      icon: BoltIcon,
      description:
        "Automate your inbox, block or allow senders, forward mail, and set an auto-reply",
      keywords: [
        "mail rules",
        "email rules",
        "filters",
        "auto label",
        "auto archive",
        "auto move",
        "inbox automation",
        "rule condition",
        "rule action",
        "organize mail",
        "sorting rules",
        "block sender",
        "blocked senders",
        "blocklist",
        "allowlist",
        "whitelist",
        "safe senders",
        "spam filter",
        "junk mail",
        "ban sender",
        "unblock",
        "auto forward",
        "forward mail",
        "email forwarding",
        "vacation reply",
        "out of office",
        "auto reply",
        "away message",
      ],
    },
  ];

  const advanced: NavItem[] = [
    ...(!on_onion
      ? [
          {
            id: "import" as Section,
            label: t("common.import"),
            icon: ArrowDownTrayIcon,
            description:
              "Migrate mail from another provider, connect external accounts, and export your mailbox",
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
              "external account",
              "connected account",
              "link account",
              "export",
              "download mail",
              "mbox",
              "backup",
            ],
          },
        ]
      : []),
    {
      id: "bridge" as Section,
      label: t("settings.bridge"),
      icon: ArrowsRightLeftIcon,
      description:
        "Use any IMAP, SMTP, POP3, or JMAP mail client with your Aster account",
      keywords: [
        "bridge",
        "aster bridge",
        "thunderbird",
        "apple mail",
        "smtp settings",
        "imap settings",
        "smtp port",
        "imap port",
        "jmap",
        "pop3",
        "mail client",
        "desktop client",
        "external client",
        "third party app",
        "connect app",
        "server settings",
        "app password",
      ],
    },
    {
      id: "feedback",
      label: t("common.help"),
      icon: ChatBubbleBottomCenterTextIcon,
      description:
        "Report bugs, request features, check for app updates, and open developer tools",
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
        "about",
        "app version",
        "update",
        "check for updates",
        "auto update",
        "release notes",
        "developer",
        "dev mode",
        "api token",
        "access token",
        "debug",
        "diagnostics",
      ],
    },
  ];

  const pick = (ids: Section[]): NavItem[] =>
    ids
      .map((id) => general.find((item) => item.id === id))
      .filter((item): item is NavItem => Boolean(item));

  return [
    {
      id: "general",
      label: t("settings.general"),
      items: pick(["appearance", "account", "security"]),
    },
    {
      id: "addresses",
      label: t("settings.aliases_and_domains"),
      items: pick(["aliases", "domains"]),
    },
    {
      id: "billing",
      label: t("settings.billing"),
      items: pick(["storage", "billing", "referral"]),
    },
    { id: "mail", label: t("common.mail"), items: mail },
    { id: "advanced", label: t("settings.advanced"), items: advanced },
  ];
}
