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
  NavGroup,
  NavItem,
  Section,
  SettingsContentProps,
} from "./settings_content_helpers";

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  Suspense,
} from "react";
import { createPortal } from "react-dom";
import {
  XMarkIcon,
  ArrowLeftIcon,
  ArrowUturnLeftIcon,
  MagnifyingGlassIcon,
  ChevronRightIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";

import { StorageSection } from "./settings_lazy_sections";
import {
  flatten_nav_items,
  request_settings_tab,
  set_persisted_section,
} from "./settings_content_helpers";
import { use_settings_content } from "./use_settings_content";

import { SearchRegistryProvider } from "@/components/settings/search_context";
import {
  StorageMeter,
  scroll_to_storage_addons,
} from "@/components/layout/storage_meter";
import { AccountSection } from "@/components/settings/account_section";
import { AppearanceGroupSection } from "@/components/settings/appearance_group_section";
import { SecurityGroupSection } from "@/components/settings/security_group_section";
import { BillingGroupSection } from "@/components/settings/billing_group_section";
import { NotificationsSection } from "@/components/settings/notifications_section";
import { ReadingGroupSection } from "@/components/settings/reading_group_section";
import { ComposeGroupSection } from "@/components/settings/compose_group_section";
import { RulesGroupSection } from "@/components/settings/rules_group_section";
import { ImportGroupSection } from "@/components/settings/import_group_section";
import { HelpGroupSection } from "@/components/settings/help_group_section";
import { AliasesSection } from "@/components/settings/aliases_section";
import { DomainsSection } from "@/components/settings/domains_section";
import { ReferralTab } from "@/components/settings/referral_tab";
import { BridgeSection } from "@/components/settings/bridge_section";
import { SettingsSkeleton } from "@/components/settings/settings_skeleton";
import { SettingsSaveIndicator } from "@/components/settings/settings_save_indicator";
import { SettingsCacheProvider } from "@/contexts/settings_cache_context";
import { is_onion_host } from "@/lib/onion_host";
import { is_desktop_runtime } from "@/services/updates/updater";
import { is_composing } from "@/utils/ime";

export type { SettingsSection } from "./settings_content_helpers";

const BREADCRUMB_LINK_CLASS =
  "rounded-sm outline-none transition-colors hover:text-txt-primary hover:underline underline-offset-2 focus-visible:ring-2 focus-visible:ring-blue-500/50";

export function SettingsContent(props: SettingsContentProps) {
  return (
    <SearchRegistryProvider>
      <SettingsCacheProvider>
        <SettingsContentInner {...props} />
      </SettingsCacheProvider>
    </SearchRegistryProvider>
  );
}

function SettingsContentInner(props: SettingsContentProps) {
  const { on_section_change, on_close } = props;
  const {
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
    has_devices,
    dev_mode_enabled,
    nav_items,
    is_searching,
    search_results,
    registry_results,
  } = use_settings_content(props);

  const active_section_element = useMemo(() => {
    switch (section) {
      case "appearance":
        return <AppearanceGroupSection />;
      case "account":
        return <AccountSection />;
      case "security":
        return (
          <SecurityGroupSection
            has_devices={has_devices}
            on_account_deleted={handle_account_deleted}
            set_show_inline_totp_setup={set_show_inline_totp_setup}
            show_inline_totp_setup={show_inline_totp_setup}
          />
        );
      case "aliases":
        return <AliasesSection />;
      case "domains":
        return <DomainsSection />;
      case "storage":
        return (
          <Suspense fallback={<SettingsSkeleton />}>
            <StorageSection />
          </Suspense>
        );
      case "billing":
        return <BillingGroupSection is_family_plan={is_family_plan} />;
      case "referral":
        if (is_onion_host()) {
          return null;
        }

        return <ReferralTab />;
      case "notifications":
        return <NotificationsSection />;
      case "behavior":
        return <ReadingGroupSection />;
      case "compose":
        return <ComposeGroupSection />;
      case "mail_rules":
        return <RulesGroupSection />;
      case "import":
        if (is_onion_host()) {
          return null;
        }

        return <ImportGroupSection />;
      case "bridge":
        return <BridgeSection />;
      case "feedback":
        return (
          <HelpGroupSection
            show_developer={dev_mode_enabled}
            show_updates={is_desktop_runtime()}
          />
        );
      default:
        return null;
    }
  }, [
    section,
    handle_account_deleted,
    show_inline_totp_setup,
    is_family_plan,
    has_devices,
    dev_mode_enabled,
  ]);

  const handle_desktop_nav_click = useCallback(
    (item_id: Section) => {
      if (item_id === section_ref.current) {
        set_search_query("");

        return;
      }
      set_section(item_id);
      set_persisted_section(item_id);
      set_search_query("");
      on_section_change(item_id);
    },
    [on_section_change],
  );

  const render_nav_item = (item: NavItem) => {
    const is_selected = section === item.id;

    return (
      <button
        key={item.id}
        ref={(el) => {
          nav_item_refs.current[item.id] = el;
        }}
        className={`w-full flex items-center gap-2.5 px-2.5 h-[34px] rounded-[10px] text-[13px] transition-colors duration-150 relative z-[1] outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 ${is_selected ? "font-medium" : "hover:bg-black/[0.04] dark:hover:bg-white/[0.04]"}`}
        style={{
          color: is_selected ? "var(--text-primary)" : "var(--text-secondary)",
        }}
        onClick={() => handle_desktop_nav_click(item.id)}
      >
        <item.icon
          className="w-[17px] h-[17px] flex-shrink-0"
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
          set_search_query("");
          set_show_mobile_nav(false);
          on_section_change(item.id);
        }}
      >
        <item.icon className="w-5 h-5 flex-shrink-0 text-txt-secondary" />
        <span>{item.label}</span>
      </button>
    );
  };

  const render_nav_group = (group: NavGroup, index: number) => (
    <div key={group.id} className={index === 0 ? "" : "mt-5"}>
      <div className="text-[11px] font-semibold uppercase tracking-[0.06em] px-2.5 mb-1.5 text-txt-muted">
        {group.label}
      </div>
      <div className="space-y-0.5">{group.items.map(render_nav_item)}</div>
    </div>
  );

  const render_mobile_nav_group = (group: NavGroup, index: number) => (
    <div key={group.id}>
      <div
        className={
          "text-[11px] font-semibold uppercase tracking-wider px-4 py-3 text-txt-muted" +
          (index === 0 ? "" : " mt-2")
        }
      >
        {group.label}
      </div>
      {group.items.map(render_mobile_nav_item)}
    </div>
  );

  const get_current_section_label = () => {
    const item = flatten_nav_items(nav_items).find((i) => i.id === section);

    return item?.label || t("settings.title");
  };

  const get_current_group = () =>
    nav_items.find((candidate) =>
      candidate.items.some((item) => item.id === section),
    ) ?? null;

  const [search_slot, set_search_slot] = useState<HTMLElement | null>(null);
  const [active_result_index, set_active_result_index] = useState(0);
  const [results_dismissed, set_results_dismissed] = useState(false);
  const search_field_ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    set_search_slot(document.getElementById("settings_search_slot"));
  }, [is_popup]);

  useEffect(() => {
    set_active_result_index(0);
    set_results_dismissed(false);
  }, [search_query]);

  const results_open = search_query.trim().length >= 2 && !results_dismissed;

  useEffect(() => {
    if (!results_open) return;

    const handle_pointer_down = (e: PointerEvent) => {
      const target = e.target as Node | null;

      if (!target) return;
      if (search_field_ref.current?.contains(target)) return;
      set_results_dismissed(true);
    };

    window.addEventListener("pointerdown", handle_pointer_down);

    return () => window.removeEventListener("pointerdown", handle_pointer_down);
  }, [results_open]);

  const open_search_result = useCallback(
    (entry: { section: Section; label: string; tab?: string }) => {
      if (entry.tab) request_settings_tab(entry.tab);
      handle_desktop_nav_click(entry.section);
      set_scroll_target(entry.label);
      set_search_query("");
    },
    [handle_desktop_nav_click],
  );

  const handle_search_keydown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (is_composing(e)) return;

    if (!registry_results.length) {
      if (e["key"] === "Escape") set_search_query("");

      return;
    }
    if (e["key"] === "ArrowDown") {
      e.preventDefault();
      set_active_result_index((prev) => (prev + 1) % registry_results.length);
    } else if (e["key"] === "ArrowUp") {
      e.preventDefault();
      set_active_result_index(
        (prev) =>
          (prev - 1 + registry_results.length) % registry_results.length,
      );
    } else if (e["key"] === "Enter") {
      e.preventDefault();
      const entry =
        registry_results[
          Math.min(active_result_index, registry_results.length - 1)
        ];

      if (entry) open_search_result(entry);
    } else if (e["key"] === "Escape") {
      e.preventDefault();
      set_search_query("");
      (e.currentTarget as HTMLInputElement).blur();
    }
  };

  const search_field =
    is_popup || !search_slot
      ? null
      : createPortal(
          <div ref={search_field_ref} className="relative w-full max-w-[620px]">
            <MagnifyingGlassIcon
              className="pointer-events-none absolute start-4 top-1/2 -translate-y-1/2 w-5 h-5"
              style={{ color: "var(--icon-muted)" }}
            />
            <input
              autoComplete="off"
              className="aster_search_field w-full h-10 ps-11 pe-4 rounded-full border-0 text-sm text-txt-primary placeholder:text-[var(--text-secondary)] outline-none focus:outline-none focus:ring-0"
              placeholder={t("settings.search_placeholder")}
              spellCheck={false}
              type="search"
              value={search_query}
              onChange={(e) => set_search_query(e.target.value)}
              onKeyDown={handle_search_keydown}
            />
            {search_query.length > 0 && (
              <button
                aria-label={t("common.clear")}
                className="absolute end-3 top-1/2 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded-full text-txt-muted transition-colors hover:bg-surf-hover hover:text-txt-primary"
                type="button"
                onClick={() => set_search_query("")}
              >
                <XMarkIcon className="h-4 w-4" />
              </button>
            )}
            {is_searching && results_open && (
              <div className="aster_search_field absolute top-[calc(100%+8px)] left-1/2 -translate-x-1/2 w-full max-w-[620px] rounded-2xl z-50 p-1.5 shadow-lg">
                <div className="max-h-80 overflow-y-auto">
                  {registry_results.length === 0 ? (
                    <div
                      className="px-4 py-3 text-[13px]"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      {t("common.no_results")}
                    </div>
                  ) : (
                    registry_results.map((entry, idx) => {
                      const nav_item = flatten_nav_items(nav_items).find(
                        (n) => n.id === entry.section,
                      );
                      const is_active = idx === active_result_index;

                      return (
                        <button
                          key={`${entry.section}-${idx}`}
                          className={`w-full flex items-center gap-2.5 px-3 py-2 text-start rounded-[10px] transition-colors duration-100 cursor-pointer ${is_active ? "bg-surf-hover" : ""}`}
                          type="button"
                          onClick={() => open_search_result(entry)}
                          onMouseMove={() => set_active_result_index(idx)}
                        >
                          {nav_item && (
                            <nav_item.icon className="w-4 h-4 flex-shrink-0 text-txt-muted" />
                          )}
                          <div className="flex-1 min-w-0">
                            <span className="block truncate text-[13px] font-medium text-txt-primary">
                              {entry.label}
                            </span>
                          </div>
                          <span className="text-[11px] flex-shrink-0 ms-2 text-txt-muted">
                            {entry.breadcrumb}
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
                {registry_results.length > 0 && (
                  <div className="mt-1 flex items-center justify-end gap-1.5 border-t border-edge-secondary px-3 pt-2 pb-1 text-[11px] text-txt-muted">
                    <span>{t("common.press_enter")}</span>
                    <ArrowUturnLeftIcon className="h-3 w-3 rtl:-scale-x-100" />
                  </div>
                )}
              </div>
            )}
          </div>,
          search_slot,
        );

  return (
    <div className="flex w-full h-full overflow-hidden">
      {search_field}
      <aside
        className={`hidden md:flex flex-col flex-shrink-0 h-full ${is_popup ? "" : "bg-sidebar-bg-custom"}`}
        style={
          is_popup
            ? {
                width: 208,
                minWidth: 208,
                maxWidth: 208,
                backgroundColor: "var(--sidebar-bg)",
                borderRight: "1px solid var(--border-primary)",
              }
            : {
                width: sidebar_width,
                minWidth: sidebar_width,
                maxWidth: sidebar_width,
              }
        }
      >
        {!is_popup && (
          <div className="px-2.5 pt-2 pb-3">
            <Button
              className="w-full !rounded-[14px] gap-2"
              variant="depth"
              onClick={on_close}
            >
              <ArrowLeftIcon className="w-[15px] h-[15px] rtl:-scale-x-100" />
              <span>{t("common.back_to_inbox")}</span>
            </Button>
          </div>
        )}
        <nav
          className={`flex-1 px-3 pb-4 overflow-y-auto ${is_popup ? "pt-4" : "pt-1"}`}
        >
          <div ref={nav_container_ref} className="relative">
            <div
              className="pointer-events-none absolute start-0 w-full rounded-[10px]"
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
              nav_items.map(render_nav_group)
            )}
          </div>
        </nav>
        <div className="flex-shrink-0 px-3 pb-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <StorageMeter
            on_buy_more={
              is_onion_host()
                ? undefined
                : () => {
                    on_section_change("storage");
                    scroll_to_storage_addons();
                  }
            }
            on_open={() => on_section_change("storage")}
            storage_percentage={storage_percentage}
            storage_total_bytes={
              mail_stats_ready ? mail_stats.storage_total_bytes : 0
            }
            storage_used_bytes={mail_stats.storage_used_bytes}
          />
        </div>
      </aside>

      <div
        className={`flex-1 min-h-0 min-w-0 flex flex-col overflow-hidden ${is_popup ? "" : "p-1 md:p-2"}`}
      >
        <div
          className={`flex-1 w-full overflow-hidden flex flex-col min-h-0 transition-colors duration-200 bg-surf-primary ${is_popup ? "" : "rounded-lg md:rounded-xl"}`}
          {...(is_popup
            ? {}
            : { id: "main-content", role: "main", tabIndex: -1 })}
        >
          <div className="flex items-center gap-4 px-4 md:px-6 py-3.5 flex-shrink-0 border-b border-b-edge-secondary">
            <div className="flex items-center gap-3 min-w-0 flex-shrink-0">
              {!show_mobile_nav && (
                <span className="md:hidden -ms-1.5 inline-flex">
                  <Button
                    aria-label={t("common.back")}
                    size="icon"
                    variant="ghost"
                    onClick={() => set_show_mobile_nav(true)}
                  >
                    <ArrowUturnLeftIcon className="w-5 h-5 rtl:-scale-x-100" />
                  </Button>
                </span>
              )}
              <h2 className="text-[17px] font-semibold text-txt-primary flex-shrink-0 truncate">
                <span className="hidden md:inline">{t("settings.title")}</span>
                <span className="md:hidden">
                  {show_mobile_nav
                    ? t("settings.title")
                    : get_current_section_label()}
                </span>
              </h2>
              <SettingsSaveIndicator />
            </div>

            <div className="flex flex-1 items-center justify-end">
              <Button
                aria-label={t("common.close")}
                size="icon"
                variant="ghost"
                onClick={on_close}
              >
                <XMarkIcon className="w-5 h-5" />
              </Button>
            </div>
          </div>

          {show_mobile_nav && (
            <div className="md:hidden flex-1 overflow-y-auto">
              <div className="px-4 pt-3 pb-1">
                <div className="relative">
                  <MagnifyingGlassIcon
                    className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4"
                    style={{ color: "var(--text-muted)" }}
                  />
                  <input
                    autoComplete="off"
                    className="w-full h-9 ps-9 pe-3 rounded-[10px] text-[14px] outline-none"
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
              {is_searching
                ? search_results.map(render_mobile_nav_item)
                : nav_items.map(render_mobile_nav_group)}
            </div>
          )}

          <div
            ref={content_container_ref}
            className={`${is_popup ? "p-4 md:p-6" : "p-4 md:px-10 md:py-8 xl:px-16 2xl:px-24"} flex-1 overflow-y-auto overflow-x-hidden relative ${show_mobile_nav ? "hidden md:flex" : "flex"} flex-col`}
            style={{ scrollbarGutter: "stable", overflowAnchor: "none" }}
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
              className={is_popup ? "w-full" : "w-full max-w-[1040px] mx-auto"}
              style={
                is_suspended
                  ? { opacity: 0.4, pointerEvents: "none" }
                  : undefined
              }
            >
              {!is_popup && (
                <div className="hidden md:block mb-7">
                  <nav
                    aria-label={t("settings.title")}
                    className="mb-2 flex items-center gap-1 text-[12px] text-txt-muted"
                  >
                    <button
                      className={BREADCRUMB_LINK_CLASS}
                      type="button"
                      onClick={() => {
                        const first = nav_items[0]?.items[0];

                        if (first) handle_desktop_nav_click(first.id);
                      }}
                    >
                      {t("settings.title")}
                    </button>
                    <ChevronRightIcon className="h-3 w-3 shrink-0 rtl:-scale-x-100" />
                    {get_current_group() &&
                      get_current_group()?.label !==
                        get_current_section_label() && (
                        <>
                          <button
                            className={BREADCRUMB_LINK_CLASS}
                            type="button"
                            onClick={() => {
                              const first = get_current_group()?.items[0];

                              if (first) handle_desktop_nav_click(first.id);
                            }}
                          >
                            {get_current_group()?.label}
                          </button>
                          <ChevronRightIcon className="h-3 w-3 shrink-0 rtl:-scale-x-100" />
                        </>
                      )}
                    <span aria-current="page" className="text-txt-secondary">
                      {get_current_section_label()}
                    </span>
                  </nav>
                  <h1 className="text-[26px] font-bold text-txt-primary">
                    {get_current_section_label()}
                  </h1>
                </div>
              )}
              {active_section_element}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
