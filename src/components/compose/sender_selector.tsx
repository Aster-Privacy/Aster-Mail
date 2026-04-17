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

import { useState, useRef, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronDownIcon,
  CheckIcon,
  AtSymbolIcon,
  EyeSlashIcon,
} from "@heroicons/react/24/outline";

import { ProfileAvatar } from "@/components/ui/profile_avatar";
import { use_should_reduce_motion } from "@/provider";
import { PROFILE_COLORS, get_gradient_background } from "@/constants/profile";
import { use_i18n } from "@/lib/i18n/context";

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
        name={get_email_username(option.email)}
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
}

function get_email_username(email: string): string {
  return email.split("@")[0] || email;
}

function render_option(
  option: SenderOption,
  is_selected: boolean,
  on_click: () => void,
  t: (key: TranslationKey, params?: Record<string, string | number>) => string,
) {
  return (
    <button
      key={option.id}
      className={`w-full px-3 py-2 flex items-center gap-2 text-left transition-colors ${is_selected ? "bg-surf-secondary" : ""}`}
      type="button"
      onClick={on_click}
      onMouseEnter={(e) => {
        if (!is_selected) {
          e.currentTarget.style.backgroundColor = "var(--bg-hover)";
        }
      }}
      onMouseLeave={(e) => {
        if (!is_selected) {
          e.currentTarget.style.backgroundColor = "transparent";
        }
      }}
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
      {option.type === "alias" && (
        <span
          className="text-[10px] px-1.5 py-0.5 rounded flex-shrink-0"
          style={{
            backgroundColor: "var(--accent-muted)",
            color: "var(--accent)",
          }}
        >
          {t("common.sender_type_alias")}
        </span>
      )}
      {option.type === "domain" && (
        <span
          className="text-[10px] px-1.5 py-0.5 rounded flex-shrink-0"
          style={{
            backgroundColor: "rgba(147, 51, 234, 0.15)",
            color: "rgb(147, 51, 234)",
          }}
        >
          {t("common.sender_type_domain")}
        </span>
      )}
      {option.type === "external" && (
        <span
          className="text-[10px] px-1.5 py-0.5 rounded flex-shrink-0"
          style={{
            backgroundColor: "rgba(20, 184, 166, 0.15)",
            color: "rgb(20, 184, 166)",
          }}
        >
          {t("common.sender_type_external")}
        </span>
      )}
      {option.type === "ghost" && (
        <span
          className="text-[10px] px-1.5 py-0.5 rounded flex-shrink-0"
          style={{
            backgroundColor: "rgba(168, 85, 247, 0.15)",
            color: "rgb(168, 85, 247)",
          }}
        >
          {t("common.sender_type_ghost")}
        </span>
      )}
      {is_selected && (
        <CheckIcon className="w-4 h-4 flex-shrink-0 text-txt-primary" />
      )}
    </button>
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
}: SenderSelectorProps) {
  const reduce_motion = use_should_reduce_motion();
  const { t } = use_i18n();
  const [is_open, set_is_open] = useState(false);
  const dropdown_ref = useRef<HTMLDivElement>(null);
  const prev_ghost_count = useRef(
    options.filter((o) => o.type === "ghost").length,
  );

  useEffect(() => {
    const ghost_count = options.filter((o) => o.type === "ghost").length;

    if (ghost_count > prev_ghost_count.current && is_open) {
      set_is_open(false);
    }
    prev_ghost_count.current = ghost_count;
  }, [options, is_open]);

  useEffect(() => {
    function handle_click_outside(event: MouseEvent) {
      if (
        dropdown_ref.current &&
        !dropdown_ref.current.contains(event.target as Node)
      ) {
        set_is_open(false);
      }
    }

    if (is_open) {
      document.addEventListener("mousedown", handle_click_outside);

      return () =>
        document.removeEventListener("mousedown", handle_click_outside);
    }
  }, [is_open]);

  useEffect(() => {
    function handle_escape(event: KeyboardEvent) {
      if (event["key"] === "Escape") {
        set_is_open(false);
      }
    }

    if (is_open) {
      document.addEventListener("keydown", handle_escape);

      return () => document.removeEventListener("keydown", handle_escape);
    }
  }, [is_open]);

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

  const primary_options = options.filter((o) => o.type === "primary");
  const alias_options = options.filter((o) => o.type === "alias");
  const domain_options = options.filter((o) => o.type === "domain");
  const external_options = options.filter((o) => o.type === "external");
  const ghost_options = options.filter((o) => o.type === "ghost");

  const has_multiple_groups =
    [
      primary_options,
      alias_options,
      domain_options,
      external_options,
      ghost_options,
    ].filter((g) => g.length > 0).length > 1 || !!on_create_ghost;

  return (
    <div ref={dropdown_ref} className="relative flex-1">
      <button
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

      <AnimatePresence>
        {is_open && (
          <motion.div
            animate={{ opacity: 1, y: 0 }}
            className="absolute left-0 z-50 mt-1 w-72 max-h-64 rounded-lg shadow-lg overflow-y-auto bg-surf-card border border-edge-secondary scrollbar-hide"
            exit={{ opacity: 0, y: -8 }}
            initial={reduce_motion ? false : { opacity: 0, y: -8 }}
            transition={{ duration: reduce_motion ? 0 : 0.15 }}
          >
            <div className="py-1">
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
                      () => {
                        on_select(option);
                        set_is_open(false);
                      },
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
                      () => {
                        on_select(option);
                        set_is_open(false);
                      },
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
                      () => {
                        on_select(option);
                        set_is_open(false);
                      },
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
                      () => {
                        on_select(option);
                        set_is_open(false);
                      },
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
                      () => {
                        on_select(option);
                        set_is_open(false);
                      },
                      t,
                    ),
                  )}
                </>
              )}
              {on_create_ghost &&
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
      </AnimatePresence>
    </div>
  );
}
