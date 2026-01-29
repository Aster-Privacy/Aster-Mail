import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRightStartOnRectangleIcon,
  ClipboardDocumentIcon,
} from "@heroicons/react/24/outline";

import { show_toast } from "./simple_toast";
import { ConfirmationModal } from "./confirmation_modal";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ProfileAvatar } from "@/components/ui/profile_avatar";
import { AppGrid, DEFAULT_APPS } from "@/components/ui/app_grid";
import { use_auth } from "@/contexts/auth_context";
import { use_preferences } from "@/contexts/preferences_context";
import { use_i18n } from "@/lib/i18n/context";

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

  const { preferences, update_preference, save_now } = use_preferences();

  const [show_logout_confirm, set_show_logout_confirm] = useState(false);

  const user_email = user?.email ?? "";
  const display_name =
    user?.display_name || user?.username || user_email.split("@")[0];

  const handle_copy_email = useCallback(async () => {
    if (!user_email) return;
    try {
      await navigator.clipboard.writeText(user_email);
      show_toast("Email copied", "success");
    } catch {
      show_toast("Failed to copy", "error");
    }
  }, [user_email]);

  const do_logout = useCallback(async () => {
    on_open_change(false);
    try {
      await logout();
      navigate("/sign-in");
    } catch {
      navigate("/sign-in");
    }
  }, [on_open_change, logout, navigate]);

  const handle_logout = useCallback(() => {
    if (preferences.skip_logout_confirmation) {
      do_logout();
    } else {
      set_show_logout_confirm(true);
    }
  }, [preferences.skip_logout_confirmation, do_logout]);

  const handle_logout_confirm = useCallback(() => {
    set_show_logout_confirm(false);
    do_logout();
  }, [do_logout]);

  const handle_logout_dont_ask_again = useCallback(async () => {
    update_preference("skip_logout_confirmation", true);
    await save_now();
  }, [update_preference, save_now]);

  return (
    <>
      <Popover open={is_open} onOpenChange={on_open_change}>
        <PopoverTrigger asChild>{trigger}</PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-[270px] p-0 rounded-2xl overflow-hidden"
          sideOffset={8}
          style={{
            backgroundColor: "transparent",
            border: "none",
            boxShadow:
              "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04), 0 0 0 1px rgba(0, 0, 0, 0.05)",
          }}
        >
          <div
            className="p-2.5 rounded-2xl"
            style={{
              backgroundColor: "var(--bg-primary)",
              boxShadow: "inset 0 1px 0 0 rgba(255, 255, 255, 0.15), inset 0 -1px 0 0 rgba(0, 0, 0, 0.1)",
            }}
          >
            <div className="pb-2">
              <button
                className="w-full px-2.5 py-1.5 rounded-md transition-colors text-left flex items-center gap-2.5 hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
                type="button"
                onClick={handle_copy_email}
              >
                <ProfileAvatar name={display_name} size="xs" />
                <span
                  className="text-[12px] truncate flex-1"
                  style={{ color: "var(--text-muted)" }}
                >
                  {user_email}
                </span>
                <ClipboardDocumentIcon
                  className="w-3.5 h-3.5 flex-shrink-0"
                  style={{ color: "var(--text-muted)" }}
                />
              </button>
            </div>

            <AppGrid
              apps={DEFAULT_APPS}
              on_app_click={() => on_open_change(false)}
            />

            <div className="pt-2">
              <button
                className="w-full flex items-center justify-center gap-2 px-2.5 py-2 rounded-lg text-white text-[12px] font-medium transition-all hover:brightness-110"
                style={{
                  background:
                    "linear-gradient(to bottom, #f87171 0%, #ef4444 50%, #dc2626 100%)",
                  border: "1px solid rgba(255, 255, 255, 0.15)",
                  borderBottom: "1px solid rgba(0, 0, 0, 0.15)",
                  boxShadow: "0 1px 2px rgba(0, 0, 0, 0.1)",
                }}
                type="button"
                onClick={handle_logout}
              >
                <ArrowRightStartOnRectangleIcon className="w-3.5 h-3.5" />
                <span>{t("auth.sign_out")}</span>
              </button>
            </div>
          </div>
        </PopoverContent>
      </Popover>

      <ConfirmationModal
        show_dont_ask_again
        cancel_text="Cancel"
        confirm_text="Sign Out"
        is_open={show_logout_confirm}
        message="Are you sure you want to sign out of your account?"
        on_cancel={() => set_show_logout_confirm(false)}
        on_confirm={handle_logout_confirm}
        on_dont_ask_again={handle_logout_dont_ask_again}
        title="Sign Out"
        variant="danger"
      />
    </>
  );
}
