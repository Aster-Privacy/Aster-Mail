import { useState, useCallback } from "react";
import { format, formatDistanceToNow, isPast } from "date-fns";
import {
  ClockIcon,
  PaperAirplaneIcon,
  XMarkIcon,
  PencilIcon,
  EllipsisVerticalIcon,
} from "@heroicons/react/24/outline";
import { motion, AnimatePresence } from "framer-motion";

import { Button } from "@/components/ui/button";
import { EmailTag } from "@/components/ui/email_tag";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmationModal } from "@/components/confirmation_modal";
import {
  type ScheduledEmail,
  type ScheduledEmailWithContent,
  cancel_scheduled_email,
  send_scheduled_now,
  get_scheduled_email,
} from "@/services/api/scheduled";
import { use_auth } from "@/contexts/auth_context";
import { cn } from "@/lib/utils";

interface ScheduledEmailCardProps {
  email: ScheduledEmail;
  on_cancelled?: () => void;
  on_sent?: () => void;
  on_edit?: (email: ScheduledEmailWithContent) => void;
}

type ScheduledStatus = "pending" | "sending" | "sent" | "failed" | "cancelled";

const STATUS_TAG_VARIANTS: Record<
  ScheduledStatus,
  {
    variant: "scheduled" | "amber" | "emerald" | "red" | "slate";
    label: string;
    icon: "clock" | "bolt" | "check" | "warning" | "tag";
  }
> = {
  pending: { variant: "scheduled", label: "Pending", icon: "clock" },
  sending: { variant: "amber", label: "Sending", icon: "bolt" },
  sent: { variant: "emerald", label: "Sent", icon: "check" },
  failed: { variant: "red", label: "Failed", icon: "warning" },
  cancelled: { variant: "slate", label: "Cancelled", icon: "tag" },
};

export function ScheduledEmailCard({
  email,
  on_cancelled,
  on_sent,
  on_edit,
}: ScheduledEmailCardProps) {
  const { vault } = use_auth();
  const [is_cancelling, set_is_cancelling] = useState(false);
  const [is_sending_now, set_is_sending_now] = useState(false);
  const [show_cancel_confirm, set_show_cancel_confirm] = useState(false);
  const [is_loading_content, set_is_loading_content] = useState(false);
  const [error, set_error] = useState<string | null>(null);

  const scheduled_date = new Date(email.scheduled_at);
  const is_past_due = isPast(scheduled_date);
  const time_until = is_past_due
    ? "Sending..."
    : formatDistanceToNow(scheduled_date, { addSuffix: true });

  const handle_cancel = useCallback(async () => {
    set_is_cancelling(true);
    set_error(null);

    try {
      const response = await cancel_scheduled_email(email.id);

      if (response.error) {
        set_error(response.error);

        return;
      }

      on_cancelled?.();
    } catch {
      set_error("Failed to cancel scheduled email");
    } finally {
      set_is_cancelling(false);
      set_show_cancel_confirm(false);
    }
  }, [email.id, on_cancelled]);

  const handle_send_now = useCallback(async () => {
    set_is_sending_now(true);
    set_error(null);

    try {
      const response = await send_scheduled_now(email.id);

      if (response.error) {
        set_error(response.error);

        return;
      }

      on_sent?.();
    } catch {
      set_error("Failed to send email");
    } finally {
      set_is_sending_now(false);
    }
  }, [email.id, on_sent]);

  const handle_edit = useCallback(async () => {
    if (!vault) return;

    set_is_loading_content(true);
    set_error(null);

    try {
      const response = await get_scheduled_email(email.id, vault);

      if (response.error || !response.data) {
        set_error(response.error || "Failed to load email content");

        return;
      }

      on_edit?.(response.data);
    } catch {
      set_error("Failed to load email content");
    } finally {
      set_is_loading_content(false);
    }
  }, [email.id, vault, on_edit]);

  const status_config =
    STATUS_TAG_VARIANTS[email.status as ScheduledStatus] ||
    STATUS_TAG_VARIANTS.pending;

  const get_circle_bg = () => {
    switch (email.status) {
      case "pending":
        return "bg-violet-100 dark:bg-violet-500/15";
      case "sending":
        return "bg-amber-100 dark:bg-amber-500/15";
      case "sent":
        return "bg-emerald-100 dark:bg-emerald-500/15";
      case "failed":
        return "bg-red-100 dark:bg-red-500/15";
      case "cancelled":
        return "bg-slate-100 dark:bg-slate-500/15";
      default:
        return "bg-violet-100 dark:bg-violet-500/15";
    }
  };

  const get_icon_color = () => {
    switch (email.status) {
      case "pending":
        return "text-violet-600 dark:text-violet-400";
      case "sending":
        return "text-amber-600 dark:text-amber-400";
      case "sent":
        return "text-emerald-600 dark:text-emerald-400";
      case "failed":
        return "text-red-600 dark:text-red-400";
      case "cancelled":
        return "text-slate-600 dark:text-slate-400";
      default:
        return "text-violet-600 dark:text-violet-400";
    }
  };

  return (
    <motion.div
      layout
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "flex items-center gap-3 px-4 py-3 border-b transition-colors",
        "hover:bg-[var(--bg-hover)]",
      )}
      exit={{ opacity: 0, height: 0 }}
      initial={{ opacity: 0, y: -10 }}
      style={{ borderColor: "var(--border-secondary)" }}
    >
      <div
        className={cn(
          "flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center",
          get_circle_bg(),
        )}
      >
        <ClockIcon className={cn("w-5 h-5", get_icon_color())} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1">
          <span
            className="text-sm font-medium truncate"
            style={{ color: "var(--text-primary)" }}
          >
            Scheduled email
          </span>
          <EmailTag
            icon={status_config.icon}
            label={status_config.label}
            size="default"
            variant={status_config.variant}
          />
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
            {format(scheduled_date, "MMM d, yyyy 'at' h:mm a")}
          </span>
          {email.status === "pending" && (
            <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
              ({time_until})
            </span>
          )}
        </div>
        {error && <div className="mt-1.5 text-xs text-red-500">{error}</div>}
      </div>

      {email.status === "pending" && (
        <div className="flex items-center gap-1 flex-shrink-0">
          <Button
            className="h-8 px-2.5 text-xs"
            disabled={is_sending_now || is_loading_content}
            size="sm"
            variant="ghost"
            onClick={handle_send_now}
          >
            {is_sending_now ? (
              <span className="flex items-center gap-1.5">
                <svg
                  className="w-3.5 h-3.5 animate-spin"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                >
                  <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
                  <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
                </svg>
              </span>
            ) : (
              <>
                <PaperAirplaneIcon className="w-3.5 h-3.5 mr-1" />
                Send now
              </>
            )}
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button className="h-8 w-8" size="icon" variant="ghost">
                <EllipsisVerticalIcon className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              style={{
                backgroundColor: "var(--bg-primary)",
                borderColor: "var(--border-primary)",
              }}
            >
              <DropdownMenuItem
                disabled={is_loading_content}
                onClick={handle_edit}
              >
                <PencilIcon className="w-4 h-4 mr-2" />
                {is_loading_content ? "Loading..." : "Edit & reschedule"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-red-500 focus:text-red-500"
                onClick={() => set_show_cancel_confirm(true)}
              >
                <XMarkIcon className="w-4 h-4 mr-2" />
                Cancel
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      <ConfirmationModal
        cancel_text="Keep Scheduled"
        confirm_text={is_cancelling ? "Cancelling..." : "Cancel Email"}
        is_open={show_cancel_confirm}
        message="Are you sure you want to cancel this scheduled email? This action cannot be undone."
        on_cancel={() => set_show_cancel_confirm(false)}
        on_confirm={handle_cancel}
        title="Cancel Scheduled Email"
        variant="danger"
      />
    </motion.div>
  );
}

interface ScheduledEmailsListProps {
  emails: ScheduledEmail[];
  is_loading: boolean;
  on_refresh?: () => void;
}

export function ScheduledEmailsList({
  emails,
  is_loading,
  on_refresh,
}: ScheduledEmailsListProps) {
  if (is_loading) {
    return (
      <div className="flex flex-col items-center justify-center h-48">
        <svg
          className="w-8 h-8 animate-spin"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          style={{ color: "var(--text-muted)" }}
          viewBox="0 0 24 24"
        >
          <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
          <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
        </svg>
        <span className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>
          Loading scheduled emails...
        </span>
      </div>
    );
  }

  if (emails.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-48 px-4">
        <div className="mb-3 opacity-20">
          <ClockIcon
            className="w-12 h-12"
            style={{ color: "var(--text-primary)" }}
          />
        </div>
        <p
          className="text-sm font-medium"
          style={{ color: "var(--text-muted)" }}
        >
          No scheduled emails
        </p>
        <p className="text-xs mt-1" style={{ color: "var(--text-tertiary)" }}>
          Schedule an email to send later
        </p>
      </div>
    );
  }

  return (
    <div
      className="divide-y"
      style={{ borderColor: "var(--border-secondary)" }}
    >
      <AnimatePresence mode="popLayout">
        {emails.map((email) => (
          <ScheduledEmailCard
            key={email.id}
            email={email}
            on_cancelled={on_refresh}
            on_sent={on_refresh}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}
