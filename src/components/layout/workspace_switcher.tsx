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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRightStartOnRectangleIcon,
  Cog6ToothIcon,
  PlusIcon,
  PowerIcon,
} from "@heroicons/react/24/outline";

import { show_toast } from "@/components/toast/simple_toast";
import { ConfirmationModal } from "@/components/modals/confirmation_modal";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { ProfileAvatar } from "@/components/ui/profile_avatar";
import { AccountAvatarButton } from "@/components/ui/account_avatar_button";
import { use_auth } from "@/contexts/auth_context";
import { use_mail_stats, prefetch_mail_stats } from "@/hooks/use_mail_stats";
import { use_plan_limits } from "@/hooks/use_plan_limits";
import { PlanBadge } from "@/components/common/plan_badge";
import { use_preferences } from "@/contexts/preferences_context";
import { get_all_accounts } from "@/services/account_manager";
import { api_client } from "@/services/api/client";
import { has_stored_session_passphrase } from "@/contexts/auth/session_passphrase";
import { UNLIMITED_ACCOUNTS } from "@/services/plan_limits";
import { use_primary_identity } from "@/lib/primary_identity";
import { use_i18n } from "@/lib/i18n/context";
import { format_bytes, is_official_sender } from "@/lib/utils";

interface WorkspaceSwitcherProps {
  align?: "start" | "center" | "end";
  trigger: React.ReactNode;
  is_open: boolean;
  on_open_change: (open: boolean) => void;
}

export function WorkspaceSwitcher({
  align = "start",
  trigger,
  is_open,
  on_open_change,
}: WorkspaceSwitcherProps) {
  const navigate = useNavigate();
  const { t } = use_i18n();
  const {
    user,
    logout,
    accounts,
    current_account_id,
    remove_account,
    switch_to_account,
    set_is_adding_account,
    max_account_limit,
  } = use_auth();
  const { preferences } = use_preferences();
  const { stats, has_initialized: stats_ready, refresh } = use_mail_stats();
  const { limits } = use_plan_limits();
  const is_paid_plan = !!limits && limits.plan_code !== "free";

  const [show_logout_confirm, set_show_logout_confirm] = useState(false);
  const [show_logout_all_confirm, set_show_logout_all_confirm] =
    useState(false);
  const is_unlimited_accounts = max_account_limit === UNLIMITED_ACCOUNTS;
  const max_allowed =
    max_account_limit !== null && max_account_limit > 0
      ? max_account_limit
      : null;

  const personal_account_count = useMemo(
    () => accounts.filter((a) => a.kind !== "shared").length,
    [accounts],
  );
  const at_limit =
    max_allowed !== null && personal_account_count >= max_allowed;
  const display_max =
    max_allowed === null
      ? personal_account_count
      : Math.max(max_allowed, personal_account_count);

  const account_email = user?.email ?? "";
  const primary_identity = use_primary_identity(account_email);
  const current_user_email = primary_identity.email || account_email;
  const current_display_name =
    user?.display_name || user?.username || current_user_email.split("@")[0];

  const token_backed_sessions = api_client.can_persist_session();
  const [plan_flags, set_plan_flags] = useState<Record<string, boolean>>({});
  const popover_ref = useRef<HTMLDivElement>(null);
  const pointer_close_ref = useRef(false);

  const other_accounts = useMemo(
    () => accounts.filter((a) => a.id !== current_account_id),
    [accounts, current_account_id],
  );

  const default_account_id = useMemo(() => {
    const personal = accounts.filter((a) => a.kind !== "shared");

    if (personal.length === 0) return null;

    return personal.reduce((oldest, a) =>
      a.added_at < oldest.added_at ? a : oldest,
    ).id;
  }, [accounts]);

  useEffect(() => {
    if (!is_open) return;

    let cancelled = false;

    get_all_accounts()
      .then((stored) => {
        if (cancelled) return;
        const flags: Record<string, boolean> = {};

        for (const acc of stored)
          flags[acc.id] = acc.user.is_paid_plan === true;
        set_plan_flags(flags);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [is_open, current_account_id, limits]);

  const storage_percent = useMemo(() => {
    if (!stats.storage_total_bytes) return 0;

    return Math.min(
      100,
      Math.round((stats.storage_used_bytes / stats.storage_total_bytes) * 100),
    );
  }, [stats.storage_total_bytes, stats.storage_used_bytes]);

  useEffect(() => {
    if (!is_open) return;
    if (!stats_ready) {
      refresh();

      return;
    }
    prefetch_mail_stats();
  }, [is_open, stats_ready, refresh]);

  const storage_used_label = useMemo(() => {
    if (!stats_ready || !stats.storage_total_bytes) return null;

    return t("auth.storage_of_used", {
      used: format_bytes(stats.storage_used_bytes),
      total: format_bytes(stats.storage_total_bytes),
    });
  }, [stats_ready, stats.storage_total_bytes, stats.storage_used_bytes, t]);

  const open_account_settings = useCallback(() => {
    on_open_change(false);
    navigate("/settings/account");
  }, [navigate, on_open_change]);

  const handle_add_account = useCallback(() => {
    if (at_limit) {
      show_toast(
        t("auth.account_limit_for_plan", { max: String(max_allowed) }),
        "info",
      );
      on_open_change(false);
      navigate("/settings/billing");

      return;
    }
    on_open_change(false);
    set_is_adding_account(true);
    navigate("/sign-in");
  }, [
    at_limit,
    max_allowed,
    on_open_change,
    set_is_adding_account,
    navigate,
    t,
  ]);

  const handle_switch = useCallback(
    async (account_id: string) => {
      on_open_change(false);
      try {
        await switch_to_account(account_id);
      } catch (e) {
        if (import.meta.env.DEV) console.error(e);
        show_toast(t("settings.switch_failed"), "error");
      }
    },
    [on_open_change, switch_to_account, t],
  );

  const do_logout = useCallback(async () => {
    on_open_change(false);
    try {
      await logout();
    } catch (e) {
      if (import.meta.env.DEV) console.error(e);
      navigate("/sign-in");
    }
  }, [on_open_change, logout, navigate]);

  const handle_logout = useCallback(() => {
    set_show_logout_confirm(true);
    on_open_change(false);
  }, [on_open_change]);

  const do_logout_all = useCallback(async () => {
    for (const acc of other_accounts) {
      try {
        await remove_account(acc.id);
      } catch (e) {
        if (import.meta.env.DEV) console.error(e);
      }
    }
    await do_logout();
  }, [other_accounts, remove_account, do_logout]);

  const copy_account_email = useCallback(async () => {
    if (!current_user_email) return;
    try {
      await navigator.clipboard.writeText(current_user_email);
      show_toast(t("common.address_copied_to_clipboard"), "success");
    } catch {
      show_toast(t("common.failed_to_copy"), "error");
    }
  }, [current_user_email, t]);

  const handle_logout_all = useCallback(() => {
    set_show_logout_all_confirm(true);
    on_open_change(false);
  }, [on_open_change]);

  return (
    <>
      <Popover open={is_open} onOpenChange={on_open_change}>
        <PopoverTrigger asChild>{trigger}</PopoverTrigger>
        <PopoverContent
          ref={popover_ref}
          align={align}
          className="account_menu_surface w-[352px] max-w-[calc(100vw-24px)] p-2 rounded-[24px] data-[state=closed]:animate-none data-[state=closed]:zoom-out-100 data-[state=closed]:slide-in-from-top-0"
          sideOffset={8}
          onCloseAutoFocus={(e) => {
            if (pointer_close_ref.current) e.preventDefault();
            pointer_close_ref.current = false;
          }}
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            pointer_close_ref.current = false;
            popover_ref.current?.focus();
          }}
          onPointerDownOutside={() => {
            pointer_close_ref.current = true;
          }}
          style={{
            boxShadow:
              "0 18px 40px -12px rgba(0, 0, 0, 0.5), 0 4px 12px -4px rgba(0, 0, 0, 0.3)",
          }}
        >
          <div className="account_menu_card rounded-[18px] px-4 py-4">
            <div className="flex items-center gap-3.5">
              <AccountAvatarButton
                email={account_email}
                image_url={user?.profile_picture}
                is_paid_plan={is_paid_plan}
                name={current_display_name}
                profile_color={preferences.profile_color}
                ring_offset_color="color-mix(in srgb, var(--text-primary) 9%, var(--dropdown-bg))"
                size="lg"
              />
              <div className="flex flex-col min-w-0 flex-1 gap-1">
                <span className="flex items-center gap-1.5 min-w-0">
                  {is_official_sender(current_user_email) && (
                    <img
                      alt={t("mail.official_sender")}
                      className="block h-4 w-4 flex-shrink-0"
                      draggable={false}
                      src="/official_badge.webp"
                      title={t("mail.official_sender")}
                    />
                  )}
                  <span
                    className="min-w-0 flex-1 text-[15px] font-semibold leading-tight truncate"
                    style={{ color: "var(--text-primary)" }}
                    title={current_display_name}
                  >
                    {current_display_name}
                  </span>
                  <PlanBadge plan_code={limits?.plan_code} />
                </span>
                <button
                  className="text-[12px] leading-tight truncate text-left transition-colors hover:text-[var(--text-secondary)]"
                  style={{ color: "var(--text-muted)" }}
                  type="button"
                  onClick={copy_account_email}
                >
                  {current_user_email}
                </button>
              </div>
            </div>
          </div>

          <div className="mt-2 flex flex-col gap-2">
            <button
              className="account_menu_tile"
              type="button"
              onClick={open_account_settings}
            >
              <span className="account_menu_tile_icon">
                <Cog6ToothIcon className="w-[18px] h-[18px]" />
              </span>
              <span className="account_menu_tile_label">
                {t("auth.manage_account")}
              </span>
            </button>

            <button
              className={`account_menu_tile ${at_limit ? "opacity-60" : ""}`}
              type="button"
              onClick={handle_add_account}
            >
              <span className="account_menu_tile_icon">
                <PlusIcon className="w-[18px] h-[18px]" />
              </span>
              <span className="account_menu_tile_label">
                {t("auth.add_another_account")}
              </span>
              {is_unlimited_accounts ? null : (
                <span className="account_menu_tile_meta tabular-nums">
                  {accounts.length}/{display_max}
                </span>
              )}
            </button>

            {other_accounts.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <span
                  className="px-1.5 pt-1.5 text-[11px] font-medium uppercase tracking-[0.06em]"
                  style={{ color: "var(--text-muted)" }}
                >
                  {t("auth.your_accounts")}
                </span>
                <div
                  className={`flex flex-col gap-1.5 ${
                    other_accounts.length > 4
                      ? "aster_scrollbar_thin max-h-[min(52vh,420px)] overflow-y-auto pr-0.5"
                      : ""
                  }`}
                >
                  {other_accounts.map((acc) => {
                    const acc_name =
                      acc.user.display_name ||
                      acc.user.username ||
                      acc.user.email.split("@")[0];
                    const needs_sign_in = token_backed_sessions
                      ? !acc.refresh_token
                      : !has_stored_session_passphrase(acc.id);

                    return (
                      <a
                        key={acc.id}
                        className="account_menu_row group relative w-full h-[60px] flex-shrink-0 px-3.5 flex items-center gap-3.5 cursor-pointer no-underline rounded-[16px]"
                        draggable
                        href={`/?account=${encodeURIComponent(acc.id)}`}
                        onClick={(e) => {
                          if (
                            e.metaKey ||
                            e.ctrlKey ||
                            e.shiftKey ||
                            e.button !== 0
                          ) {
                            return;
                          }
                          e.preventDefault();
                          handle_switch(acc.id);
                        }}
                      >
                        <span
                          className={`inline-flex leading-none flex-shrink-0 ${plan_flags[acc.id] === true ? "plan_ring" : ""}`}
                        >
                          <ProfileAvatar
                            email={acc.user.email}
                            image_url={acc.user.profile_picture}
                            name={acc_name}
                            profile_color={acc.user.profile_color}
                            size="sm"
                          />
                        </span>
                        <div className="flex flex-col min-w-0 flex-1 gap-0.5">
                          <span
                            className="text-[13px] font-medium leading-tight truncate"
                            style={{ color: "var(--text-primary)" }}
                          >
                            {acc_name}
                          </span>
                          <span
                            className="text-[11px] leading-tight truncate"
                            style={{ color: "var(--text-muted)" }}
                          >
                            {acc.user.email}
                          </span>
                        </div>
                        {needs_sign_in ? (
                          <span className="account_menu_badge account_menu_badge_muted">
                            {t("auth.session_expired_tag")}
                          </span>
                        ) : acc.id === default_account_id ? (
                          <span className="account_menu_badge">
                            {t("auth.default_account")}
                          </span>
                        ) : null}
                      </a>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="account_menu_tile flex-col items-stretch gap-2 py-3">
              <div className="flex items-baseline justify-between gap-2">
                <span
                  className="whitespace-nowrap text-[12px] font-medium"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {t("common.storage_used")}
                </span>
                {storage_used_label ? (
                  <span
                    className="truncate text-[12px] tabular-nums"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {storage_used_label}
                  </span>
                ) : (
                  <Skeleton className="h-3 w-[92px] rounded-full" />
                )}
              </div>
              {storage_used_label ? (
                <div
                  className="h-1.5 w-full rounded-full overflow-hidden"
                  style={{
                    backgroundColor:
                      "color-mix(in srgb, var(--text-primary) 18%, transparent)",
                  }}
                >
                  <div
                    className="h-full rounded-full"
                    style={{
                      backgroundColor:
                        storage_percent >= 90
                          ? "var(--color-danger)"
                          : "var(--accent-color)",
                      minWidth: "10px",
                      width: `${storage_percent}%`,
                    }}
                  />
                </div>
              ) : (
                <Skeleton className="h-1.5 w-full rounded-full" />
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                className="account_menu_tile account_menu_tile_danger flex-1"
                type="button"
                onClick={handle_logout}
              >
                <span className="account_menu_tile_icon">
                  <ArrowRightStartOnRectangleIcon className="w-[18px] h-[18px]" />
                </span>
                <span className="account_menu_tile_label">
                  {t("auth.sign_out")}
                </span>
              </button>

              {other_accounts.length > 0 && (
                <button
                  aria-label={t("auth.sign_out_all")}
                  className="account_menu_tile account_menu_tile_danger w-[54px] justify-center px-0"
                  title={t("auth.sign_out_all")}
                  type="button"
                  onClick={handle_logout_all}
                >
                  <span className="account_menu_tile_icon">
                    <PowerIcon className="w-[18px] h-[18px]" />
                  </span>
                </button>
              )}
            </div>
          </div>
        </PopoverContent>
      </Popover>

      <ConfirmationModal
        cancel_text={t("common.cancel")}
        confirm_text={t("auth.sign_out")}
        is_open={show_logout_confirm}
        message={t("common.sign_out_confirmation")}
        on_cancel={() => set_show_logout_confirm(false)}
        on_confirm={() => {
          set_show_logout_confirm(false);
          do_logout();
        }}
        title={t("auth.sign_out")}
        variant="danger"
      />

      <ConfirmationModal
        cancel_text={t("common.cancel")}
        confirm_text={t("auth.sign_out_all")}
        is_open={show_logout_all_confirm}
        message={t("common.sign_out_all_confirmation")}
        on_cancel={() => set_show_logout_all_confirm(false)}
        on_confirm={() => {
          set_show_logout_all_confirm(false);
          do_logout_all();
        }}
        title={t("auth.sign_out_all")}
        variant="danger"
      />
    </>
  );
}
