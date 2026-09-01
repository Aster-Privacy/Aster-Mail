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
import type {
  NavItem,
  NavItems,
  Section,
  SettingsContentProps,
} from "./settings_content_helpers";

import {
  useState,
  useEffect,
  useRef,
  useLayoutEffect,
  useCallback,
  useMemo,
} from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowDownTrayIcon,
  CodeBracketIcon,
} from "@heroicons/react/24/outline";

import { load_family_section } from "./settings_lazy_sections";
import {
  get_nav_items,
  get_persisted_section,
  set_persisted_section,
} from "./settings_content_helpers";

import { safe_local_set } from "@/lib/safe_storage";
import { start_scroll_seek } from "@/components/settings/settings_scroll_target";
import { SETTINGS_SEARCH_REGISTRY } from "@/components/settings/search_registry";
import { use_search_registry } from "@/components/settings/search_context";
import { use_i18n } from "@/lib/i18n/context";
import { use_preferences } from "@/contexts/preferences_context";
import { use_mail_stats } from "@/hooks/use_mail_stats";
import { use_auth } from "@/contexts/auth_context";
import {
  read_dev_mode_cache,
  write_dev_mode_cache,
} from "@/lib/dev_mode_cache";
import { get_dev_mode } from "@/services/api/preferences";
import {
  get_available_plans,
  get_billing_history,
  get_plan_limits,
  get_storage_addons,
  get_credits,
} from "@/services/api/billing";
import { get_vault_from_memory } from "@/services/crypto/memory_key_store";
import { is_desktop_runtime } from "@/services/updates/updater";
import { use_settings_prefetch } from "@/components/settings/hooks/use_settings_prefetch";
import { list_devices } from "@/services/api/devices";
import {
  prefetch_family_group,
  refresh_family_plan_flag,
} from "@/services/api/family";
import { ignore_error } from "@/lib/ignore_error";
import { is_onion_host } from "@/lib/onion_host";

export type { SettingsSection } from "./settings_content_helpers";

export function use_settings_content(props: SettingsContentProps) {
  const {
    section: section_prop,
    on_section_change,
    on_close,
    variant = "page",
  } = props;

  const is_popup = variant === "popup";

  use_settings_prefetch(true);
  const { t } = use_i18n();
  const navigate = useNavigate();
  const { preferences } = use_preferences();
  const { current_account_id } = use_auth();
  const { stats: mail_stats, has_initialized: mail_stats_ready } =
    use_mail_stats();
  const storage_percentage = useMemo(() => {
    const total = mail_stats.storage_total_bytes;

    if (!total || total <= 0) return 0;
    const used = mail_stats.storage_used_bytes || 0;

    return Math.min(100, Math.max(0, (used / total) * 100));
  }, [mail_stats.storage_used_bytes, mail_stats.storage_total_bytes]);
  const sidebar_width = Math.min(
    360,
    Math.max(200, preferences.sidebar_width ?? 256),
  );
  const [section, set_section] = useState<Section>(
    section_prop || get_persisted_section() || "appearance",
  );
  const [show_mobile_nav, set_show_mobile_nav] = useState(!section_prop);
  const [is_suspended, set_is_suspended] = useState(
    () => sessionStorage.getItem("aster_suspended") === "true",
  );
  const [dev_mode_enabled, set_dev_mode_enabled] = useState(
    () => read_dev_mode_cache(current_account_id) ?? false,
  );
  const [has_devices, set_has_devices] = useState(
    () => localStorage.getItem("aster_has_devices") === "1",
  );
  const [is_family_plan, set_is_family_plan] = useState(
    () => localStorage.getItem("aster_is_family_plan") === "1",
  );
  const [is_family_plan_resolved, set_is_family_plan_resolved] =
    useState(false);
  const [search_query, set_search_query] = useState("");
  const [scroll_target, set_scroll_target] = useState<string | null>(null);
  const [show_inline_totp_setup, set_show_inline_totp_setup] = useState(false);
  const section_ref = useRef(section);

  const on_section_change_ref = useRef(on_section_change);
  const account_id_ref = useRef(current_account_id);

  useEffect(() => {
    on_section_change_ref.current = on_section_change;
  }, [on_section_change]);

  useEffect(() => {
    section_ref.current = section;
  }, [section]);

  useEffect(() => {
    account_id_ref.current = current_account_id;
  }, [current_account_id]);

  useEffect(() => {
    if (section_prop && section_prop !== section) {
      set_section(section_prop);
      set_persisted_section(section_prop);
      set_show_mobile_nav(false);
    }
  }, [section_prop]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (is_popup || section_prop) return;
    on_section_change_ref.current(section, true);
  }, [section_prop, is_popup]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (is_family_plan) {
      load_family_section();
      prefetch_family_group();
    }
  }, [is_family_plan]);

  useEffect(() => {
    const is_unavailable =
      (section === "family" && is_family_plan_resolved && !is_family_plan) ||
      ((section === "billing" || section === "import") && is_onion_host());

    if (!is_unavailable) return;

    set_section("appearance");
    set_persisted_section("appearance");
    on_section_change_ref.current("appearance", true);
  }, [section, is_family_plan, is_family_plan_resolved]);

  const NAV_ITEMS_BASE = useMemo(
    () => get_nav_items(t, is_family_plan),
    [t, is_family_plan],
  );
  const [indicator_style, set_indicator_style] = useState<{
    top: number;
    height: number;
    opacity: number;
  }>({ top: 0, height: 32, opacity: 0 });
  const [should_animate_indicator, set_should_animate_indicator] =
    useState(false);
  const animation_complete_ref = useRef(false);
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
    billing: null,
    storage: null,
    family: null,
    referral: null,
    import: null,
    notifications: null,
    compose: null,
    signature: null,
    templates: null,
    behavior: null,
    categories: null,
    sender_filters: null,
    mail_rules: null,
    feedback: null,
    developer: null,
    updates: null,
    bridge: null,
    smtp_tokens: null,
  });

  const handle_account_deleted = useCallback(() => {
    navigate("/sign-in");
  }, [navigate]);

  useEffect(() => {
    let cancelled = false;

    refresh_family_plan_flag((resolved_is_family_plan) => {
      if (cancelled) return;
      set_is_family_plan(resolved_is_family_plan);
      set_is_family_plan_resolved(true);
    });
    list_devices()
      .then((res) => {
        if (cancelled || res.error || !res.data) return;

        const has_any = (res.data.devices?.length ?? 0) > 0;

        safe_local_set("aster_has_devices", has_any ? "1" : "0");
        set_has_devices(has_any);
      })
      .catch((caught) =>
        ignore_error(
          "components/settings/use_settings_content:list_devices",
          caught,
        ),
      );

    const warm_billing = () => {
      void import("@/components/settings/billing_section").catch((caught) =>
        ignore_error(
          "components/settings/use_settings_content:use_settings_content",
          caught,
        ),
      );
      get_available_plans();
      get_billing_history(1, 10);
      get_plan_limits();
      get_storage_addons();
      get_credits();
    };

    if (typeof requestIdleCallback === "function") {
      const idle_id = requestIdleCallback(warm_billing, { timeout: 2000 });

      return () => {
        cancelled = true;
        cancelIdleCallback(idle_id);
      };
    }

    const timeout_id = setTimeout(warm_billing, 400);

    return () => {
      cancelled = true;
      clearTimeout(timeout_id);
    };
  }, []);

  useEffect(() => {
    const handle_navigate_section = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail;

      if (detail) {
        set_section(detail as Section);
        set_persisted_section(detail as Section);
        set_show_mobile_nav(false);
        on_section_change_ref.current(detail as Section);
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
  }, []);

  useEffect(() => {
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
  }, []);

  useEffect(() => {
    const cached = read_dev_mode_cache(current_account_id);

    if (cached !== null) set_dev_mode_enabled(cached);

    let cancelled = false;

    const load_dev_mode = async () => {
      const vault = get_vault_from_memory();
      const result = await get_dev_mode(vault);

      if (cancelled || result.data === null) return;

      set_dev_mode_enabled(result.data);
      write_dev_mode_cache(current_account_id, result.data);
    };

    load_dev_mode();

    return () => {
      cancelled = true;
    };
  }, [current_account_id]);

  useEffect(() => {
    const handle_dev_mode_change = (e: Event) => {
      const enabled = (e as CustomEvent<boolean>).detail;

      set_dev_mode_enabled(enabled);
      write_dev_mode_cache(account_id_ref.current, enabled);
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
      set_show_mobile_nav(false);
      on_section_change_ref.current(value);

      if (anchor) {
        requestAnimationFrame(() =>
          document
            .getElementById(anchor)
            ?.scrollIntoView({ behavior: "smooth", block: "start" }),
        );
      }
    };

    const handle_plan_changed = () => {
      refresh_family_plan_flag(set_is_family_plan);
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
    const handle_key = (e: KeyboardEvent) => {
      if (e["key"] !== "Escape") return;
      if (!is_popup) return;
      const modal_open = document.querySelector(
        '[role="dialog"]:not([data-state="closed"]), [role="alertdialog"]:not([data-state="closed"]), [aria-modal="true"]:not([data-state="closed"])',
      );

      if (modal_open) return;
      on_close();
    };

    document.addEventListener("keydown", handle_key);

    return () => document.removeEventListener("keydown", handle_key);
  }, [on_close]);

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
      mail.push({
        id: "updates" as Section,
        label: t("settings.updates"),
        icon: ArrowDownTrayIcon,
        description: "Check for app updates and manage auto-update settings",
        keywords: [
          "update",
          "check for updates",
          "auto update",
          "automatic updates",
          "app version",
          "version history",
          "release notes",
          "update available",
        ],
      });
    }
    if (dev_mode_enabled) {
      mail.push({
        id: "developer" as Section,
        label: t("settings.developer"),
        icon: CodeBracketIcon,
        description:
          "API tokens, developer mode, request logs, and diagnostics",
        keywords: [
          "developer",
          "dev mode",
          "api token",
          "access token",
          "debug",
          "request logs",
          "diagnostics",
          "developer tools",
        ],
      });
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
    const section_labels = new Map(
      [...nav_items.general, ...nav_items.mail].map((i) => [i.id, i.label]),
    );
    const all = [...SETTINGS_SEARCH_REGISTRY, ...dynamic_entries].map(
      (entry) => {
        const section_label = section_labels.get(entry.section);
        const separator = entry.breadcrumb.indexOf(" > ");

        return {
          ...entry,
          english_label: entry.label,
          english_breadcrumb: entry.breadcrumb,
          label: entry.label_key ? t(entry.label_key) : entry.label,
          breadcrumb: !section_label
            ? entry.breadcrumb
            : separator === -1
              ? section_label
              : `${section_label} > ${entry.crumb_key ? t(entry.crumb_key) : entry.breadcrumb.slice(separator + 3)}`,
        };
      },
    );
    const seen = new Set<string>();

    return all
      .filter((entry) => {
        if (!visible_sections.has(entry.section)) return false;
        const matches =
          entry.label.toLowerCase().includes(q) ||
          entry.english_label.toLowerCase().includes(q) ||
          entry.breadcrumb.toLowerCase().includes(q) ||
          entry.english_breadcrumb.toLowerCase().includes(q) ||
          entry.keywords?.some((kw) => kw.includes(q));

        if (!matches) return false;
        const key = `${entry.section}::${entry.label}`;

        if (seen.has(key)) return false;
        seen.add(key);

        return true;
      })
      .slice(0, 12);
  }, [search_query, nav_items, dynamic_entries, t]);

  useEffect(() => {
    if (!scroll_target) return;
    const container = content_container_ref.current;

    if (!container) return;

    return start_scroll_seek(container, scroll_target, (target) => {
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      set_scroll_target(null);
    });
  }, [scroll_target, section]);

  useLayoutEffect(() => {
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
  }, [section, nav_items]);

  useEffect(() => {
    if (!nav_container_ref.current) return;

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
  }, [section]);

  return {
    is_popup,
    t,
    mail_stats,
    mail_stats_ready,
    storage_percentage,
    sidebar_width,
    section,
    set_section,
    show_mobile_nav,
    set_show_mobile_nav,
    is_suspended,
    is_family_plan,
    search_query,
    set_search_query,
    set_scroll_target,
    show_inline_totp_setup,
    set_show_inline_totp_setup,
    section_ref,
    indicator_style,
    should_animate_indicator,
    nav_container_ref,
    content_container_ref,
    nav_item_refs,
    handle_account_deleted,
    nav_items,
    is_searching,
    search_results,
    registry_results,
  };
}
