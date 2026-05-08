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
  AtSymbolIcon,
  ClipboardDocumentIcon,
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
import { use_auth } from "@/contexts/auth_context";
import { use_preferences } from "@/contexts/preferences_context";
import { use_i18n } from "@/lib/i18n/context";
import { use_sender_aliases } from "@/hooks/use_sender_aliases";
import { PROFILE_COLORS, get_gradient_background } from "@/constants/profile";

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
  const { user, logout } = use_auth();

  const { preferences, update_preference } = use_preferences();
  const { sender_options } = use_sender_aliases();

  const [show_logout_confirm, set_show_logout_confirm] = useState(false);
  const user_email = user?.email ?? "";
  const display_name =
    user?.display_name || user?.username || user_email.split("@")[0];

  const extra_addresses = sender_options.filter(
    (opt) => opt.type !== "primary" && opt.is_enabled,
  );

  const handle_copy = useCallback(
    async (email: string) => {
      if (!email) return;
      try {
        await navigator.clipboard.writeText(email);
        show_toast(t("common.email_copied"), "success");
      } catch (error) {
        if (import.meta.env.DEV) console.error(error);
        show_toast(t("common.failed_to_copy"), "error");
      }
    },
    [t],
  );

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
    </>
  );
}
