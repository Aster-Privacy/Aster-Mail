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
  AtSymbolIcon,
  ClipboardDocumentIcon,
  PlusIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";

import { show_toast } from "@/components/toast/simple_toast";
import { ConfirmationModal } from "@/components/modals/confirmation_modal";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ProfileAvatar } from "@/components/ui/profile_avatar";
import { Spinner } from "@/components/ui/spinner";
import { use_auth } from "@/contexts/auth_context";
import { use_preferences } from "@/contexts/preferences_context";
import { use_i18n } from "@/lib/i18n/context";
import { use_sender_aliases } from "@/hooks/use_sender_aliases";
import { PROFILE_COLORS, get_gradient_background } from "@/constants/profile";
import {
  store_switch_token,
  get_switch_token,
} from "@/services/account_manager";
import { request_switch_token } from "@/services/api/switch";

function get_alias_color(address: string): string {
  let hash = 0;

  for (let i = 0; i < address.length; i++) {
    hash = (hash * 31 + address.charCodeAt(i)) | 0;
  }

  return PROFILE_COLORS[Math.abs(hash) % PROFILE_COLORS.length];
}

function SwitcherAliasIcon({ address }: { address: string }) {
  const gradient = useMemo(
    () => get_gradient_background(get_alias_color(address)),
    [address],
  );

  return (
    <div
      className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
      style={{
        background: gradient,
        boxShadow:
          "inset 0 1px 1px rgba(255,255,255,0.2), inset 0 -1px 1px rgba(0,0,0,0.15)",
      }}
    >
      <AtSymbolIcon className="w-3 h-3 text-white" />
    </div>
  );
}

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
    switch_account,
    remove_account,
    can_add_account,
    set_is_adding_account,
  } = use_auth();

  const { preferences, update_preference } = use_preferences();
  const { sender_options } = use_sender_aliases();

  const [show_logout_confirm, set_show_logout_confirm] = useState(false);
  const [show_remove_confirm, set_show_remove_confirm] = useState(false);
  const [is_switching, set_is_switching] = useState(false);
  const [can_add, set_can_add] = useState(true);
  const user_email = user?.email ?? "";
  const display_name =
    user?.display_name || user?.username || user_email.split("@")[0];

  const other_accounts = useMemo(
    () => accounts.filter((a) => a.id !== current_account_id),
    [accounts, current_account_id],
  );

  useEffect(() => {
    can_add_account()
      .then(set_can_add)
      .catch((e) => {
        if (import.meta.env.DEV) console.error(e);
      });
  }, [can_add_account]);

  const extra_addresses = sender_options.filter(
    (opt) => opt.type !== "primary" && opt.is_enabled,
  );

  const handle_copy = useCallback(async (email: string) => {
    if (!email) return;
    try {
      await navigator.clipboard.writeText(email);
      show_toast(t("common.email_copied"), "success");
    } catch (error) {
      if (import.meta.env.DEV) console.error(error);
      show_toast(t("common.failed_to_copy"), "error");
    }
  }, []);

  const do_logout = useCallback(async () => {
    on_open_change(false);
    try {
      await logout();
      navigate("/sign-in");
    } catch (error) {
      if (import.meta.env.DEV) console.error(error);
      navigate("/sign-in");
    }
  }, [on_open_change, logout, navigate]);

  const handle_logout = useCallback(() => {
    on_open_change(false);
    if (preferences.skip_logout_confirmation) {
      do_logout();
    } else {
      setTimeout(() => set_show_logout_confirm(true), 100);
    }
  }, [preferences.skip_logout_confirmation, do_logout, on_open_change]);

  const handle_logout_confirm = useCallback(() => {
    set_show_logout_confirm(false);
    do_logout();
  }, [do_logout]);

  const handle_logout_dont_ask_again = useCallback(async () => {
    update_preference("skip_logout_confirmation", true, true);
  }, [update_preference]);

  const handle_switch_account = useCallback(
    async (account_id: string) => {
      set_is_switching(true);
      on_open_change(false);
      try {
        const success = await switch_account(account_id);

        if (!success) {
          show_toast(t("settings.switch_failed"), "error");
          set_is_adding_account(true);
          navigate("/sign-in");
        }
      } catch {
        show_toast(t("settings.switch_failed"), "error");
        set_is_adding_account(true);
        navigate("/sign-in");
      } finally {
        set_is_switching(false);
      }
    },
    [switch_account, on_open_change, t, set_is_adding_account, navigate],
  );

  const handle_add_account = useCallback(async () => {
    on_open_change(false);

    if (current_account_id && !(await get_switch_token(current_account_id))) {
      try {
        const token_response = await request_switch_token();

        if (token_response.data) {
          await store_switch_token(
            current_account_id,
            token_response.data.switch_token,
            token_response.data.expires_at,
          );
        }
      } catch (e) {
        if (import.meta.env.DEV) console.error(e);
      }
    }

    set_is_adding_account(true);
    navigate("/sign-in");
  }, [on_open_change, set_is_adding_account, navigate, current_account_id]);

  const handle_remove_account = useCallback(async () => {
    set_show_remove_confirm(false);
    on_open_change(false);

    if (current_account_id) {
      await remove_account(current_account_id);

      if (accounts.length <= 1) {
        navigate("/sign-in");
      }
    }
  }, [
    current_account_id,
    remove_account,
    accounts.length,
    navigate,
    on_open_change,
  ]);

  return (
    <>
      <Popover open={is_open} onOpenChange={on_open_change}>
        <PopoverTrigger asChild>{trigger}</PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-[270px] p-0 rounded-2xl overflow-hidden"
          sideOffset={8}
          style={{
            backgroundColor: "var(--dropdown-bg)",
            border: "1px solid var(--border-secondary)",
            boxShadow:
              "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
          }}
        >
          {is_switching && (
            <div
              className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl"
              style={{ backgroundColor: "var(--dropdown-bg)", opacity: 0.9 }}
            >
              <Spinner size="md" />
            </div>
          )}

          <div className="p-1.5 pb-0">
            <button
              className="w-full px-2.5 py-2 rounded-lg text-left flex items-center gap-2.5"
              type="button"
              onClick={() => handle_copy(user_email)}
            >
              <div className="relative">
                <ProfileAvatar
                  email={user_email}
                  name={display_name}
                  profile_color={preferences.profile_color}
                  size="xs"
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
                  {display_name}
                </span>
                <span
                  className="text-[11px] truncate"
                  style={{ color: "var(--text-muted)" }}
                >
                  {user_email}
                </span>
              </div>
              <ClipboardDocumentIcon
                className="w-3.5 h-3.5 flex-shrink-0"
                style={{ color: "var(--text-muted)" }}
              />
            </button>

            {other_accounts.length > 0 && (
              <>
                {other_accounts.map((account) => {
                  const acct_name =
                    account.user.display_name ||
                    account.user.username ||
                    account.user.email.split("@")[0];

                  return (
                    <button
                      key={account.id}
                      className="w-full px-2.5 py-2 rounded-lg text-left flex items-center gap-2.5 transition-colors hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
                      disabled={is_switching}
                      type="button"
                      onClick={() => handle_switch_account(account.id)}
                    >
                      <ProfileAvatar
                        email={account.user.email}
                        name={acct_name}
                        profile_color={account.user.profile_color}
                        size="xs"
                      />
                      <div className="flex flex-col min-w-0 flex-1">
                        <span
                          className="text-[12px] font-medium truncate"
                          style={{ color: "var(--text-primary)" }}
                        >
                          {acct_name}
                        </span>
                        <span
                          className="text-[11px] truncate"
                          style={{ color: "var(--text-muted)" }}
                        >
                          {account.user.email}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </>
            )}

            {extra_addresses.length > 0 && (
              <>
                <div
                  className="h-px my-1"
                  style={{ backgroundColor: "var(--border-secondary)" }}
                />
                <div className="max-h-[120px] overflow-y-auto">
                  {extra_addresses.map((addr) => (
                    <button
                      key={addr.id}
                      className="w-full px-2.5 py-1.5 rounded-lg text-left flex items-center gap-2.5"
                      type="button"
                      onClick={() => handle_copy(addr.email)}
                    >
                      <SwitcherAliasIcon address={addr.email} />
                      <span
                        className="text-[11px] truncate flex-1"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {addr.email}
                      </span>
                      <ClipboardDocumentIcon
                        className="w-3 h-3 flex-shrink-0"
                        style={{ color: "var(--text-muted)" }}
                      />
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          <div
            className="h-px my-1.5"
            style={{ backgroundColor: "var(--border-secondary)" }}
          />

          {can_add &&
            !(
              typeof window !== "undefined" && "__TAURI_INTERNALS__" in window
            ) && (
              <>
                <div className="px-1.5">
                  <button
                    className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-[12px] transition-colors hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
                    style={{ color: "var(--text-secondary)" }}
                    type="button"
                    onClick={handle_add_account}
                  >
                    <PlusIcon className="w-4 h-4" />
                    <span>{t("settings.add_account")}</span>
                  </button>
                </div>

                <div
                  className="h-px my-1.5"
                  style={{ backgroundColor: "var(--border-secondary)" }}
                />
              </>
            )}

          <div className="p-1.5 pt-0">
            <Button
              className="w-full text-[12px]"
              size="sm"
              variant="destructive"
              onClick={handle_logout}
            >
              <ArrowRightStartOnRectangleIcon className="w-3.5 h-3.5" />
              {t("auth.sign_out")}
            </Button>

            {accounts.length > 1 && (
              <button
                className="w-full flex items-center justify-center gap-2 px-2.5 py-1.5 mt-2 rounded-lg text-[11px] transition-colors hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
                style={{ color: "var(--text-muted)" }}
                type="button"
                onClick={() => {
                  on_open_change(false);
                  setTimeout(() => set_show_remove_confirm(true), 100);
                }}
              >
                <TrashIcon className="w-3 h-3" />
                <span>{t("settings.remove_account")}</span>
              </button>
            )}
          </div>
        </PopoverContent>
      </Popover>

      <ConfirmationModal
        show_dont_ask_again
        cancel_text={t("common.cancel")}
        confirm_text={t("auth.sign_out")}
        is_open={show_logout_confirm}
        message={t("common.sign_out_confirmation")}
        on_cancel={() => set_show_logout_confirm(false)}
        on_confirm={handle_logout_confirm}
        on_dont_ask_again={handle_logout_dont_ask_again}
        title={t("auth.sign_out")}
        variant="danger"
      />

      <ConfirmationModal
        cancel_text={t("common.cancel")}
        confirm_text={t("settings.remove_account")}
        is_open={show_remove_confirm}
        message={t("common.remove_account_confirmation")}
        on_cancel={() => set_show_remove_confirm(false)}
        on_confirm={handle_remove_account}
        title={t("settings.remove_account")}
        variant="danger"
      />
    </>
  );
}
