import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRightStartOnRectangleIcon,
  ArrowTopRightOnSquareIcon,
  SparklesIcon,
  ClipboardDocumentIcon,
} from "@heroicons/react/24/outline";

import { show_toast } from "./simple_toast";
import { ConfirmationModal } from "./confirmation_modal";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { ProfileAvatar } from "@/components/ui/profile_avatar";
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
            backgroundColor: "var(--bg-secondary)",
            border: "1px solid var(--border-primary)",
            boxShadow:
              "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04), 0 0 0 1px rgba(0, 0, 0, 0.05)",
          }}
        >
          <div
            className="pb-3 rounded-b-2xl"
            style={{
              backgroundColor: "var(--bg-primary)",
            }}
          >
            <div className="px-2.5 pt-2.5 pb-2">
              <button
                className="w-full px-2.5 py-1.5 rounded-md transition-colors text-left flex items-center justify-between hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
                type="button"
                onClick={handle_copy_email}
              >
                <span
                  className="text-[12px] truncate"
                  style={{ color: "var(--text-muted)" }}
                >
                  {user_email}
                </span>
                <ClipboardDocumentIcon
                  className="w-3.5 h-3.5 flex-shrink-0 ml-2"
                  style={{ color: "var(--text-muted)" }}
                />
              </button>
            </div>

            <div className="px-2.5">
              <div
                className="p-2.5 rounded-lg shadow-inner"
                style={{
                  backgroundColor: "var(--bg-tertiary)",
                  boxShadow: "inset 0 2px 4px 0 rgba(0, 0, 0, 0.06)",
                }}
              >
                <div className="grid grid-cols-4 gap-1.5">
                  <button
                    className="flex flex-col items-center gap-1 transition-all active:scale-95 rounded-lg p-1 hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
                    type="button"
                  >
                    <div className="w-11 h-11 rounded-lg overflow-hidden shadow-sm">
                      <img
                        alt="Mail"
                        className="w-full h-full object-cover select-none"
                        draggable={false}
                        src="/mail_logo.png"
                      />
                    </div>
                    <span
                      className="text-[10px] font-medium"
                      style={{ color: "var(--text-primary)" }}
                    >
                      Mail
                    </span>
                  </button>

                  <div className="flex flex-col items-center gap-1 opacity-40 p-1">
                    <Skeleton className="w-11 h-11 rounded-lg shadow-sm" />
                    <span
                      className="text-[10px] font-medium"
                      style={{ color: "var(--text-muted)" }}
                    >
                      Drive
                    </span>
                  </div>

                  <div className="flex flex-col items-center gap-1 opacity-40 p-1">
                    <Skeleton className="w-11 h-11 rounded-lg shadow-sm" />
                    <span
                      className="text-[10px] font-medium"
                      style={{ color: "var(--text-muted)" }}
                    >
                      Pages
                    </span>
                  </div>

                  <div className="flex flex-col items-center gap-1 opacity-40 p-1">
                    <Skeleton className="w-11 h-11 rounded-lg shadow-sm" />
                    <span
                      className="text-[10px] font-medium"
                      style={{ color: "var(--text-muted)" }}
                    >
                      Calendar
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="px-2.5 py-1.5">
            <div className="flex items-center gap-2.5 px-2 py-2">
              <ProfileAvatar name={display_name} size="xs" />
              <div className="flex-1 min-w-0 text-left">
                <div
                  className="text-[13px] font-medium truncate"
                  style={{ color: "var(--text-primary)" }}
                >
                  {display_name}
                </div>
                <div
                  className="text-[11px] truncate"
                  style={{ color: "var(--text-muted)" }}
                >
                  {user_email}
                </div>
              </div>
            </div>
          </div>

          <div className="px-2.5 pb-2.5 pt-2">
            <button
              className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg transition-colors hover:bg-black/[0.04] dark:hover:bg-white/[0.06] mb-0.5"
              type="button"
              onClick={() => {
                on_open_change(false);
                navigate("/plans");
              }}
            >
              <SparklesIcon
                className="w-4 h-4"
                style={{ color: "var(--text-muted)" }}
              />
              <span
                className="text-[13px]"
                style={{ color: "var(--text-secondary)" }}
              >
                Upgrade to Pro
              </span>
            </button>

            <a
              className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg transition-colors hover:bg-black/[0.04] dark:hover:bg-white/[0.06] mb-0.5"
              href="https://portal.astermail.org"
              rel="noopener noreferrer"
              target="_blank"
              onClick={() => on_open_change(false)}
            >
              <ArrowTopRightOnSquareIcon
                className="w-4 h-4"
                style={{ color: "var(--text-muted)" }}
              />
              <span
                className="text-[13px]"
                style={{ color: "var(--text-secondary)" }}
              >
                Go to Portal
              </span>
            </a>

            <button
              className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg transition-colors hover:bg-red-500/10"
              type="button"
              onClick={handle_logout}
            >
              <ArrowRightStartOnRectangleIcon className="w-4 h-4 text-red-500" />
              <span className="text-[13px] text-red-500">
                {t("auth.sign_out")}
              </span>
            </button>
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
