import type { UnsubscribeInfo } from "@/types/email";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  EnvelopeIcon,
  ArrowTopRightOnSquareIcon,
  ArrowPathIcon,
  CheckIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";

import { Button } from "@/components/ui/button";
import {
  get_unsubscribe_display_text,
  get_sender_domain,
} from "@/utils/unsubscribe_detector";
import {
  unsubscribe,
  list_subscriptions,
  track_subscription,
} from "@/services/api/subscriptions";

interface UnsubscribeBannerProps {
  unsubscribe_info: UnsubscribeInfo;
  sender_email: string;
  sender_name: string;
  on_unsubscribed?: () => void;
}

type UnsubscribeState = "idle" | "loading" | "success" | "error";

export function UnsubscribeBanner({
  unsubscribe_info,
  sender_email,
  sender_name,
  on_unsubscribed,
}: UnsubscribeBannerProps) {
  const [state, set_state] = useState<UnsubscribeState>("idle");
  const [error_message, set_error_message] = useState<string | null>(null);
  const [is_dismissed, set_is_dismissed] = useState(false);
  const tracked_ref = useRef(false);

  useEffect(() => {
    if (!unsubscribe_info.has_unsubscribe || tracked_ref.current) return;

    tracked_ref.current = true;
    let is_mounted = true;
    const abort_controller = new AbortController();

    track_subscription({
      sender_email,
      sender_name,
      unsubscribe_link: unsubscribe_info.unsubscribe_link,
      list_unsubscribe_header: unsubscribe_info.list_unsubscribe_header,
    }).catch(() => {
      if (is_mounted) {
        tracked_ref.current = false;
      }
    });

    return () => {
      is_mounted = false;
      abort_controller.abort();
    };
  }, [sender_email, sender_name, unsubscribe_info]);

  if (!unsubscribe_info.has_unsubscribe || is_dismissed) {
    return null;
  }

  const domain = get_sender_domain(sender_email);
  const display_text = get_unsubscribe_display_text(unsubscribe_info);

  const handle_unsubscribe = async () => {
    set_state("loading");
    set_error_message(null);

    try {
      const subs_response = await list_subscriptions({
        search: sender_email,
        limit: 1,
      });

      if (subs_response.data?.subscriptions.length) {
        const subscription = subs_response.data.subscriptions[0];
        const result = await unsubscribe(
          subscription.id,
          unsubscribe_info.method === "one-click" ? "list_unsubscribe" : "auto",
        );

        if (result.error) {
          throw new Error(result.error);
        }

        set_state("success");
        on_unsubscribed?.();
      } else {
        if (unsubscribe_info.unsubscribe_link) {
          window.open(
            unsubscribe_info.unsubscribe_link,
            "_blank",
            "noopener,noreferrer",
          );
          set_state("success");
          on_unsubscribed?.();
        } else if (unsubscribe_info.unsubscribe_mailto) {
          window.location.href = `mailto:${unsubscribe_info.unsubscribe_mailto}?subject=Unsubscribe`;
          set_state("success");
          on_unsubscribed?.();
        } else {
          throw new Error("No unsubscribe method available");
        }
      }
    } catch (err) {
      set_state("error");
      set_error_message(
        err instanceof Error ? err.message : "Failed to unsubscribe",
      );
    }
  };

  const handle_open_link = () => {
    if (unsubscribe_info.unsubscribe_link) {
      window.open(
        unsubscribe_info.unsubscribe_link,
        "_blank",
        "noopener,noreferrer",
      );
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        animate={{ opacity: 1, y: 0, height: "auto" }}
        className="overflow-hidden"
        exit={{ opacity: 0, y: -10, height: 0 }}
        initial={{ opacity: 0, y: -10, height: 0 }}
        transition={{ duration: 0.2 }}
      >
        <div
          className="mx-6 mt-4 p-4 rounded-lg border flex items-start gap-3"
          style={{
            backgroundColor:
              state === "success"
                ? "var(--bg-success, rgba(34, 197, 94, 0.1))"
                : state === "error"
                  ? "var(--bg-error, rgba(239, 68, 68, 0.1))"
                  : "var(--bg-secondary)",
            borderColor:
              state === "success"
                ? "var(--border-success, rgba(34, 197, 94, 0.3))"
                : state === "error"
                  ? "var(--border-error, rgba(239, 68, 68, 0.3))"
                  : "var(--border-secondary)",
          }}
        >
          <div
            className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center"
            style={{
              backgroundColor:
                state === "success"
                  ? "rgba(34, 197, 94, 0.2)"
                  : state === "error"
                    ? "rgba(239, 68, 68, 0.2)"
                    : "rgba(139, 92, 246, 0.1)",
            }}
          >
            {state === "success" ? (
              <CheckIcon className="w-5 h-5 text-green-500" />
            ) : state === "error" ? (
              <XMarkIcon className="w-5 h-5 text-red-500" />
            ) : (
              <EnvelopeIcon
                className="w-5 h-5"
                style={{ color: "rgb(139, 92, 246)" }}
              />
            )}
          </div>

          <div className="flex-1 min-w-0">
            {state === "success" ? (
              <>
                <p
                  className="text-[14px] font-medium"
                  style={{ color: "var(--text-primary)" }}
                >
                  Successfully unsubscribed
                </p>
                <p
                  className="text-[13px] mt-0.5"
                  style={{ color: "var(--text-secondary)" }}
                >
                  You won&apos;t receive emails from {sender_name || domain}{" "}
                  anymore
                </p>
              </>
            ) : state === "error" ? (
              <>
                <p
                  className="text-[14px] font-medium"
                  style={{ color: "var(--text-primary)" }}
                >
                  Unsubscribe failed
                </p>
                <p
                  className="text-[13px] mt-0.5"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {error_message || "Please try again or use the link below"}
                </p>
              </>
            ) : (
              <>
                <p
                  className="text-[14px] font-medium"
                  style={{ color: "var(--text-primary)" }}
                >
                  {display_text}
                </p>
                <p
                  className="text-[13px] mt-0.5"
                  style={{ color: "var(--text-secondary)" }}
                >
                  Stop receiving emails from{" "}
                  <span className="font-medium">{domain}</span>
                </p>
              </>
            )}
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {state === "idle" && (
              <>
                {unsubscribe_info.method === "one-click" && (
                  <Button
                    className="h-8 px-3 text-[13px] font-medium"
                    size="sm"
                    onClick={handle_unsubscribe}
                  >
                    Unsubscribe
                  </Button>
                )}
                {unsubscribe_info.method === "link" && (
                  <Button
                    className="h-8 px-3 text-[13px] font-medium gap-1.5"
                    size="sm"
                    variant="outline"
                    onClick={handle_open_link}
                  >
                    <ArrowTopRightOnSquareIcon className="w-3.5 h-3.5" />
                    Unsubscribe
                  </Button>
                )}
                {unsubscribe_info.method === "mailto" && (
                  <Button
                    className="h-8 px-3 text-[13px] font-medium"
                    size="sm"
                    variant="outline"
                    onClick={handle_unsubscribe}
                  >
                    Send Email
                  </Button>
                )}
                <button
                  className="p-1.5 rounded-md transition-colors hover:bg-black/5 dark:hover:bg-white/5"
                  style={{ color: "var(--text-muted)" }}
                  onClick={() => set_is_dismissed(true)}
                >
                  <XMarkIcon className="w-4 h-4" />
                </button>
              </>
            )}
            {state === "loading" && (
              <ArrowPathIcon
                className="w-5 h-5 animate-spin"
                style={{ color: "var(--text-muted)" }}
              />
            )}
            {(state === "success" || state === "error") && (
              <button
                className="p-1.5 rounded-md transition-colors hover:bg-black/5 dark:hover:bg-white/5"
                style={{ color: "var(--text-muted)" }}
                onClick={() => set_is_dismissed(true)}
              >
                <XMarkIcon className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
