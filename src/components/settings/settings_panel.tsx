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
  FunnelIcon,
  BoltIcon,
  ChatBubbleBottomCenterTextIcon,
  ComputerDesktopIcon,
  UserGroupIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";

import { use_should_reduce_motion } from "@/provider";
import { use_i18n } from "@/lib/i18n/context";
import { get_dev_mode } from "@/services/api/preferences";
import {
  get_subscription,
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

import { EncryptionSection } from "@/components/settings/encryption_section";
import { DeveloperSection } from "@/components/settings/developer_section";
import { TemplatesSection } from "@/components/settings/templates_section";
import { MailManagementSection } from "@/components/settings/mail_management_section";
import { MailRulesSection } from "@/components/settings/mail_rules_section";
import { FeedbackSection } from "@/components/settings/feedback_section";
import { GhostAliasesSection } from "@/components/settings/ghost_aliases_section";
import { ReferralTab } from "@/components/settings/referral_tab";
import { TrustedDevicesPanel } from "@/components/settings/trusted_devices_panel";
import { SettingsSaveIndicator } from "@/components/settings/settings_save_indicator";
import { use_settings_prefetch } from "@/components/settings/hooks/use_settings_prefetch";
import { SettingsCacheProvider } from "@/contexts/settings_cache_context";
import { list_devices } from "@/services/api/devices";

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
  | "referral"
  | "import"
  | "notifications"
  | "signature"
  | "templates"
  | "behavior"
  | "sender_filters"
  | "mail_rules"
  | "feedback"
  | "developer";

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
}

function get_nav_items(t: (key: TranslationKey) => string): {
  general: NavItem[];
  mail: NavItem[];
} {
  return {
    general: [
      { id: "appearance", label: t("settings.appearance"), icon: SwatchIcon },
      {
        id: "account",
        label: t("settings.account"),
        icon: BuildingOffice2Icon,
      },
      {
        id: "accessibility",
        label: t("settings.accessibility"),
        icon: EyeIcon,
      },
      { id: "security", label: t("settings.security"), icon: ShieldCheckIcon },
      { id: "encryption", label: t("settings.encryption"), icon: KeyIcon },
      {
        id: "trusted_devices",
        label: t("settings.trusted_devices"),
        icon: ComputerDesktopIcon,
      },
      {
        id: "aliases",
        label: t("settings.aliases_and_domains"),
        icon: AtSymbolIcon,
      },
      {
        id: "ghost_aliases",
        label: t("settings.ghost_aliases"),
        icon: EyeSlashIcon,
      },
      { id: "billing", label: t("settings.billing"), icon: CreditCardIcon },
      {
        id: "referral",
        label: t("settings.refer_a_friend"),
        icon: UserGroupIcon,
      },
    ],
    mail: [
      { id: "import", label: t("common.import"), icon: ArrowDownTrayIcon },
      {
        id: "notifications",
        label: t("settings.notifications"),
        icon: BellIcon,
      },
      {
        id: "signature",
        label: t("settings.signature"),
        icon: PencilSquareIcon,
      },
      {
        id: "templates",
        label: t("settings.templates"),
        icon: DocumentTextIcon,
      },
      {
        id: "behavior",
        label: t("settings.behavior"),
        icon: AdjustmentsHorizontalIcon,
      },
      {
        id: "sender_filters",
        label: t("settings.mail_management"),
        icon: FunnelIcon,
      },
      {
        id: "mail_rules",
        label: t("mail_rules.title"),
        icon: BoltIcon,
      },
      {
        id: "feedback",
        label: t("settings.feedback"),
        icon: ChatBubbleBottomCenterTextIcon,
      },
    ],
  };
}

export function SettingsPanel(props: SettingsPanelProps) {
  return (
    <SettingsCacheProvider>
      <SettingsPanelInner {...props} />
    </SettingsCacheProvider>
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
  const NAV_ITEMS = useMemo(() => get_nav_items(t), [t]);
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
  });

  const handle_account_deleted = useCallback(() => {
    on_close();
    navigate("/sign-in");
  }, [on_close, navigate]);

  useEffect(() => {
    if (is_open && !was_open_ref.current) {
      set_section(initial_section || get_persisted_section() || "appearance");
      set_show_mobile_nav(true);
      animation_complete_ref.current = false;

      get_subscription();
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
      const value = (e as CustomEvent<string>).detail as Section;

      set_section(value);
      set_persisted_section(value);
    };

    window.addEventListener("dev-mode-changed", handle_dev_mode_change);
    window.addEventListener("navigate-settings", handle_navigate_section);

    return () => {
      window.removeEventListener("dev-mode-changed", handle_dev_mode_change);
      window.removeEventListener("navigate-settings", handle_navigate_section);
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

  const nav_items = useMemo(() => {
    const general = has_devices
      ? [...NAV_ITEMS.general]
      : NAV_ITEMS.general.filter((item) => item.id !== "trusted_devices");

    const items = {
      general,
      mail: [...NAV_ITEMS.mail],
    };

    if (dev_mode_enabled) {
      items.mail.push({
        id: "developer" as Section,
        label: t("settings.developer"),
        icon: CodeBracketIcon,
      });
    }

    return items;
  }, [NAV_ITEMS, dev_mode_enabled, has_devices, t]);

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
        return (
          <Suspense fallback={null}>
            <BillingSection />
          </Suspense>
        );
      case "referral":
        return <ReferralTab />;
      case "import":
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
      default:
        return null;
    }
  }, [section, handle_account_deleted]);

  const handle_desktop_nav_click = useCallback((item_id: Section) => {
    set_section(item_id);
    set_persisted_section(item_id);
  }, []);

  const render_nav_item = (item: NavItem) => {
    const is_selected = section === item.id;

    return (
      <button
        key={item.id}
        ref={(el) => {
          nav_item_refs.current[item.id] = el;
        }}
        className="w-full flex items-center gap-2.5 px-2.5 h-8 rounded-md text-[13px] transition-colors duration-150 relative z-[1]"
        style={{
          color: is_selected ? "var(--text-primary)" : "var(--text-secondary)",
        }}
        onClick={() => handle_desktop_nav_click(item.id)}
      >
        <item.icon
          className="w-5 h-5 flex-shrink-0"
          style={{ transform: "translateZ(0)" }}
        />
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
          set_show_mobile_nav(false);
        }}
      >
        <item.icon className="w-5 h-5 flex-shrink-0 text-txt-secondary" />
        <span>{item.label}</span>
      </button>
    );
  };

  const get_current_section_label = () => {
    const all_items = [...NAV_ITEMS.general, ...NAV_ITEMS.mail];
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
                  className="pointer-events-none absolute left-0 w-full rounded-md"
                  style={{
                    top: indicator_style.top,
                    height: indicator_style.height,
                    opacity: indicator_style.opacity,
                    backgroundColor: "var(--indicator-bg)",
                    border: "1px solid var(--border-primary)",
                    zIndex: 0,
                    transition: should_animate_indicator
                      ? "top 200ms ease, height 200ms ease, opacity 200ms ease"
                      : "none",
                  }}
                />
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
              </div>
            </nav>

            <div className="flex-1 overflow-y-auto flex flex-col min-h-0 bg-surf-primary">
              <div className="flex items-center justify-between px-4 md:px-6 py-4 flex-shrink-0 border-b border-b-edge-secondary">
                <div className="flex items-center gap-3">
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
                  <h2 className="text-[17px] font-semibold text-txt-primary">
                    <span className="hidden md:inline">
                      {t("settings.title")}
                    </span>
                    <span className="md:hidden">
                      {show_mobile_nav
                        ? t("settings.title")
                        : get_current_section_label()}
                    </span>
                  </h2>
                  <SettingsSaveIndicator />
                </div>
                <Button size="icon" variant="ghost" onClick={on_close}>
                  <XMarkIcon className="w-5 h-5" />
                </Button>
              </div>

              {show_mobile_nav && (
                <div className="md:hidden flex-1 overflow-y-auto">
                  <div className="text-[11px] font-semibold uppercase tracking-wider px-4 py-3 text-txt-muted">
                    {t("settings.general")}
                  </div>
                  {nav_items.general.map(render_mobile_nav_item)}
                  <div className="text-[11px] font-semibold uppercase tracking-wider px-4 py-3 mt-2 text-txt-muted">
                    {t("common.mail")}
                  </div>
                  {nav_items.mail.map(render_mobile_nav_item)}
                </div>
              )}

              <div
                ref={content_container_ref}
                className={`p-4 md:p-6 flex-1 overflow-y-auto relative ${show_mobile_nav ? "hidden md:flex" : "flex"} flex-col`}
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
                  style={
                    is_suspended
                      ? { opacity: 0.4, pointerEvents: "none" }
                      : undefined
                  }
                >
                  {active_section_element}
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
