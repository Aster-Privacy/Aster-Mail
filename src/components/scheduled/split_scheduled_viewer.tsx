import { useState, useCallback } from "react";
import {
  XMarkIcon,
  PaperAirplaneIcon,
  PencilIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";

import { EmailTag } from "@/components/ui/email_tag";
import { ProfileAvatar } from "@/components/ui/profile_avatar";
import { ConfirmationModal } from "@/components/modals/confirmation_modal";
import {
  cancel_scheduled_email,
  send_scheduled_now,
  get_scheduled_email,
  type ScheduledEmailWithContent,
} from "@/services/api/scheduled";
import { use_auth } from "@/contexts/auth_context";
import { show_action_toast } from "@/components/toast/action_toast";
import { show_toast } from "@/components/toast/simple_toast";
import {
  sanitize_html,
  is_html_content,
  plain_text_to_html,
} from "@/lib/html_sanitizer";
import { get_email_username } from "@/lib/utils";

interface ScheduledData {
  id: string;
  to_recipients: string[];
  cc_recipients: string[];
  bcc_recipients: string[];
  subject: string;
  body: string;
  scheduled_at: string;
}

interface SplitScheduledViewerProps {
  scheduled_data: ScheduledData;
  on_close: () => void;
  on_edit?: (email: ScheduledEmailWithContent) => void;
}

function format_scheduled_time(iso_string: string): string {
  const date = new Date(iso_string);
  const now = new Date();
  const diff_ms = date.getTime() - now.getTime();
  const diff_hours = diff_ms / (1000 * 60 * 60);

  if (diff_hours < 0) {
    return "Sending soon...";
  }

  if (diff_hours < 1) {
    const mins = Math.round(diff_hours * 60);

    return `In ${mins} minute${mins !== 1 ? "s" : ""}`;
  }

  if (diff_hours < 24) {
    return date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return date.toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function format_full_date(iso_string: string): string {
  const date = new Date(iso_string);

  return date.toLocaleDateString([], {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function SplitScheduledViewer({
  scheduled_data,
  on_close,
  on_edit,
}: SplitScheduledViewerProps): React.ReactElement {
  const { vault } = use_auth();
  const [show_cancel_confirm, set_show_cancel_confirm] = useState(false);
  const [is_cancelling, set_is_cancelling] = useState(false);
  const [is_sending_now, set_is_sending_now] = useState(false);
  const [is_loading_content, set_is_loading_content] = useState(false);

  const copy_to_clipboard = useCallback(async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      show_toast(`${label} copied`, "success");
    } catch {
      const textarea = document.createElement("textarea");

      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      show_toast(`${label} copied`, "success");
    }
  }, []);

  const handle_cancel = useCallback(async () => {
    set_is_cancelling(true);

    const response = await cancel_scheduled_email(scheduled_data.id);

    set_is_cancelling(false);
    set_show_cancel_confirm(false);

    if (!response.error) {
      show_action_toast({
        message: "Scheduled email cancelled",
        action_type: "trash",
        email_ids: [scheduled_data.id],
      });
      window.dispatchEvent(new CustomEvent("astermail:mail-changed"));
      on_close();
    }
  }, [scheduled_data.id, on_close]);

  const handle_send_now = useCallback(async () => {
    set_is_sending_now(true);

    const response = await send_scheduled_now(scheduled_data.id);

    set_is_sending_now(false);

    if (!response.error) {
      show_toast("Email sent successfully", "success");
      window.dispatchEvent(new CustomEvent("astermail:mail-changed"));
      on_close();
    }
  }, [scheduled_data.id, on_close]);

  const handle_edit = useCallback(async () => {
    if (!vault || !on_edit) return;

    set_is_loading_content(true);

    const response = await get_scheduled_email(scheduled_data.id, vault);

    set_is_loading_content(false);

    if (!response.error && response.data) {
      on_edit(response.data);
      on_close();
    }
  }, [scheduled_data.id, vault, on_edit, on_close]);

  const primary_recipient = scheduled_data.to_recipients[0] || "";
  const recipient_name = get_email_username(primary_recipient) || "Recipient";

  return (
    <div
      className="flex flex-col h-full"
      style={{ backgroundColor: "var(--bg-primary)" }}
    >
      <div
        className="flex-1 overflow-y-auto"
        style={{ scrollbarGutter: "stable" }}
      >
        <div className="p-6">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1 mb-1">
                <EmailTag
                  label="Scheduled"
                  size="default"
                  variant="scheduled"
                />
                <EmailTag
                  icon="clock"
                  label={format_scheduled_time(scheduled_data.scheduled_at)}
                  size="default"
                  variant="scheduled"
                />
              </div>
              <button
                className="text-xl font-semibold cursor-pointer hover:opacity-80 transition-opacity text-left break-words min-w-0"
                style={{ color: "var(--text-primary)" }}
                type="button"
                onClick={() =>
                  copy_to_clipboard(
                    scheduled_data.subject || "(No subject)",
                    "Subject",
                  )
                }
              >
                {scheduled_data.subject || "(No subject)"}
              </button>
            </div>
            <button
              className="p-1.5 rounded-md transition-colors hover:bg-[var(--bg-hover)] flex-shrink-0 -mt-1 -mr-1"
              style={{ color: "var(--text-muted)" }}
              onClick={on_close}
            >
              <XMarkIcon className="w-5 h-5" />
            </button>
          </div>

          <div className="flex items-start gap-3 mb-6">
            <ProfileAvatar
              clickable
              email={primary_recipient}
              name={recipient_name}
              size="lg"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <span
                    className="font-medium text-sm"
                    style={{ color: "var(--text-primary)" }}
                  >
                    To: {scheduled_data.to_recipients.join(", ")}
                  </span>
                </div>
              </div>
              {scheduled_data.cc_recipients.length > 0 && (
                <p
                  className="text-xs mt-0.5"
                  style={{ color: "var(--text-muted)" }}
                >
                  Cc: {scheduled_data.cc_recipients.join(", ")}
                </p>
              )}
              {scheduled_data.bcc_recipients.length > 0 && (
                <p
                  className="text-xs mt-0.5"
                  style={{ color: "var(--text-muted)" }}
                >
                  Bcc: {scheduled_data.bcc_recipients.join(", ")}
                </p>
              )}
              <p
                className="text-xs mt-1"
                style={{ color: "var(--text-muted)" }}
              >
                Scheduled for {format_full_date(scheduled_data.scheduled_at)}
              </p>
            </div>
          </div>

          <div
            dangerouslySetInnerHTML={{
              __html: is_html_content(scheduled_data.body)
                ? sanitize_html(scheduled_data.body)
                : plain_text_to_html(scheduled_data.body),
            }}
            className="email-body-content prose prose-sm max-w-none"
          />
        </div>
      </div>

      <div
        className="flex items-center gap-2 px-4 py-3 border-t"
        style={{ borderColor: "var(--border-primary)" }}
      >
        <button
          className="flex-1 h-10 flex items-center justify-center gap-2 rounded-lg text-sm font-semibold text-white transition-all duration-150 hover:brightness-110 active:scale-[0.98] active:brightness-95 disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={is_sending_now}
          style={{
            background:
              "linear-gradient(to bottom, #6b8aff 0%, #4f6ef7 50%, #3b5ae8 100%)",
            border: "1px solid rgba(255, 255, 255, 0.15)",
            borderBottom: "1px solid rgba(0, 0, 0, 0.15)",
            boxShadow:
              "0 1px 3px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.1)",
          }}
          onClick={handle_send_now}
        >
          <PaperAirplaneIcon className="w-4 h-4" />
          {is_sending_now ? "Sending..." : "Send now"}
        </button>
        {on_edit && (
          <button
            className="flex-1 h-10 flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition-all duration-150 hover:bg-[var(--bg-hover)] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={is_loading_content}
            style={{
              background: "var(--bg-secondary)",
              color: "var(--text-primary)",
              boxShadow:
                "0 1px 2px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.06), inset 0 0 0 1px var(--border-primary)",
            }}
            onClick={handle_edit}
          >
            <PencilIcon className="w-4 h-4" />
            {is_loading_content ? "Loading..." : "Edit"}
          </button>
        )}
        <button
          className="h-10 w-10 flex items-center justify-center rounded-lg transition-colors hover:bg-[var(--bg-hover)] disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={is_cancelling}
          onClick={() => set_show_cancel_confirm(true)}
        >
          <TrashIcon className="w-4 h-4 text-red-500" />
        </button>
      </div>

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
    </div>
  );
}
