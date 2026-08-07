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
import type { SenderOption } from "@/hooks/use_sender_aliases";
import type { TranslationKey } from "@/lib/i18n";

import {
  useId,
  useState,
  useRef,
  useEffect,
  useMemo,
  useCallback,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronDownIcon,
  CheckIcon,
  AtSymbolIcon,
  EyeSlashIcon,
  MagnifyingGlassIcon,
} from "@heroicons/react/24/outline";

import { ProfileAvatar } from "@/components/ui/profile_avatar";
import { use_should_reduce_motion } from "@/provider";
import { PROFILE_COLORS, get_gradient_background } from "@/constants/profile";
import { use_i18n } from "@/lib/i18n/context";
import { use_escape_layer } from "@/lib/overlay_layer_stack";

function get_alias_color(address: string): string {
  let hash = 0;

  for (let i = 0; i < address.length; i++) {
    hash = (hash * 31 + address.charCodeAt(i)) | 0;
  }

  return PROFILE_COLORS[Math.abs(hash) % PROFILE_COLORS.length];
}

function SenderAliasIcon({
  address,
  size,
  profile_picture,
}: {
  address: string;
  size: string;
  profile_picture?: string;
}) {
  const gradient = useMemo(
    () => get_gradient_background(get_alias_color(address)),
    [address],
  );
  const dim = size === "xs" ? 24 : 20;
  const icon_cls = size === "xs" ? "w-3.5 h-3.5" : "w-3 h-3";

  if (profile_picture) {
    return (
      <div
        className="rounded-full overflow-hidden flex-shrink-0"
        style={{ width: dim, height: dim }}
      >
        <img
          alt=""
          className="w-full h-full object-cover"
          src={profile_picture}
        />
      </div>
    );
  }

  return (
    <div
      className="rounded-full flex items-center justify-center flex-shrink-0"
      style={{
        width: dim,
        height: dim,
        background: gradient,
        boxShadow:
          "inset 0 1px 1px rgba(255,255,255,0.2), inset 0 -1px 1px rgba(0,0,0,0.15)",
      }}
    >
      <AtSymbolIcon className={`${icon_cls} text-white`} />
    </div>
  );
}

function GhostSenderIcon({ size }: { size: string }) {
  const dim = size === "xs" ? 24 : 20;
  const icon_cls = size === "xs" ? "w-3.5 h-3.5" : "w-3 h-3";

  return (
    <div
      className="rounded-full flex items-center justify-center flex-shrink-0"
      style={{
        width: dim,
        height: dim,
        background: "linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)",
        boxShadow:
          "inset 0 1px 1px rgba(255,255,255,0.2), inset 0 -1px 1px rgba(0,0,0,0.15)",
      }}
    >
      <EyeSlashIcon className={`${icon_cls} text-white`} />
    </div>
  );
}

function SenderOptionIcon({
  option,
  size,
}: {
  option: SenderOption;
  size: string;
}) {
  if (option.type === "ghost") {
    return <GhostSenderIcon size={size} />;
  }
  if (option.type === "primary") {
    return (
      <ProfileAvatar
        use_domain_logo
        email={option.email}
        name={option.display_name || get_email_username(option.email)}
        size={size as "xs"}
      />
    );
  }

  if (option.profile_picture) {
    return (
      <SenderAliasIcon
        address={option.email}
        profile_picture={option.profile_picture}
        size={size}
      />
    );
  }

  return <SenderAliasIcon address={option.email} size={size} />;
}

interface SenderSelectorProps {
  options: SenderOption[];
  selected: SenderOption | null;
  on_select: (option: SenderOption) => void;
  disabled?: boolean;
  ghost_locked?: boolean;
  on_create_ghost?: () => void;
  is_creating_ghost?: boolean;
  ghost_expiry_days?: number;
  on_set_ghost_expiry?: (days: number) => void;
  ghost_error?: string | null;
  preferred_id?: string | null;
  on_set_preferred?: (id: string | null) => void;
}

function PinIcon({
  filled,
  className,
}: {
  filled: boolean;
  className?: string;
}) {
  if (filled) {
    return (
      <svg
        className={className}
        fill="currentColor"
        viewBox="0 0 24 24"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path d="M14 4V2h-4v2H8l-2 7h4v7l2 2 2-2v-7h4l-2-7z" />
      </svg>
    );
  }

  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M14 4V2h-4v2H8l-2 7h4v7l2 2 2-2v-7h4l-2-7z" />
    </svg>
  );
}

function get_email_username(email: string): string {
  return email.split("@")[0] || email;
}

const SEARCH_VISIBLE_THRESHOLD = 8;

function option_matches_query(option: SenderOption, query: string): boolean {
  if (option.email.toLowerCase().includes(query)) return true;

  return option.display_name?.toLowerCase().includes(query) ?? false;
}

function render_option(
  option: SenderOption,
  is_selected: boolean,
  is_preferred: boolean,
  is_active: boolean,
  on_click: () => void,
  on_toggle_preferred: ((id: string) => void) | null,
  t: (key: TranslationKey, params?: Record<string, string | number>) => string,
) {
  const pin_enabled = !!on_toggle_preferred && option.type !== "ghost";

  return (
    <div
      key={option.id}
      className={`group w-full px-3 py-2 flex items-center gap-2 transition-colors ${is_selected || is_active ? "bg-surf-secondary" : ""}`}
      data-sender-active={is_active || undefined}
      onMouseEnter={(e) => {
        if (!is_selected && !is_active) {
          e.currentTarget.style.backgroundColor = "var(--bg-hover)";
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = "transparent";
      }}
    >
      <button
        className="flex items-center gap-2 text-left flex-1 min-w-0"
        type="button"
        onClick={on_click}
      >
        <SenderOptionIcon option={option} size="xs" />
        <div className="flex-1 min-w-0">
          <p className="text-sm truncate text-txt-primary">{option.email}</p>
          {option.display_name && (
            <p className="text-xs truncate text-txt-muted">
              {option.display_name}
            </p>
          )}
        </div>
      </button>
      {pin_enabled && (
        <button
          aria-label={
            is_preferred
              ? t("common.unpin_preferred_sender")
              : t("common.pin_preferred_sender")
          }
          className={`flex-shrink-0 p-1.5 rounded transition-opacity ${
            is_preferred
              ? "opacity-100 text-blue-500 hover:text-blue-500"
              : "sm:opacity-0 opacity-60 sm:group-hover:opacity-60 text-txt-muted hover:opacity-100"
          }`}
          title={
            is_preferred
              ? t("common.unpin_preferred_sender")
              : t("common.pin_preferred_sender")
          }
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            on_toggle_preferred!(option.id);
          }}
        >
          <PinIcon
            className={`w-4 h-4 transition-transform duration-200 ${is_preferred ? "rotate-45" : ""}`}
            filled={is_preferred}
          />
        </button>
      )}
      {is_selected && (
        <CheckIcon className="w-4 h-4 flex-shrink-0 text-txt-primary" />
      )}
    </div>
  );
}

export function SenderSelector({
  options,
  selected,
  on_select,
  disabled = false,
  ghost_locked = false,
  on_create_ghost,
  is_creating_ghost = false,
  ghost_expiry_days = 30,
  on_set_ghost_expiry,
  ghost_error,
  preferred_id = null,
  on_set_preferred,
}: SenderSelectorProps) {
  const toggle_preferred = on_set_preferred
    ? (id: string) => {
        on_set_preferred(preferred_id === id ? null : id);
      }
    : null;
  const reduce_motion = use_should_reduce_motion();
  const { t } = use_i18n();
  const [is_open, set_is_open] = useState(false);
  const [search_query, set_search_query] = useState("");
  const [active_index, set_active_index] = useState(-1);
  const dropdown_ref = useRef<HTMLDivElement>(null);
  const panel_ref = useRef<HTMLDivElement>(null);
  const search_input_ref = useRef<HTMLInputElement>(null);
  const panel_id = useId();
  const [panel_style, set_panel_style] = useState<CSSProperties>({});

  const reposition_panel = useCallback(() => {
    const anchor = dropdown_ref.current;

    if (!anchor) return;

    const rect = anchor.getBoundingClientRect();
    const viewport_w = window.innerWidth;
    const viewport_h = window.innerHeight;
    const panel_width = Math.min(384, viewport_w - 32);
    const left = Math.min(Math.max(rect.left, 16), viewport_w - panel_width - 16);
    const space_below = viewport_h - rect.bottom - 16;
    const space_above = rect.top - 16;
    const opens_up = space_below < 240 && space_above > space_below;
    const max_height = Math.min(448, (opens_up ? space_above : space_below) - 4);

    set_panel_style(
      opens_up
        ? {
            position: "fixed",
            left,
            bottom: viewport_h - rect.top + 4,
            width: panel_width,
            maxHeight: max_height,
          }
        : {
            position: "fixed",
            left,
            top: rect.bottom + 4,
            width: panel_width,
            maxHeight: max_height,
          },
    );
  }, []);

  useEffect(() => {
    if (!is_open) return;

    reposition_panel();
    window.addEventListener("resize", reposition_panel);
    window.addEventListener("scroll", reposition_panel, true);

    return () => {
      window.removeEventListener("resize", reposition_panel);
      window.removeEventListener("scroll", reposition_panel, true);
    };
  }, [is_open, reposition_panel]);
  const prev_ghost_count = useRef(
    options.filter((o) => o.type === "ghost").length,
  );

  useEffect(() => {
    if (is_open) {
      set_search_query("");
      set_active_index(-1);
      requestAnimationFrame(() => search_input_ref.current?.focus());
    }
  }, [is_open]);

  useEffect(() => {
    const active_row = panel_ref.current?.querySelector(
      "[data-sender-active]",
    );

    active_row?.scrollIntoView({ block: "nearest" });
  }, [active_index]);

  useEffect(() => {
    const ghost_count = options.filter((o) => o.type === "ghost").length;

    if (ghost_count > prev_ghost_count.current && is_open) {
      set_is_open(false);
    }
    prev_ghost_count.current = ghost_count;
  }, [options, is_open]);

  useEffect(() => {
    function handle_click_outside(event: MouseEvent) {
      const target = event.target as Node;
      const inside_anchor = dropdown_ref.current?.contains(target);
      const inside_panel = panel_ref.current?.contains(target);

      if (!inside_anchor && !inside_panel) {
        set_is_open(false);
      }
    }

    if (is_open) {
      document.addEventListener("mousedown", handle_click_outside);

      return () =>
        document.removeEventListener("mousedown", handle_click_outside);
    }
  }, [is_open]);

  const close_selector = useCallback(() => set_is_open(false), []);

  use_escape_layer(is_open, close_selector, "compose_sender_selector");

  const display_option = selected || options[0];

  if (!display_option) {
    return (
      <div className="flex-1 flex items-center gap-1.5">
        <div className="w-5 h-5 rounded-full animate-pulse bg-surf-hover" />
        <span className="text-sm h-4 w-32 rounded animate-pulse bg-surf-hover" />
      </div>
    );
  }

  if (ghost_locked && selected?.type === "ghost") {
    return (
      <div className="flex-1 flex items-center gap-1.5 opacity-80">
        <GhostSenderIcon size="xs" />
        <span className="text-sm text-purple-500">{display_option.email}</span>
        <EyeSlashIcon className="w-3.5 h-3.5 text-purple-400" />
      </div>
    );
  }

  if (options.length <= 1 && !on_create_ghost) {
    return (
      <div className="flex-1 flex items-center gap-1.5">
        <SenderOptionIcon option={display_option} size="xs" />
        <span className="text-sm text-txt-primary">{display_option.email}</span>
      </div>
    );
  }

  const normalized_query = search_query.trim().toLowerCase();
  const filter_group = (group: SenderOption[]) =>
    normalized_query
      ? group.filter((o) => option_matches_query(o, normalized_query))
      : group;

  const show_search = options.length >= SEARCH_VISIBLE_THRESHOLD;
  const show_create_ghost = !!on_create_ghost && !normalized_query;

  const primary_options = filter_group(
    options.filter((o) => o.type === "primary"),
  );
  const alias_options = filter_group(options.filter((o) => o.type === "alias"));
  const domain_options = filter_group(
    options.filter((o) => o.type === "domain"),
  );
  const external_options = filter_group(
    options.filter((o) => o.type === "external"),
  );
  const ghost_options = filter_group(options.filter((o) => o.type === "ghost"));

  const visible_options = [
    ...primary_options,
    ...alias_options,
    ...domain_options,
    ...external_options,
    ...ghost_options,
  ];

  const active_option_id =
    active_index >= 0 ? visible_options[active_index]?.id : undefined;

  const select_option = (option: SenderOption) => {
    on_select(option);
    set_is_open(false);
  };

  const handle_search_key_down = (
    event: ReactKeyboardEvent<HTMLInputElement>,
  ) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      set_active_index((i) => Math.min(i + 1, visible_options.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      set_active_index((i) => Math.max(i - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const target =
        active_index >= 0
          ? visible_options[active_index]
          : normalized_query
            ? visible_options[0]
            : undefined;

      if (target) {
        select_option(target);
      }
    }
  };

  const has_multiple_groups =
    [
      primary_options,
      alias_options,
      domain_options,
      external_options,
      ghost_options,
    ].filter((g) => g.length > 0).length > 1 || show_create_ghost;

  return (
    <div ref={dropdown_ref} className="relative flex-1">
      <button
        aria-controls={is_open ? panel_id : undefined}
        aria-expanded={is_open}
        aria-haspopup="listbox"
        className="flex items-center gap-1.5 py-0.5 px-1 -ml-1 rounded transition-colors disabled:opacity-50"
        disabled={disabled}
        type="button"
        onClick={() => set_is_open(!is_open)}
        onMouseEnter={(e) => {
          if (!disabled) {
            e.currentTarget.style.backgroundColor = "var(--bg-hover)";
          }
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = "transparent";
        }}
      >
        <SenderOptionIcon option={display_option} size="xs" />
        <span className="text-sm text-txt-primary">{display_option.email}</span>
        <ChevronDownIcon className="w-3.5 h-3.5 text-txt-muted" />
      </button>

      {createPortal(
        <AnimatePresence>
        {is_open && (
          <motion.div
            ref={panel_ref}
            animate={{ opacity: 1, y: 0 }}
            className="z-[70] rounded-lg shadow-lg overflow-y-auto bg-surf-card border border-edge-secondary scrollbar-hide"
            exit={{ opacity: 0, y: -8 }}
            id={panel_id}
            initial={reduce_motion ? false : { opacity: 0, y: -8 }}
            style={panel_style}
            transition={{ duration: reduce_motion ? 0 : 0.15 }}
          >
            {show_search && (
              <div className="sticky top-0 z-10 px-2 pt-2 pb-1.5 bg-surf-card border-b border-edge-secondary">
                <div className="relative">
                  <MagnifyingGlassIcon className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none text-txt-muted" />
                  <input
                    ref={search_input_ref}
                    className="w-full pl-7 pr-2 py-1.5 text-sm rounded-md bg-surf-secondary text-txt-primary placeholder:text-txt-muted focus:outline-none"
                    placeholder={t("settings.alias_search_placeholder")}
                    type="text"
                    value={search_query}
                    onChange={(e) => {
                      set_search_query(e.target.value);
                      set_active_index(-1);
                    }}
                    onKeyDown={handle_search_key_down}
                  />
                </div>
              </div>
            )}
            <div className="py-1">
              {normalized_query && visible_options.length === 0 && (
                <p className="px-3 py-4 text-sm text-center text-txt-muted">
                  {t("common.no_results")}
                </p>
              )}
              {primary_options.length > 0 && (
                <>
                  {has_multiple_groups && (
                    <div className="px-3 pt-1.5 pb-1 text-[10px] font-medium uppercase tracking-wider text-txt-muted">
                      {t("common.sender_group_primary")}
                    </div>
                  )}
                  {primary_options.map((option) =>
                    render_option(
                      option,
                      selected?.id === option.id,
                      preferred_id === option.id,
                      active_option_id === option.id,
                      () => select_option(option),
                      toggle_preferred,
                      t,
                    ),
                  )}
                </>
              )}
              {alias_options.length > 0 && (
                <>
                  {has_multiple_groups && (
                    <div className="px-3 pt-1.5 pb-1 text-[10px] font-medium uppercase tracking-wider text-txt-muted">
                      {t("common.sender_group_aliases")}
                    </div>
                  )}
                  {alias_options.map((option) =>
                    render_option(
                      option,
                      selected?.id === option.id,
                      preferred_id === option.id,
                      active_option_id === option.id,
                      () => select_option(option),
                      toggle_preferred,
                      t,
                    ),
                  )}
                </>
              )}
              {domain_options.length > 0 && (
                <>
                  {has_multiple_groups && (
                    <div className="px-3 pt-1.5 pb-1 text-[10px] font-medium uppercase tracking-wider text-txt-muted">
                      {t("common.sender_group_custom_domains")}
                    </div>
                  )}
                  {domain_options.map((option) =>
                    render_option(
                      option,
                      selected?.id === option.id,
                      preferred_id === option.id,
                      active_option_id === option.id,
                      () => select_option(option),
                      toggle_preferred,
                      t,
                    ),
                  )}
                </>
              )}
              {external_options.length > 0 && (
                <>
                  {has_multiple_groups && (
                    <div className="px-3 pt-1.5 pb-1 text-[10px] font-medium uppercase tracking-wider text-txt-muted">
                      {t("common.sender_group_external")}
                    </div>
                  )}
                  {external_options.map((option) =>
                    render_option(
                      option,
                      selected?.id === option.id,
                      preferred_id === option.id,
                      active_option_id === option.id,
                      () => select_option(option),
                      toggle_preferred,
                      t,
                    ),
                  )}
                </>
              )}
              {ghost_options.length > 0 && (
                <>
                  <div className="px-3 pt-1.5 pb-1 text-[10px] font-medium uppercase tracking-wider text-txt-muted">
                    {t("common.sender_group_ghost")}
                  </div>
                  {ghost_options.map((option) =>
                    render_option(
                      option,
                      selected?.id === option.id,
                      false,
                      active_option_id === option.id,
                      () => select_option(option),
                      null,
                      t,
                    ),
                  )}
                </>
              )}
              {on_create_ghost &&
                !normalized_query &&
                !ghost_options.some((g) => g.id === selected?.id) && (
                  <>
                    {ghost_options.length === 0 && (
                      <div className="px-3 pt-1.5 pb-1 text-[10px] font-medium uppercase tracking-wider text-txt-muted">
                        {t("common.sender_group_ghost")}
                      </div>
                    )}
                    <button
                      className="w-full px-3 py-2 flex items-center gap-2 text-left transition-colors disabled:opacity-50"
                      disabled={is_creating_ghost}
                      type="button"
                      onClick={() => on_create_ghost()}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor =
                          "var(--bg-hover)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = "transparent";
                      }}
                    >
                      <div
                        className="rounded-full flex items-center justify-center flex-shrink-0"
                        style={{
                          width: 24,
                          height: 24,
                          background:
                            "linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)",
                          boxShadow:
                            "inset 0 1px 1px rgba(255,255,255,0.2), inset 0 -1px 1px rgba(0,0,0,0.15)",
                        }}
                      >
                        {is_creating_ghost ? (
                          <svg
                            className="w-3 h-3 animate-spin text-white"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            viewBox="0 0 24 24"
                          >
                            <circle
                              cx="12"
                              cy="12"
                              r="10"
                              strokeOpacity="0.25"
                            />
                            <path
                              d="M12 2a10 10 0 0 1 10 10"
                              strokeLinecap="round"
                            />
                          </svg>
                        ) : (
                          <svg
                            className="w-3 h-3 text-white"
                            fill="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
                          </svg>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-txt-primary">
                          {is_creating_ghost
                            ? t("common.creating")
                            : t("common.create_ghost_alias")}
                        </p>
                        <p className="text-xs text-txt-muted">
                          {t("common.hide_real_address_expiry", {
                            days: String(ghost_expiry_days),
                          })}
                        </p>
                      </div>
                      {on_set_ghost_expiry && (
                        <select
                          className="text-[10px] px-1 py-0.5 rounded border bg-transparent appearance-none cursor-pointer border-edge-secondary text-txt-muted"
                          value={ghost_expiry_days}
                          onChange={(e) => {
                            e.stopPropagation();
                            on_set_ghost_expiry(Number(e.target.value));
                          }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <option value={7}>7d</option>
                          <option value={30}>30d</option>
                          <option value={90}>90d</option>
                        </select>
                      )}
                    </button>
                    {ghost_error && (
                      <div className="px-3 py-1.5">
                        <p className="text-xs text-red-500">{ghost_error}</p>
                      </div>
                    )}
                  </>
                )}
            </div>
          </motion.div>
        )}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  );
}
