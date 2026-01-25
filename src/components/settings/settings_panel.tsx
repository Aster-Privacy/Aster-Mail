import {
  useState,
  useEffect,
  useRef,
  useLayoutEffect,
  Suspense,
  lazy,
  useCallback,
  useMemo,
} from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  XMarkIcon,
  BuildingOffice2Icon,
  SwatchIcon,
  ShieldCheckIcon,
  ArrowDownTrayIcon,
  BellIcon,
  PencilSquareIcon,
  AdjustmentsHorizontalIcon,
  AtSymbolIcon,
  CreditCardIcon,
  GlobeAltIcon,
  KeyIcon,
  CodeBracketIcon,
  DocumentTextIcon,
  ArrowUturnLeftIcon,
} from "@heroicons/react/24/outline";

import { SnoozeIcon } from "@/components/icons";
import { get_dev_mode } from "@/services/api/preferences";
import { get_vault_from_memory } from "@/services/crypto/memory_key_store";
import { AccountSection } from "@/components/settings/account_section";
import { SettingsSaveIndicator } from "@/components/settings/settings_save_indicator";
type LazyImportFn = () => Promise<unknown>;
const lazy_section_imports: LazyImportFn[] = [];

function create_lazy_section<T extends object>(
  import_fn: () => Promise<T>,
  get_component: (m: T) => React.ComponentType,
) {
  lazy_section_imports.push(import_fn as LazyImportFn);

  return lazy(() => import_fn().then((m) => ({ default: get_component(m) })));
}

const AppearanceSection = create_lazy_section(
  () => import("@/components/settings/appearance_section"),
  (m) => m.AppearanceSection,
);
const SecuritySection = create_lazy_section(
  () => import("@/components/settings/security_section"),
  (m) => m.SecuritySection,
);
const ImportSection = create_lazy_section(
  () => import("@/components/settings/import_section"),
  (m) => m.ImportSection,
);
const NotificationsSection = create_lazy_section(
  () => import("@/components/settings/notifications_section"),
  (m) => m.NotificationsSection,
);
const SignatureSection = create_lazy_section(
  () => import("@/components/settings/signature_section"),
  (m) => m.SignatureSection,
);
const SubscriptionsSection = create_lazy_section(
  () => import("@/components/settings/subscriptions_section"),
  (m) => m.SubscriptionsSection,
);
const BehaviorSection = create_lazy_section(
  () => import("@/components/settings/behavior_section"),
  (m) => m.BehaviorSection,
);
const AliasesSection = create_lazy_section(
  () => import("@/components/settings/aliases_section"),
  (m) => m.AliasesSection,
);
const BillingSection = create_lazy_section(
  () => import("@/components/settings/billing_section"),
  (m) => m.BillingSection,
);
const DomainsSection = create_lazy_section(
  () => import("@/components/settings/domains_section"),
  (m) => m.DomainsSection,
);
const EncryptionSection = create_lazy_section(
  () => import("@/components/settings/encryption_section"),
  (m) => m.EncryptionSection,
);
const DeveloperSection = create_lazy_section(
  () => import("@/components/settings/developer_section"),
  (m) => m.DeveloperSection,
);
const TemplatesSection = create_lazy_section(
  () => import("@/components/settings/templates_section"),
  (m) => m.TemplatesSection,
);
const UndoSendSection = create_lazy_section(
  () => import("@/components/settings/undo_send_section"),
  (m) => m.UndoSendSection,
);

let preloaded = false;

function preload_all_sections() {
  if (preloaded) return;
  preloaded = true;
  lazy_section_imports.forEach((load) => load());
}

export type SettingsSection =
  | "account"
  | "appearance"
  | "security"
  | "encryption"
  | "aliases"
  | "domains"
  | "billing"
  | "import"
  | "notifications"
  | "signature"
  | "templates"
  | "subscriptions"
  | "behavior"
  | "undo_send"
  | "developer";

type Section = SettingsSection;

interface SettingsPanelProps {
  is_open: boolean;
  on_close: () => void;
  initial_section?: Section;
}

const SnoozeNavIcon = () => (
  <SnoozeIcon size={20} style={{ transform: "translateZ(0)" }} />
);

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

const NAV_ITEMS: { general: NavItem[]; mail: NavItem[] } = {
  general: [
    { id: "account", label: "Account", icon: BuildingOffice2Icon },
    { id: "appearance", label: "Appearance", icon: SwatchIcon },
    { id: "security", label: "Security", icon: ShieldCheckIcon },
    { id: "encryption", label: "Encryption", icon: KeyIcon },
    { id: "aliases", label: "Aliases", icon: AtSymbolIcon },
    { id: "domains", label: "Domains", icon: GlobeAltIcon },
    { id: "billing", label: "Billing", icon: CreditCardIcon },
  ],
  mail: [
    { id: "subscriptions", label: "Snooze", icon: SnoozeNavIcon },
    { id: "import", label: "Import", icon: ArrowDownTrayIcon },
    { id: "notifications", label: "Notifications", icon: BellIcon },
    { id: "signature", label: "Signature", icon: PencilSquareIcon },
    { id: "templates", label: "Templates", icon: DocumentTextIcon },
    { id: "undo_send", label: "Undo Send", icon: ArrowUturnLeftIcon },
    { id: "behavior", label: "Behavior", icon: AdjustmentsHorizontalIcon },
  ],
};

export function SettingsPanel({
  is_open,
  on_close,
  initial_section,
}: SettingsPanelProps) {
  const navigate = useNavigate();
  const [section, set_section] = useState<Section>(
    initial_section || get_persisted_section() || "account",
  );
  const [show_mobile_nav, set_show_mobile_nav] = useState(true);
  const was_open_ref = useRef(false);
  const animation_complete_ref = useRef(false);
  const [dev_mode_enabled, set_dev_mode_enabled] = useState(false);
  const [indicator_style, set_indicator_style] = useState<{
    top: number;
    height: number;
    opacity: number;
  }>({ top: 0, height: 32, opacity: 0 });
  const [should_animate_indicator, set_should_animate_indicator] =
    useState(false);
  const nav_container_ref = useRef<HTMLDivElement>(null);
  const nav_item_refs = useRef<Record<Section, HTMLButtonElement | null>>({
    account: null,
    appearance: null,
    security: null,
    encryption: null,
    aliases: null,
    domains: null,
    billing: null,
    import: null,
    notifications: null,
    signature: null,
    templates: null,
    subscriptions: null,
    behavior: null,
    undo_send: null,
    developer: null,
  });

  const handle_account_deleted = useCallback(() => {
    on_close();
    navigate("/sign-in");
  }, [on_close, navigate]);

  useEffect(() => {
    if (is_open && !was_open_ref.current) {
      set_section(initial_section || get_persisted_section() || "account");
      set_show_mobile_nav(true);
      animation_complete_ref.current = false;
      preload_all_sections();
    } else if (!is_open) {
      animation_complete_ref.current = false;
    }
    was_open_ref.current = is_open;
  }, [is_open, initial_section]);

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
    const handle_dev_mode_change = (e: CustomEvent<boolean>) => {
      set_dev_mode_enabled(e.detail);
    };

    window.addEventListener(
      "dev-mode-changed",
      handle_dev_mode_change as EventListener,
    );

    return () => {
      window.removeEventListener(
        "dev-mode-changed",
        handle_dev_mode_change as EventListener,
      );
    };
  }, []);

  useEffect(() => {
    if (!is_open) return;
    const handle_key = (e: KeyboardEvent) => e.key === "Escape" && on_close();

    document.addEventListener("keydown", handle_key);

    return () => document.removeEventListener("keydown", handle_key);
  }, [is_open, on_close]);

  const nav_items = useMemo(() => {
    const items = {
      general: [...NAV_ITEMS.general],
      mail: [...NAV_ITEMS.mail],
    };

    if (dev_mode_enabled) {
      items.mail.push({
        id: "developer" as Section,
        label: "Developer",
        icon: CodeBracketIcon,
      });
    }

    return items;
  }, [dev_mode_enabled]);

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

  const render_content = () => {
    switch (section) {
      case "account":
        return <AccountSection on_account_deleted={handle_account_deleted} />;
      case "appearance":
        return <AppearanceSection />;
      case "security":
        return <SecuritySection />;
      case "encryption":
        return <EncryptionSection />;
      case "aliases":
        return <AliasesSection />;
      case "domains":
        return <DomainsSection />;
      case "billing":
        return <BillingSection />;
      case "subscriptions":
        return <SubscriptionsSection />;
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
      case "undo_send":
        return <UndoSendSection />;
      case "developer":
        return <DeveloperSection />;
    }
  };

  const handle_desktop_nav_click = useCallback((item_id: Section) => {
    set_section(item_id);
    set_persisted_section(item_id);
  }, []);

  const handle_mobile_nav_click = useCallback((item_id: Section) => {
    set_section(item_id);
    set_persisted_section(item_id);
    set_show_mobile_nav(false);
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
        className="w-full flex items-center gap-3 px-4 py-3 text-[15px] transition-colors duration-150"
        style={{
          color: "var(--text-primary)",
          borderBottom: "1px solid var(--border-primary)",
        }}
        onClick={() => handle_mobile_nav_click(item.id)}
      >
        <item.icon
          className="w-5 h-5 flex-shrink-0"
          style={{ color: "var(--text-secondary)" }}
        />
        <span>{item.label}</span>
      </button>
    );
  };

  const get_current_section_label = () => {
    const all_items = [...NAV_ITEMS.general, ...NAV_ITEMS.mail];
    const item = all_items.find((i) => i.id === section);

    return item?.label || "Settings";
  };

  return (
    <AnimatePresence>
      {is_open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-0 md:p-4">
          <motion.div
            animate={{ opacity: 1 }}
            className="absolute inset-0"
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
            style={{ backgroundColor: "var(--modal-overlay)" }}
            transition={{ duration: 0.15 }}
            onClick={on_close}
          />
          <motion.div
            animate={{ scale: 1, opacity: 1, y: 0 }}
            className="relative flex flex-col md:flex-row w-full h-full md:w-[960px] md:h-[640px] md:rounded-2xl overflow-hidden"
            exit={{ scale: 0.95, opacity: 0, y: 8 }}
            initial={{ scale: 0.95, opacity: 0, y: 8 }}
            style={{
              backgroundColor: "var(--bg-primary)",
              border: "1px solid var(--border-secondary)",
              boxShadow:
                "0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 0 1px var(--border-secondary)",
            }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
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
                <div
                  className="text-[10px] font-semibold uppercase tracking-wider px-2.5 mb-2"
                  style={{ color: "var(--text-muted)" }}
                >
                  General
                </div>
                <div className="space-y-0.5 mb-4">
                  {nav_items.general.map(render_nav_item)}
                </div>

                <div
                  className="text-[10px] font-semibold uppercase tracking-wider px-2.5 mb-2"
                  style={{ color: "var(--text-muted)" }}
                >
                  Mail
                </div>
                <div className="space-y-0.5">
                  {nav_items.mail.map(render_nav_item)}
                </div>
              </div>
            </nav>

            <div
              className="flex-1 overflow-y-auto flex flex-col min-h-0"
              style={{ backgroundColor: "var(--bg-primary)" }}
            >
              <div
                className="flex items-center justify-between px-4 md:px-6 py-4 flex-shrink-0"
                style={{ borderBottom: "1px solid var(--border-secondary)" }}
              >
                <div className="flex items-center gap-3">
                  {!show_mobile_nav && (
                    <button
                      className="md:hidden p-1.5 -ml-1.5 rounded-lg transition-colors duration-150"
                      style={{ color: "var(--text-muted)" }}
                      onClick={() => set_show_mobile_nav(true)}
                    >
                      <ArrowUturnLeftIcon className="w-5 h-5" />
                    </button>
                  )}
                  <h2
                    className="text-[17px] font-semibold"
                    style={{ color: "var(--text-primary)" }}
                  >
                    <span className="hidden md:inline">Settings</span>
                    <span className="md:hidden">
                      {show_mobile_nav
                        ? "Settings"
                        : get_current_section_label()}
                    </span>
                  </h2>
                  <SettingsSaveIndicator />
                </div>
                <button
                  className="p-1.5 rounded-lg transition-colors duration-150"
                  style={{ color: "var(--text-muted)" }}
                  onClick={on_close}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.backgroundColor = "var(--bg-hover)")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.backgroundColor = "transparent")
                  }
                >
                  <XMarkIcon className="w-5 h-5" />
                </button>
              </div>

              {/* Mobile Navigation - only renders on mobile */}
              {show_mobile_nav && (
                <div className="md:hidden flex-1 overflow-y-auto">
                  <div
                    className="text-[11px] font-semibold uppercase tracking-wider px-4 py-3"
                    style={{ color: "var(--text-muted)" }}
                  >
                    General
                  </div>
                  {nav_items.general.map(render_mobile_nav_item)}
                  <div
                    className="text-[11px] font-semibold uppercase tracking-wider px-4 py-3 mt-2"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Mail
                  </div>
                  {nav_items.mail.map(render_mobile_nav_item)}
                </div>
              )}

              {/* Content Area - always visible on desktop, conditional on mobile */}
              <div
                className={`p-4 md:p-6 flex-1 overflow-y-auto relative ${show_mobile_nav ? "hidden md:flex" : "flex"} flex-col`}
                style={{ scrollbarGutter: "stable" }}
              >
                <AnimatePresence initial={false} mode="popLayout">
                  <motion.div
                    key={section}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    initial={{ opacity: 0 }}
                    transition={{ duration: 0.12, ease: "easeOut" }}
                  >
                    <Suspense fallback={<div />}>{render_content()}</Suspense>
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
