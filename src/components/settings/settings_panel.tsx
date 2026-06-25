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
import type { TranslationKey } from "@/lib/i18n";
import { SETTINGS_SEARCH_REGISTRY } from "@/components/settings/search_registry";
import { SearchRegistryProvider, use_search_registry } from "@/components/settings/search_context";

import {
  useState,
  useEffect,
  useRef,
  useLayoutEffect,
  useCallback,
  useMemo,
  lazy,
  Suspense,
} from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  XMarkIcon,
  BuildingOffice2Icon,
  SwatchIcon,
  EyeIcon,
  EyeSlashIcon,
  ShieldCheckIcon,
  ArrowDownTrayIcon,
  BellIcon,
  PencilSquareIcon,
  AdjustmentsHorizontalIcon,
  AtSymbolIcon,
  CreditCardIcon,
  KeyIcon,
  CodeBracketIcon,
  DocumentTextIcon,
  ArrowUturnLeftIcon,
  ArrowsRightLeftIcon,
  FunnelIcon,
  BoltIcon,
  ChatBubbleBottomCenterTextIcon,
  ComputerDesktopIcon,
  UserGroupIcon,
  HomeModernIcon,
  MagnifyingGlassIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";

import { use_should_reduce_motion } from "@/provider";
import { use_i18n } from "@/lib/i18n/context";
import { get_dev_mode } from "@/services/api/preferences";
import {
  get_available_plans,
  get_billing_history,
  get_plan_limits,
  get_storage_addons,
  get_credits,
} from "@/services/api/billing";
import { get_vault_from_memory } from "@/services/crypto/memory_key_store";
import { AccountSection } from "@/components/settings/account_section";
import { AppearanceSection } from "@/components/settings/appearance_section";
import { AccessibilitySection } from "@/components/settings/accessibility_section";
import { SecuritySection } from "@/components/settings/security_section";
import { ImportSection } from "@/components/settings/import_section";
import { NotificationsSection } from "@/components/settings/notifications_section";
import { SignatureSection } from "@/components/settings/signature_section";
import { BehaviorSection } from "@/components/settings/behavior_section";
import { AliasesSection } from "@/components/settings/aliases_section";
const BillingSection = lazy(() =>
  import("@/components/settings/billing_section").then((m) => ({
    default: m.BillingSection,
  })),
);
const load_family_section = () =>
  import("@/components/settings/billing/family_section");
const FamilySection = lazy(() =>
  load_family_section().then((m) => ({
    default: m.FamilySection,
  })),
);

import { EncryptionSection } from "@/components/settings/encryption_section";
import { DeveloperSection } from "@/components/settings/developer_section";
import { UpdatesSection } from "@/components/settings/updates_section";
import { is_desktop_runtime } from "@/services/updates/updater";
import { TemplatesSection } from "@/components/settings/templates_section";
import { MailManagementSection } from "@/components/settings/mail_management_section";
import { MailRulesSection } from "@/components/settings/mail_rules_section";
import { FeedbackSection } from "@/components/settings/feedback_section";
import { GhostAliasesSection } from "@/components/settings/ghost_aliases_section";
import { ReferralTab } from "@/components/settings/referral_tab";
import { BridgeSection } from "@/components/settings/bridge_section";
import { SmtpTokensSection } from "@/components/settings/smtp_tokens_section";
import { TrustedDevicesPanel } from "@/components/settings/trusted_devices_panel";
import { SettingsSaveIndicator } from "@/components/settings/settings_save_indicator";
import { use_settings_prefetch } from "@/components/settings/hooks/use_settings_prefetch";
import { SettingsCacheProvider } from "@/contexts/settings_cache_context";
import { list_devices } from "@/services/api/devices";
import { prefetch_family_group, get_family_group } from "@/services/api/family";
import { is_onion_host } from "@/lib/onion_host";

export type SettingsSection =
  | "account"
  | "appearance"
  | "accessibility"
  | "security"
  | "encryption"
  | "trusted_devices"
  | "aliases"
  | "ghost_aliases"
  | "billing"
  | "family"
  | "referral"
  | "import"
  | "notifications"
  | "signature"
  | "templates"
  | "behavior"
  | "sender_filters"
  | "mail_rules"
  | "feedback"
  | "updates"
  | "developer"
  | "bridge"
  | "smtp_tokens";

type Section = SettingsSection;

interface SettingsPanelProps {
  is_open: boolean;
  on_close: () => void;
  initial_section?: Section;
}

let persisted_section: Section | null = null;

function get_persisted_section(): Section | null {
  return persisted_section;
}

function set_persisted_section(section: Section) {
  persisted_section = section;
}

interface NavItem {
  id: Section;
  label: string;
  icon: React.ElementType;
  keywords: string[];
  description: string;
}

interface NavItems {
  general: NavItem[];
  mail: NavItem[];
}

function get_nav_items(
  t: (key: TranslationKey) => string,
  is_family_plan?: boolean,
): NavItems {
  const on_onion = is_onion_host();

  return {
    general: [
      { id: "appearance", label: t("settings.appearance"), icon: SwatchIcon, description: "Theme, color scheme, language, date format, and layout density", keywords: ["theme", "dark mode", "light mode", "system theme", "color", "layout", "compact", "density", "font", "language", "locale", "time format", "date format", "24 hour", "12 hour", "clock", "timezone"] },
      { id: "account", label: t("settings.account"), icon: BuildingOffice2Icon, description: "Display name, profile photo, recovery email, and account deletion", keywords: ["profile", "display name", "username", "avatar", "photo", "profile picture", "change name", "recovery email", "inactivity timeout", "auto logout", "delete account", "close account", "deactivate"] },
      { id: "accessibility", label: t("settings.accessibility"), icon: EyeIcon, description: "Font size, reduce motion, keyboard navigation, and screen reader support", keywords: ["font size", "text size", "reduce motion", "animations", "focus ring", "keyboard navigation", "screen reader", "high contrast", "dyslexia"] },
      { id: "security", label: t("settings.security"), icon: ShieldCheckIcon, description: "Password, two-factor authentication, passkeys, hardware keys, and recovery codes", keywords: ["password", "change password", "2fa", "two factor", "two-factor authentication", "totp", "authenticator app", "google authenticator", "passkey", "hardware key", "yubikey", "fido", "webauthn", "biometric", "face id", "touch id", "backup codes", "recovery codes", "login history", "sign out all devices", "active sessions", "security checkup"] },
      { id: "encryption", label: t("settings.encryption"), icon: KeyIcon, description: "End-to-end encryption keys, PGP certificates, and quantum-safe key rotation", keywords: ["e2e", "end to end", "pgp", "encryption key", "export key", "export public key", "export private key", "import key", "key rotation", "rotate key", "quantum", "pq", "post quantum", "zero access", "encrypt", "decrypt", "vault", "recovery codes", "regenerate codes", "storage format", "key algorithm", "ecc", "curve25519"] },
      { id: "trusted_devices", label: t("settings.trusted_devices"), icon: ComputerDesktopIcon, description: "Devices authorized to access your account - revoke or sign out remotely", keywords: ["trusted devices", "my devices", "desktop app", "mobile app", "paired device", "revoke access", "sign out device", "remove device", "active sessions"] },
      { id: "aliases", label: t("settings.aliases_and_domains"), icon: AtSymbolIcon, description: "Custom email addresses and domains that route mail to your inbox", keywords: ["alias", "email alias", "custom domain", "add domain", "domain verification", "dns record", "mx record", "dkim", "spf", "dmarc", "custom email", "email address", "forwarding address", "create alias"] },
      { id: "ghost_aliases", label: t("settings.ghost_aliases"), icon: EyeSlashIcon, description: "One-time anonymous addresses to protect your real email from sign-ups", keywords: ["ghost alias", "anonymous email", "private email", "disposable", "masked email", "hide email", "burn address", "one-time address", "privacy"] },
      ...(!on_onion ? [{ id: "billing" as Section, label: t("settings.billing"), icon: CreditCardIcon, description: "Subscription plan, payment methods, invoices, storage add-ons, and upgrades", keywords: ["plan", "subscription", "upgrade plan", "downgrade plan", "payment method", "credit card", "invoice", "billing history", "storage", "storage addon", "add storage", "star plan", "supernova plan", "cancel subscription", "renew", "price"] }] : []),
      ...(is_family_plan ? [{ id: "family" as Section, label: t("settings.plan_type_family"), icon: HomeModernIcon, description: "Manage family plan members, invites, and children's accounts", keywords: ["family plan", "family members", "invite member", "children accounts", "kids", "child account", "manage family", "family invite"] }] : []),
      { id: "referral", label: t("settings.refer_a_friend"), icon: UserGroupIcon, description: "Invite friends to Aster Mail and earn account credits as rewards", keywords: ["referral", "refer a friend", "invite friend", "referral code", "bonus storage", "reward", "share invite"] },
    ],
    mail: [
      ...(!on_onion ? [{ id: "import" as Section, label: t("common.import"), icon: ArrowDownTrayIcon, description: "Migrate your email from Gmail, Outlook, Proton, or any IMAP provider", keywords: ["import email", "migrate email", "gmail import", "google import", "outlook import", "yahoo import", "proton import", "imap import", "pop3 import", "migrate from", "thunderbird", "transfer email"] }] : []),
      { id: "bridge" as Section, label: t("settings.bridge"), icon: ArrowsRightLeftIcon, description: "Use Thunderbird, Apple Mail, or any IMAP/SMTP client with your Aster account", keywords: ["bridge", "aster bridge", "thunderbird", "apple mail", "smtp settings", "imap settings", "smtp port", "imap port", "mail client", "desktop client", "external client", "third party app", "connect app", "server settings"] },
      { id: "notifications", label: t("settings.notifications"), icon: BellIcon, description: "Push alerts, notification sounds, badge counts, and email summaries", keywords: ["notifications", "push notifications", "desktop notifications", "notification sound", "badge count", "unread badge", "email alerts", "new mail notification", "notify me", "alert"] },
      { id: "signature", label: t("settings.signature"), icon: PencilSquareIcon, description: "Create HTML or plain-text signatures appended to outgoing messages", keywords: ["signature", "email signature", "html signature", "plain text signature", "sign off", "closing", "footer text", "add signature"] },
      { id: "templates", label: t("settings.templates"), icon: DocumentTextIcon, description: "Save reusable message templates for faster email composition", keywords: ["templates", "email templates", "canned responses", "quick reply", "saved replies", "draft template", "message template", "reusable email"] },
      { id: "behavior", label: t("settings.behavior"), icon: AdjustmentsHorizontalIcon, description: "Reading pane, message threading, undo send, and compose behavior", keywords: ["reading pane", "preview pane", "thread view", "conversation view", "group by thread", "undo send", "delay send", "send delay", "auto archive", "mark as read", "read receipts", "swipe action", "keyboard shortcuts"] },
      { id: "sender_filters", label: t("settings.mail_management"), icon: FunnelIcon, description: "Block senders, manage spam, allowlists, and forwarding rules", keywords: ["block sender", "blocked senders", "blocklist", "allowlist", "whitelist", "safe senders", "spam filter", "junk mail", "forward mail", "email forwarding", "ban sender", "unblock"] },
      { id: "mail_rules", label: t("mail_rules.title"), icon: BoltIcon, description: "Automate inbox organization with conditions, labels, and folder actions", keywords: ["mail rules", "email rules", "filters", "auto label", "auto archive", "auto forward", "auto move", "inbox automation", "rule condition", "rule action", "organize mail", "sorting rules"] },
      { id: "feedback", label: t("settings.feedback"), icon: ChatBubbleBottomCenterTextIcon, description: "Report bugs, request features, or get in touch with the Aster team", keywords: ["feedback", "report bug", "bug report", "feature request", "contact support", "help", "get help", "support ticket", "send feedback"] },
    ],
  };
}



export function SettingsPanel(props: SettingsPanelProps) {
  return (
    <SearchRegistryProvider>
      <SettingsCacheProvider>
        <SettingsPanelInner {...props} />
      </SettingsCacheProvider>
    </SearchRegistryProvider>
  );
}

function SettingsPanelInner({
  is_open,
  on_close,
  initial_section,
}: SettingsPanelProps) {
  use_settings_prefetch(is_open);
  const reduce_motion = use_should_reduce_motion();
  const { t } = use_i18n();
  const navigate = useNavigate();
  const [section, set_section] = useState<Section>(
    initial_section || get_persisted_section() || "appearance",
  );
  const [show_mobile_nav, set_show_mobile_nav] = useState(true);
  const was_open_ref = useRef(false);
  const animation_complete_ref = useRef(false);
  const [is_suspended, set_is_suspended] = useState(
    () => sessionStorage.getItem("aster_suspended") === "true",
  );
  const [dev_mode_enabled, set_dev_mode_enabled] = useState(false);
  const [has_devices, set_has_devices] = useState(false);
  const [is_family_plan, set_is_family_plan] = useState(
    () => localStorage.getItem("aster_is_family_plan") === "1",
  );
  const [search_query, set_search_query] = useState("");
  const [scroll_target, set_scroll_target] = useState<string | null>(null);

  useEffect(() => {
    if (is_open && is_family_plan) {
      load_family_section();
      prefetch_family_group();
    }
  }, [is_open, is_family_plan]);

  const NAV_ITEMS_BASE = useMemo(() => get_nav_items(t, is_family_plan), [t, is_family_plan]);
  const [indicator_style, set_indicator_style] = useState<{
    top: number;
    height: number;
    opacity: number;
  }>({ top: 0, height: 32, opacity: 0 });
  const [should_animate_indicator, set_should_animate_indicator] =
    useState(false);
  const nav_container_ref = useRef<HTMLDivElement>(null);
  const content_container_ref = useRef<HTMLDivElement>(null);
  const nav_item_refs = useRef<Record<Section, HTMLButtonElement | null>>({
    account: null,
    appearance: null,
    accessibility: null,
    security: null,
    encryption: null,
    trusted_devices: null,
    aliases: null,
    ghost_aliases: null,
    billing: null,
    family: null,
    referral: null,
    import: null,
    notifications: null,
    signature: null,
    templates: null,
    behavior: null,
    sender_filters: null,
    mail_rules: null,
    feedback: null,
    developer: null,
    updates: null,
    bridge: null,
    smtp_tokens: null,
  });

  const handle_account_deleted = useCallback(() => {
    on_close();
    navigate("/sign-in");
  }, [on_close, navigate]);

  useEffect(() => {
    if (!is_open) return;
    void import("@/components/settings/billing_section").catch(() => {});
  }, [is_open]);

  useLayoutEffect(() => {
    if (is_open && !was_open_ref.current) {
      set_section(initial_section || get_persisted_section() || "appearance");
      set_show_mobile_nav(true);
      animation_complete_ref.current = false;

      get_family_group().then((res) => {
        const is_fam = !!res.data;
        set_is_family_plan(is_fam);
        localStorage.setItem("aster_is_family_plan", is_fam ? "1" : "0");
      }).catch(() => {});
      get_available_plans();
      get_billing_history(1, 10);
      get_plan_limits();
      get_storage_addons();
      get_credits();
      list_devices().then((res) => {
        set_has_devices((res.data?.devices?.length ?? 0) > 0);
      });
    } else if (!is_open) {
      animation_complete_ref.current = false;
      set_search_query("");
    }
    was_open_ref.current = is_open;
  }, [is_open, initial_section]);

  useEffect(() => {
    if (!is_open) return;

    const handle_navigate_section = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail;

      if (detail) {
        set_section(detail as Section);
      }
    };

    window.addEventListener(
      "astermail:navigate-settings-section",
      handle_navigate_section,
    );

    return () => {
      window.removeEventListener(
        "astermail:navigate-settings-section",
        handle_navigate_section,
      );
    };
  }, [is_open]);

  useEffect(() => {
    if (!is_open) return;
    const srcs = [
      "/settings/direct.webp",
      "/settings/tor.webp",
      "/settings/snow_tor.webp",
      "/settings/cdn.webp",
      "/settings/aster_server.webp",
      "/settings/decentralized.webp",
    ];

    srcs.forEach((src) => {
      const img = new Image();

      img.src = src;
    });
  }, [is_open]);

  useEffect(() => {
    if (!is_open) return;

    const load_dev_mode = async () => {
      const vault = get_vault_from_memory();
      const result = await get_dev_mode(vault);

      set_dev_mode_enabled(result.data);
    };

    load_dev_mode();
  }, [is_open]);

  useEffect(() => {
    const handle_dev_mode_change = (e: Event) => {
      set_dev_mode_enabled((e as CustomEvent<boolean>).detail);
    };

    const handle_navigate_section = (e: Event) => {
      const detail = (
        e as CustomEvent<string | { section: string; anchor?: string }>
      ).detail;
      const value = (
        typeof detail === "string" ? detail : detail?.section
      ) as Section;
      const anchor = typeof detail === "string" ? undefined : detail?.anchor;

      if (!value) return;

      set_section(value);
      set_persisted_section(value);

      if (anchor) {
        requestAnimationFrame(() =>
          document
            .getElementById(anchor)
            ?.scrollIntoView({ behavior: "smooth", block: "start" }),
        );
      }
    };

    const handle_plan_changed = () => {
      get_family_group().then((res) => {
        const is_fam = !!res.data;
        set_is_family_plan(is_fam);
        localStorage.setItem("aster_is_family_plan", is_fam ? "1" : "0");
      }).catch(() => {});
    };

    window.addEventListener("dev-mode-changed", handle_dev_mode_change);
    window.addEventListener("navigate-settings", handle_navigate_section);
    window.addEventListener("aster:plan-changed", handle_plan_changed);

    return () => {
      window.removeEventListener("dev-mode-changed", handle_dev_mode_change);
      window.removeEventListener("navigate-settings", handle_navigate_section);
      window.removeEventListener("aster:plan-changed", handle_plan_changed);
    };
  }, []);

  useEffect(() => {
    const handle_suspended = () => set_is_suspended(true);

    window.addEventListener("aster:account-suspended", handle_suspended);

    return () =>
      window.removeEventListener("aster:account-suspended", handle_suspended);
  }, []);

  useEffect(() => {
    if (!is_open) return;
    const handle_key = (e: KeyboardEvent) =>
      e["key"] === "Escape" && on_close();

    document.addEventListener("keydown", handle_key);

    return () => document.removeEventListener("keydown", handle_key);
  }, [is_open, on_close]);

  useEffect(() => {
    content_container_ref.current?.scrollTo(0, 0);
  }, [section]);

  const nav_items = useMemo((): NavItems => {
    const base = NAV_ITEMS_BASE;
    const general = has_devices
      ? base.general
      : base.general.filter((item) => item.id !== "trusted_devices");
    const mail = [...base.mail];
    if (is_desktop_runtime()) {
      mail.push({ id: "updates" as Section, label: t("settings.updates"), icon: ArrowDownTrayIcon, description: "Check for app updates and manage auto-update settings", keywords: ["update", "check for updates", "auto update", "automatic updates", "app version", "version history", "release notes", "update available"] });
    }
    if (dev_mode_enabled) {
      mail.push({ id: "developer" as Section, label: t("settings.developer"), icon: CodeBracketIcon, description: "API tokens, developer mode, request logs, and diagnostics", keywords: ["developer", "dev mode", "api token", "access token", "debug", "request logs", "diagnostics", "developer tools"] });
    }
    return { general, mail };
  }, [NAV_ITEMS_BASE, dev_mode_enabled, has_devices, t]);

  const is_searching = search_query.trim().length > 0;

  const search_results = useMemo(() => {
    const q = search_query.trim().toLowerCase();
    if (!q) return [] as NavItem[];
    const match = (item: NavItem) =>
      item.label.toLowerCase().includes(q) ||
      item.description.toLowerCase().includes(q) ||
      item.keywords.some((kw) => kw.includes(q));
    return [...nav_items.general, ...nav_items.mail].filter(match);
  }, [search_query, nav_items]);

  const { dynamic_entries } = use_search_registry();

  const registry_results = useMemo(() => {
    const q = search_query.trim().toLowerCase();
    if (q.length < 2) return [];
    const visible_sections = new Set([
      ...nav_items.general.map((i) => i.id),
      ...nav_items.mail.map((i) => i.id),
    ]);
    const all = [...SETTINGS_SEARCH_REGISTRY, ...dynamic_entries];
    const seen = new Set<string>();
    return all.filter((entry) => {
      if (!visible_sections.has(entry.section)) return false;
      const matches =
        entry.label.toLowerCase().includes(q) ||
        entry.breadcrumb.toLowerCase().includes(q) ||
        entry.keywords?.some((kw) => kw.includes(q));
      if (!matches) return false;
      const key = `${entry.section}::${entry.label}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 12);
  }, [search_query, nav_items, dynamic_entries]);

  useEffect(() => {
    if (!scroll_target) return;
    const container = content_container_ref.current;
    if (!container) return;
    const timer = setTimeout(() => {
      const lower = scroll_target.toLowerCase();
      const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          const tag = node.parentElement?.tagName.toLowerCase();
          if (tag && ["script", "style", "input", "textarea"].includes(tag)) return NodeFilter.FILTER_REJECT;
          return node.textContent?.toLowerCase().includes(lower)
            ? NodeFilter.FILTER_ACCEPT
            : NodeFilter.FILTER_REJECT;
        },
      });
      const found = walker.nextNode() as Text | null;
      const target_el = found?.parentElement;
      if (target_el) {
        target_el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      set_scroll_target(null);
    }, 120);
    return () => clearTimeout(timer);
  }, [scroll_target, section]);

  useLayoutEffect(() => {
    if (!is_open) {
      set_should_animate_indicator(false);

      return;
    }

    const update_indicator = () => {
      const target_button = nav_item_refs.current[section];

      if (target_button && nav_container_ref.current) {
        set_indicator_style({
          top: target_button.offsetTop,
          height: target_button.offsetHeight,
          opacity: 1,
        });
      }
    };

    if (!animation_complete_ref.current) {
      animation_complete_ref.current = true;
      update_indicator();
      requestAnimationFrame(() => {
        set_should_animate_indicator(true);
      });

      return;
    }

    requestAnimationFrame(update_indicator);
  }, [section, is_open, nav_items]);

  useEffect(() => {
    if (!is_open || !nav_container_ref.current) return;

    const recalculate = () => {
      const target_button = nav_item_refs.current[section];

      if (target_button && nav_container_ref.current) {
        set_indicator_style({
          top: target_button.offsetTop,
          height: target_button.offsetHeight,
          opacity: 1,
        });
      }
    };

    const observer = new ResizeObserver(recalculate);

    observer.observe(nav_container_ref.current);

    return () => observer.disconnect();
  }, [is_open, section]);

  const active_section_element = useMemo(() => {
    switch (section) {
      case "account":
        return <AccountSection />;
      case "appearance":
        return <AppearanceSection />;
      case "accessibility":
        return <AccessibilitySection />;
      case "security":
        return <SecuritySection on_account_deleted={handle_account_deleted} />;
      case "encryption":
        return <EncryptionSection />;
      case "trusted_devices":
        return <TrustedDevicesPanel />;
      case "aliases":
        return <AliasesSection />;
      case "ghost_aliases":
        return <GhostAliasesSection />;
      case "billing":
        if (is_onion_host()) {
          return null;
        }
        return (
          <Suspense fallback={null}>
            <BillingSection />
          </Suspense>
        );
      case "family":
        return null;
      case "referral":
        return <ReferralTab />;
      case "import":
        if (is_onion_host()) {
          return null;
        }
        return <ImportSection />;
      case "notifications":
        return <NotificationsSection />;
      case "signature":
        return <SignatureSection />;
      case "templates":
        return <TemplatesSection />;
      case "behavior":
        return <BehaviorSection />;
      case "sender_filters":
        return <MailManagementSection />;
      case "mail_rules":
        return <MailRulesSection />;
      case "feedback":
        return <FeedbackSection />;
      case "developer":
        return <DeveloperSection />;
      case "updates":
        return <UpdatesSection />;
      case "bridge":
        return <BridgeSection />;
      case "smtp_tokens":
        return <SmtpTokensSection />;
      default:
        return null;
    }
  }, [section, handle_account_deleted]);

  const handle_desktop_nav_click = useCallback((item_id: Section) => {
    set_section(item_id);
    set_persisted_section(item_id);
    set_search_query("");
    window.history.pushState({}, "", `/settings/${item_id}`);
  }, []);

  const render_nav_item = (item: NavItem) => {
    const is_selected = section === item.id;

    return (
      <button
        key={item.id}
        ref={(el) => { nav_item_refs.current[item.id] = el; }}
        className="w-full flex items-center gap-2.5 px-2.5 h-8 rounded-[12px] text-[13px] transition-colors duration-150 relative z-[1] outline-none focus:outline-none"
        style={{ color: is_selected ? "var(--text-primary)" : "var(--text-secondary)" }}
        onClick={() => handle_desktop_nav_click(item.id)}
      >
        <item.icon className="w-[17px] h-[17px] flex-shrink-0" style={{ transform: "translateZ(0)" }} />
        <span className="truncate">{item.label}</span>
      </button>
    );
  };

  const render_mobile_nav_item = (item: NavItem) => {
    return (
      <button
        key={item.id}
        className="w-full flex items-center gap-3 px-4 py-3 text-[15px] transition-colors duration-150 text-txt-primary border-b border-b-edge-primary border border-edge-primary"
        onClick={() => {
          set_section(item.id);
          set_persisted_section(item.id);
          set_search_query("");
          set_show_mobile_nav(false);
        }}
      >
        <item.icon className="w-5 h-5 flex-shrink-0 text-txt-secondary" />
        <span>{item.label}</span>
      </button>
    );
  };

  const get_current_section_label = () => {
    const all_items = [...nav_items.general, ...nav_items.mail];
    const item = all_items.find((i) => i.id === section);

    return item?.label || t("settings.title");
  };

  return (
    <AnimatePresence>
      {is_open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-0 md:p-4">
          <motion.div
            animate={{ opacity: 1 }}
            className="absolute inset-0"
            exit={{ opacity: 0 }}
            initial={reduce_motion ? false : { opacity: 0 }}
            style={{ backgroundColor: "var(--modal-overlay)" }}
            transition={{ duration: reduce_motion ? 0 : 0.15 }}
            onClick={on_close}
          />
          <motion.div
            animate={{ scale: 1, opacity: 1, y: 0 }}
            className="relative flex flex-col md:flex-row w-full h-full md:w-[80vw] md:max-w-[1200px] md:h-[80vh] md:max-h-[900px] md:rounded-2xl overflow-hidden bg-surf-primary"
            exit={{ scale: 0.95, opacity: 0, y: 8 }}
            initial={reduce_motion ? false : { scale: 0.95, opacity: 0, y: 8 }}
            style={{
              border: "1px solid var(--border-secondary)",
            }}
            transition={{
              duration: reduce_motion ? 0 : 0.2,
              ease: [0.16, 1, 0.3, 1],
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <nav
              className="hidden md:flex w-52 px-3 py-4 flex-col overflow-y-auto flex-shrink-0"
              style={{
                backgroundColor: "var(--sidebar-bg)",
                borderRight: "1px solid var(--border-primary)",
              }}
            >
              <div ref={nav_container_ref} className="relative">
                <div
                  className="pointer-events-none absolute left-0 w-full rounded-[10px]"
                  style={{
                    top: indicator_style.top,
                    height: indicator_style.height,
                    opacity: is_searching ? 0 : indicator_style.opacity,
                    backgroundColor: "var(--indicator-bg)",
                    border: "1px solid var(--border-primary)",
                    zIndex: 0,
                    transition: should_animate_indicator
                      ? "top 200ms ease, height 200ms ease, opacity 200ms ease"
                      : "none",
                  }}
                />
                {is_searching ? (
                  <div className="space-y-0.5">
                    {search_results.map(render_nav_item)}
                  </div>
                ) : (
                  <>
                    <div className="text-[10px] font-semibold uppercase tracking-wider px-2.5 mb-2 text-txt-muted">
                      {t("settings.general")}
                    </div>
                    <div className="space-y-0.5 mb-4">
                      {nav_items.general.map(render_nav_item)}
                    </div>
                    <div className="text-[10px] font-semibold uppercase tracking-wider px-2.5 mb-2 text-txt-muted">
                      {t("common.mail")}
                    </div>
                    <div className="space-y-0.5">
                      {nav_items.mail.map(render_nav_item)}
                    </div>
                  </>
                )}
              </div>
            </nav>

            <div className="flex-1 overflow-y-auto flex flex-col min-h-0 bg-surf-primary">
              <div className="flex items-center gap-3 px-4 md:px-6 py-4 flex-shrink-0 border-b border-b-edge-secondary">
                {!show_mobile_nav && (
                  <Button
                    className="md:hidden -ml-1.5"
                    size="icon"
                    variant="ghost"
                    onClick={() => set_show_mobile_nav(true)}
                  >
                    <ArrowUturnLeftIcon className="w-5 h-5" />
                  </Button>
                )}
                <h2 className="text-[17px] font-semibold text-txt-primary flex-shrink-0">
                  <span className="hidden md:inline">{t("settings.title")}</span>
                  <span className="md:hidden">
                    {show_mobile_nav ? t("settings.title") : get_current_section_label()}
                  </span>
                </h2>
                <SettingsSaveIndicator />
                <div className="hidden md:flex relative flex-1 max-w-[320px]">
                  <MagnifyingGlassIcon
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
                    style={{ color: "var(--text-muted)" }}
                  />
                  <input
                    autoComplete="off"
                    className="w-full h-9 pl-9 pr-3 rounded-lg text-[14px] outline-none"
                    placeholder={t("settings.search_placeholder")}
                    spellCheck={false}
                    style={{
                      backgroundColor: "var(--input-bg, var(--bg-secondary))",
                      border: "1px solid var(--border-primary)",
                      color: "var(--text-primary)",
                    }}
                    type="search"
                    value={search_query}
                    onChange={(e) => set_search_query(e.target.value)}
                  />
                  {is_searching && search_query.trim().length >= 2 && (
                    <div
                      className="absolute top-[calc(100%+6px)] left-0 w-[380px] max-h-80 overflow-y-auto rounded-xl z-50 py-1"
                      style={{
                        backgroundColor: "var(--bg-primary)",
                        border: "1px solid var(--border-secondary)",
                        boxShadow: "0 8px 32px rgba(0,0,0,0.25)",
                      }}
                    >
                      {registry_results.length === 0 ? (
                        <div className="px-4 py-3 text-[13px]" style={{ color: "var(--text-secondary)" }}>
                          {t("common.no_results")}
                        </div>
                      ) : (
                        registry_results.map((entry, idx) => {
                          const nav_item = [...nav_items.general, ...nav_items.mail].find((n) => n.id === entry.section);
                          return (
                            <button
                              key={`${entry.section}-${idx}`}
                              className="w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors duration-100 cursor-pointer"
                              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "var(--bg-secondary)"; }}
                              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = ""; }}
                              onClick={() => { handle_desktop_nav_click(entry.section); set_scroll_target(entry.label); }}
                            >
                              {nav_item && <nav_item.icon className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "var(--text-muted)" }} />}
                              <div className="flex-1 min-w-0">
                                <span className="text-[13px] font-medium" style={{ color: "var(--text-primary)" }}>{entry.label}</span>
                              </div>
                              <span className="text-[11px] flex-shrink-0 ml-2" style={{ color: "var(--text-muted)" }}>{entry.breadcrumb}</span>
                            </button>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
                <Button className="ml-auto" size="icon" variant="ghost" onClick={on_close}>
                  <XMarkIcon className="w-5 h-5" />
                </Button>
              </div>

              {show_mobile_nav && (
                <div className="md:hidden flex-1 overflow-y-auto">
                  <div className="px-4 pt-3 pb-1">
                    <div className="relative">
                      <MagnifyingGlassIcon
                        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
                        style={{ color: "var(--text-muted)" }}
                      />
                      <input
                        autoComplete="off"
                        className="w-full h-9 pl-9 pr-3 rounded-[10px] text-[14px] outline-none"
                        placeholder={t("settings.search_placeholder")}
                        spellCheck={false}
                        style={{
                          backgroundColor: "var(--input-bg, var(--bg-secondary))",
                          border: "1px solid var(--border-primary)",
                          color: "var(--text-primary)",
                        }}
                        type="search"
                        value={search_query}
                        onChange={(e) => set_search_query(e.target.value)}
                      />
                    </div>
                  </div>
                  {is_searching ? (
                    search_results.map(render_mobile_nav_item)
                  ) : (
                    <>
                      <div className="text-[11px] font-semibold uppercase tracking-wider px-4 py-3 text-txt-muted">
                        {t("settings.general")}
                      </div>
                      {nav_items.general.map(render_mobile_nav_item)}
                      <div className="text-[11px] font-semibold uppercase tracking-wider px-4 py-3 mt-2 text-txt-muted">
                        {t("common.mail")}
                      </div>
                      {nav_items.mail.map(render_mobile_nav_item)}
                    </>
                  )}
                </div>
              )}

              <div
                ref={content_container_ref}
                className={`p-4 md:p-6 flex-1 overflow-y-auto overflow-x-hidden relative ${show_mobile_nav ? "hidden md:flex" : "flex"} flex-col`}
                style={{ scrollbarGutter: "stable" }}
              >
                {is_suspended && (
                  <div
                    className="absolute inset-0 z-10 flex items-start justify-center pt-8"
                    style={{
                      backgroundColor:
                        "color-mix(in srgb, var(--bg-primary) 60%, transparent)",
                      pointerEvents: "auto",
                    }}
                  >
                    <div
                      className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm"
                      style={{
                        backgroundColor: "var(--bg-tertiary)",
                        border: "1px solid var(--border-secondary)",
                        color: "var(--text-secondary)",
                      }}
                    >
                      <svg
                        className="w-4 h-4 flex-shrink-0"
                        fill="currentColor"
                        style={{ color: "var(--color-error, #ef4444)" }}
                        viewBox="0 0 20 20"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <path
                          clipRule="evenodd"
                          d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM8.28 7.22a.75.75 0 0 0-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 1 0 1.06 1.06L10 11.06l1.72 1.72a.75.75 0 1 0 1.06-1.06L11.06 10l1.72-1.72a.75.75 0 0 0-1.06-1.06L10 8.94 8.28 7.22Z"
                          fillRule="evenodd"
                        />
                      </svg>
                      <span>{t("common.settings_disabled_suspended")}</span>
                    </div>
                  </div>
                )}
                <div
                  key={section}
                  style={is_suspended ? { opacity: 0.4, pointerEvents: "none" } : undefined}
                >
                  {active_section_element}
                  {is_family_plan && (
                    <div className={section !== "family" ? "hidden" : undefined}>
                      <Suspense fallback={null}>
                        <FamilySection is_family_plan={is_family_plan} />
                      </Suspense>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
