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
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRightStartOnRectangleIcon,
  ArrowsRightLeftIcon,
  PlusIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";

import { show_toast } from "@/components/toast/simple_toast";
import { ConfirmationModal } from "@/components/modals/confirmation_modal";
import { EmailTag } from "@/components/ui/email_tag";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ProfileAvatar } from "@/components/ui/profile_avatar";
import { use_auth } from "@/contexts/auth_context";
import { use_preferences } from "@/contexts/preferences_context";
import { use_i18n } from "@/lib/i18n/context";
import type { StoredAccount } from "@/services/account_manager";
import {
  get_current_plan_code,
  max_accounts_for_plan,
} from "@/services/plan_limits";

interface WorkspaceSwitcherProps {
  trigger: React.ReactNode;
  is_open: boolean;
  on_open_change: (open: boolean) => void;
}

export function WorkspaceSwitcher({
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
  } = use_auth();
  const { preferences } = use_preferences();

  const [show_logout_confirm, set_show_logout_confirm] = useState(false);
  const [pending_remove, set_pending_remove] = useState<StoredAccount | null>(
    null,
  );
  const [max_allowed, set_max_allowed] = useState<number>(1);

  useEffect(() => {
    if (!is_open) return;
    let cancelled = false;

    get_current_plan_code().then((code) => {
      if (!cancelled) set_max_allowed(max_accounts_for_plan(code));
    });

    return () => {
      cancelled = true;
    };
  }, [is_open]);

  const at_limit = accounts.length >= max_allowed;
  const display_max = Math.max(max_allowed, accounts.length);

  const current_user_email = user?.email ?? "";
  const current_display_name =
    user?.display_name || user?.username || current_user_email.split("@")[0];

  const other_accounts = useMemo(
    () => accounts.filter((a) => a.id !== current_account_id),
    [accounts, current_account_id],
  );

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
      on_open_change(false);
      setTimeout(() => set_pending_remove(account), 100);
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
    on_open_change(false);
    setTimeout(() => set_show_logout_confirm(true), 100);
  }, [on_open_change]);

  return (
    <>
      <Popover open={is_open} onOpenChange={on_open_change}>
        <PopoverTrigger asChild>{trigger}</PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-[290px] p-0 rounded-2xl overflow-hidden"
          sideOffset={8}
          style={{
            backgroundColor: "var(--dropdown-bg)",
            border: "1px solid var(--border-secondary)",
            boxShadow:
              "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
          }}
        >
          <div className="px-3 pt-2.5 pb-1">
            <span
              className="text-[10px] uppercase tracking-wide font-medium"
              style={{ color: "var(--text-muted)" }}
            >
              {t("auth.your_accounts")}
            </span>
          </div>

          <div className="px-1.5 pb-1.5">
            <div
              className="w-full px-2.5 py-2 rounded-[14px] flex items-center gap-2.5"
              style={{ backgroundColor: "var(--surf-tertiary, transparent)" }}
            >
              <div className="relative">
                <ProfileAvatar
                  email={current_user_email}
                  image_url={user?.profile_picture}
                  name={current_display_name}
                  profile_color={preferences.profile_color}
                  size="xs"
                  solid_aster_fallback
                />
                <div
                  className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2"
                  style={{
                    backgroundColor: "var(--color-success)",
                    borderColor: "var(--dropdown-bg)",
                  }}
                />
              </div>
              <div className="flex flex-col min-w-0 flex-1">
                <span
                  className="text-[12px] font-medium truncate"
                  style={{ color: "var(--text-primary)" }}
                >
                  {current_display_name}
                </span>
                <span
                  className="text-[11px] truncate"
                  style={{ color: "var(--text-muted)" }}
                >
                  {current_user_email}
                </span>
              </div>
              <EmailTag
                label={t("auth.active_account")}
                show_icon={false}
                size="xs"
                variant="emerald"
              />
            </div>
          </div>

          {other_accounts.length > 0 && (
            <>
              <div
                className="h-px mx-2"
                style={{ backgroundColor: "var(--border-secondary)" }}
              />
              <div className="p-1.5 max-h-[200px] overflow-y-auto">
                {other_accounts.map((acc) => {
                  const acc_name =
                    acc.user.display_name ||
                    acc.user.username ||
                    acc.user.email.split("@")[0];

                  return (
                    <div
                      key={acc.id}
                      className="group w-full px-2.5 py-1.5 rounded-[12px] flex items-center gap-2.5 cursor-pointer transition-colors hover:bg-black/[0.04] dark:hover:bg-white/[0.04]"
                      role="button"
                      tabIndex={0}
                      onClick={() => handle_switch(acc.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          handle_switch(acc.id);
                        }
                      }}
                      title={t("auth.switch_to_account")}
                    >
                      <ProfileAvatar
                        email={acc.user.email}
                        image_url={acc.user.profile_picture}
                        name={acc_name}
                        profile_color={acc.user.profile_color}
                        size="xs"
                        solid_aster_fallback
                      />
                      <div className="flex flex-col min-w-0 flex-1">
                        <span
                          className="text-[12px] font-medium truncate"
                          style={{ color: "var(--text-primary)" }}
                        >
                          {acc_name}
                        </span>
                        <span
                          className="text-[11px] truncate"
                          style={{ color: "var(--text-muted)" }}
                        >
                          {acc.user.email}
                        </span>
                      </div>
                      <ArrowsRightLeftIcon
                        className="w-3.5 h-3.5 flex-shrink-0 opacity-60"
                        style={{ color: "var(--text-muted)" }}
                      />
                      <button
                        aria-label={t("auth.remove_account")}
                        className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 p-1 rounded hover:bg-[var(--surf-secondary,rgba(0,0,0,0.08))]"
                        type="button"
                        onClick={(e) => handle_request_remove(acc, e)}
                      >
                        <TrashIcon
                          className="w-3.5 h-3.5"
                          style={{ color: "var(--color-danger,#ef4444)" }}
                        />
                      </button>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          <div
            className="h-px mx-2"
            style={{ backgroundColor: "var(--border-secondary)" }}
          />

          <div className="p-1.5">
            <button
              className={`w-full px-2.5 py-2 rounded-[12px] flex items-center gap-2.5 text-left transition-colors hover:bg-black/[0.04] dark:hover:bg-white/[0.04] ${at_limit ? "opacity-60" : ""}`}
              type="button"
              onClick={handle_add_account}
              title={
                at_limit
                  ? t("auth.account_limit_for_plan", { max: String(max_allowed) })
                  : undefined
              }
            >
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
                style={{
                  backgroundColor: "var(--surf-secondary, rgba(0,0,0,0.06))",
                }}
              >
                <PlusIcon
                  className="w-3.5 h-3.5"
                  style={{ color: "var(--text-secondary)" }}
                />
              </div>
              <div className="flex flex-col flex-1 min-w-0">
                <span
                  className="text-[12px] font-medium"
                  style={{ color: "var(--text-primary)" }}
                >
                  {t("auth.add_another_account")}
                </span>
                <span
                  className="text-[10px]"
                  style={{ color: "var(--text-muted)" }}
                >
                  {accounts.length}/{display_max}
                </span>
              </div>
            </button>
          </div>

          <div
            className="h-px mx-2"
            style={{ backgroundColor: "var(--border-secondary)" }}
          />

          <div className="p-1.5">
            <Button
              className="w-full text-[12px]"
              size="sm"
              variant="destructive"
              onClick={handle_logout}
            >
              <ArrowRightStartOnRectangleIcon className="w-3.5 h-3.5" />
              {t("auth.sign_out")}
            </Button>
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
