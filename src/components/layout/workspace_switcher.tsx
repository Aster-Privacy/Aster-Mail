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
import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRightStartOnRectangleIcon,
  Cog6ToothIcon,
  PlusIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";

import { show_toast } from "@/components/toast/simple_toast";
import { ConfirmationModal } from "@/components/modals/confirmation_modal";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ProfileAvatar } from "@/components/ui/profile_avatar";
import { use_auth } from "@/contexts/auth_context";
import { use_mail_stats } from "@/hooks/use_mail_stats";
import { use_plan_limits } from "@/hooks/use_plan_limits";
import { use_preferences } from "@/contexts/preferences_context";
import { use_primary_identity } from "@/lib/primary_identity";
import { use_i18n } from "@/lib/i18n/context";
import { format_bytes } from "@/lib/utils";
import type { StoredAccount } from "@/services/account_manager";

const PRIVACY_URL = "https://astermail.org/privacy";
const TERMS_URL = "https://astermail.org/terms";

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
  const { stats } = use_mail_stats();
  const { limits } = use_plan_limits();
  const is_paid_plan = !!limits && limits.plan_code !== "free";

  const [show_logout_confirm, set_show_logout_confirm] = useState(false);
  const [show_logout_all_confirm, set_show_logout_all_confirm] =
    useState(false);
  const [pending_remove, set_pending_remove] = useState<StoredAccount | null>(
    null,
  );
  const max_allowed = max_account_limit;

  const personal_account_count = useMemo(
    () => accounts.filter((a) => a.kind !== "shared").length,
    [accounts],
  );
  const at_limit = max_allowed !== null && personal_account_count >= max_allowed;
  const display_max =
    max_allowed === null
      ? personal_account_count
      : Math.max(max_allowed, personal_account_count);

  const account_email = user?.email ?? "";
  const primary_identity = use_primary_identity(account_email);
  const current_user_email = primary_identity.email || account_email;
  const current_display_name =
    user?.display_name || user?.username || current_user_email.split("@")[0];

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

  const storage_percent = useMemo(() => {
    if (!stats.storage_total_bytes) return 0;

    return Math.min(
      100,
      Math.round((stats.storage_used_bytes / stats.storage_total_bytes) * 100),
    );
  }, [stats.storage_total_bytes, stats.storage_used_bytes]);

  const storage_used_label = useMemo(() => {
    if (!stats.storage_total_bytes) return null;

    return t("auth.storage_of_used", {
      used: format_bytes(stats.storage_used_bytes),
      total: format_bytes(stats.storage_total_bytes),
    });
  }, [stats.storage_total_bytes, stats.storage_used_bytes, t]);

  const open_account_settings = useCallback(() => {
    on_open_change(false);
    navigate("/settings");
    setTimeout(() => {
      window.dispatchEvent(
        new CustomEvent("navigate-settings", { detail: "account" }),
      );
    }, 50);
  }, [navigate, on_open_change]);

  const handle_add_account = useCallback(() => {
    if (at_limit) {
      show_toast(
        t("auth.account_limit_for_plan", { max: String(max_allowed) }),
        "info",
      );
      on_open_change(false);
      navigate("/settings");
      setTimeout(() => {
        window.dispatchEvent(
          new CustomEvent("navigate-settings", { detail: "billing" }),
        );
      }, 50);

      return;
    }
    on_open_change(false);
    set_is_adding_account(true);
    navigate("/sign-in");
  }, [at_limit, max_allowed, on_open_change, set_is_adding_account, navigate, t]);

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

  const handle_request_remove = useCallback(
    (account: StoredAccount, e: React.MouseEvent) => {
      e.stopPropagation();
      set_pending_remove(account);
      on_open_change(false);
    },
    [on_open_change],
  );

  const handle_confirm_remove = useCallback(async () => {
    if (!pending_remove) return;
    const id = pending_remove.id;

    set_pending_remove(null);
    try {
      await remove_account(id);
    } catch (e) {
      if (import.meta.env.DEV) console.error(e);
    }
  }, [pending_remove, remove_account]);

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

  const handle_logout_all = useCallback(() => {
    set_show_logout_all_confirm(true);
    on_open_change(false);
  }, [on_open_change]);

  return (
    <>
      <Popover open={is_open} onOpenChange={on_open_change}>
        <PopoverTrigger asChild>{trigger}</PopoverTrigger>
        <PopoverContent
          align={align}
          className="w-[352px] max-w-[calc(100vw-24px)] p-2 rounded-[24px]"
          sideOffset={8}
          style={{
            backgroundColor: "var(--dropdown-bg)",
            border: "1px solid var(--border-secondary)",
            boxShadow:
              "0 8px 20px -6px rgba(0, 0, 0, 0.18), 0 2px 6px -2px rgba(0, 0, 0, 0.1)",
          }}
        >
          <div
            className="rounded-[18px] px-4 py-4"
            style={{ backgroundColor: "var(--bg-hover)" }}
          >
            <div className="flex items-center gap-3.5">
              <button
                aria-label={t("auth.change_photo")}
                className="rounded-full flex-shrink-0 focus:outline-none"
                title={t("auth.change_photo")}
                type="button"
                onClick={open_account_settings}
              >
                <ProfileAvatar
                  className={
                    is_paid_plan
                      ? "ring-2 ring-[var(--accent-color)] ring-offset-2 ring-offset-[var(--bg-hover)]"
                      : ""
                  }
                  email={account_email}
                  image_url={user?.profile_picture}
                  name={current_display_name}
                  profile_color={preferences.profile_color}
                  size="lg"
                />
              </button>
              <div className="flex flex-col min-w-0 flex-1 gap-0.5">
                <span
                  className="text-[15px] font-semibold leading-tight truncate"
                  style={{ color: "var(--text-primary)" }}
                >
                  {current_display_name}
                </span>
                <span
                  className="text-[12px] leading-tight truncate"
                  style={{ color: "var(--text-muted)" }}
                >
                  {current_user_email}
                </span>
              </div>
              <button
                aria-label={t("settings.account")}
                className="flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition-colors hover:bg-black/[0.08] dark:hover:bg-white/[0.08]"
                title={t("settings.account")}
                type="button"
                onClick={open_account_settings}
              >
                <Cog6ToothIcon
                  className="w-5 h-5"
                  style={{ color: "var(--text-secondary)" }}
                />
              </button>
            </div>

            {storage_used_label && (
              <div className="mt-4">
                <div className="flex items-baseline justify-between mb-2">
                  <span
                    className="text-[12px] font-medium"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {t("common.storage_used")}
                  </span>
                  <span
                    className="text-[12px] tabular-nums"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {storage_used_label}
                  </span>
                </div>
                <div
                  className="h-1.5 w-full rounded-full overflow-hidden"
                  style={{ backgroundColor: "var(--bg-tertiary)" }}
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
              </div>
            )}
          </div>

          {other_accounts.length > 0 && (
            <div className="mt-2">
              <div className="aster_scrollbar_thin max-h-[288px] overflow-y-auto flex flex-col gap-1.5">
                {other_accounts.map((acc) => {
                  const acc_name =
                    acc.user.display_name ||
                    acc.user.username ||
                    acc.user.email.split("@")[0];
                  const needs_sign_in = !acc.refresh_token;

                  return (
                    <div
                      key={acc.id}
                      className="group w-full h-[58px] px-3.5 flex items-center gap-3.5 cursor-pointer rounded-[14px] transition-colors hover:bg-black/[0.06] dark:hover:bg-white/[0.06]"
                      role="button"
                      style={{ backgroundColor: "var(--bg-hover)" }}
                      tabIndex={0}
                      title={t("auth.switch_to_account")}
                      onClick={() => handle_switch(acc.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          handle_switch(acc.id);
                        }
                      }}
                    >
                      <ProfileAvatar
                        email={acc.user.email}
                        image_url={acc.user.profile_picture}
                        name={acc_name}
                        profile_color={acc.user.profile_color}
                        size="sm"
                      />
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
                        <span
                          className="flex-shrink-0 px-2 py-[3px] rounded-md text-[10px] font-medium"
                          style={{
                            backgroundColor: "var(--bg-tertiary)",
                            color: "var(--text-muted)",
                          }}
                        >
                          {t("auth.session_expired_tag")}
                        </span>
                      ) : acc.id === default_account_id ? (
                        <span
                          className="flex-shrink-0 px-2 py-[3px] rounded-md text-[10px] font-medium"
                          style={{
                            backgroundColor: "var(--accent-color)",
                            color: "#ffffff",
                          }}
                        >
                          {t("auth.default_account")}
                        </span>
                      ) : null}
                      {acc.kind !== "shared" && (
                        <button
                          aria-label={t("auth.remove_account")}
                          className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 p-1.5 rounded-full hover:bg-black/[0.08] dark:hover:bg-white/[0.08]"
                          type="button"
                          onClick={(e) => handle_request_remove(acc, e)}
                        >
                          <TrashIcon
                            className="w-4 h-4"
                            style={{ color: "var(--color-danger)" }}
                          />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="mt-1.5 flex flex-col gap-1.5">
            <button
              className={`w-full h-[52px] px-3.5 flex items-center gap-3.5 text-left rounded-[14px] transition-colors hover:bg-black/[0.06] dark:hover:bg-white/[0.06] ${at_limit ? "opacity-60" : ""}`}
              style={{ backgroundColor: "var(--bg-hover)" }}
              title={
                at_limit
                  ? t("auth.account_limit_for_plan", {
                      max: String(max_allowed),
                    })
                  : undefined
              }
              type="button"
              onClick={handle_add_account}
            >
              <span className="w-9 flex justify-center flex-shrink-0">
                <PlusIcon
                  className="w-5 h-5"
                  style={{ color: "var(--text-secondary)" }}
                />
              </span>
              <span
                className="flex-1 text-[13px]"
                style={{ color: "var(--text-primary)" }}
              >
                {t("auth.add_another_account")}
              </span>
              <span
                className="text-[11px] tabular-nums"
                style={{ color: "var(--text-muted)" }}
              >
                {accounts.length}/{display_max}
              </span>
            </button>

            <button
              className="w-full h-[52px] px-3.5 flex items-center gap-3.5 text-left rounded-[14px] transition-colors hover:bg-black/[0.06] dark:hover:bg-white/[0.06]"
              style={{ backgroundColor: "var(--bg-hover)" }}
              type="button"
              onClick={
                other_accounts.length > 0 ? handle_logout_all : handle_logout
              }
            >
              <span className="w-9 flex justify-center flex-shrink-0">
                <ArrowRightStartOnRectangleIcon
                  className="w-5 h-5"
                  style={{ color: "var(--text-secondary)" }}
                />
              </span>
              <span
                className="text-[13px]"
                style={{ color: "var(--text-primary)" }}
              >
                {other_accounts.length > 0
                  ? t("auth.sign_out_all")
                  : t("auth.sign_out")}
              </span>
            </button>
          </div>

          <div className="flex items-center justify-center gap-2 pt-3 pb-1.5">
            <a
              className="text-[11px] hover:underline"
              href={PRIVACY_URL}
              rel="noopener noreferrer"
              style={{ color: "var(--text-muted)" }}
              target="_blank"
            >
              {t("auth.privacy_policy")}
            </a>
            <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
              &middot;
            </span>
            <a
              className="text-[11px] hover:underline"
              href={TERMS_URL}
              rel="noopener noreferrer"
              style={{ color: "var(--text-muted)" }}
              target="_blank"
            >
              {t("auth.terms_of_service")}
            </a>
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
        message={t("common.sign_out_confirmation")}
        on_cancel={() => set_show_logout_all_confirm(false)}
        on_confirm={() => {
          set_show_logout_all_confirm(false);
          do_logout_all();
        }}
        title={t("auth.sign_out_all")}
        variant="danger"
      />

      <ConfirmationModal
        cancel_text={t("common.cancel")}
        confirm_text={t("auth.confirm_remove_account")}
        is_open={pending_remove !== null}
        message={t("auth.remove_account_message", {
          email: pending_remove?.user.email ?? "",
        })}
        on_cancel={() => set_pending_remove(null)}
        on_confirm={handle_confirm_remove}
        title={t("auth.remove_account_title")}
        variant="danger"
      />
    </>
  );
}
