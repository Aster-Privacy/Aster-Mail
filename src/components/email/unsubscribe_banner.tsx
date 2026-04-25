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
// GNU Affero General Public License for more details.
//
// You should have received a copy of the AGPLv3
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
import type { UnsubscribeInfo } from "@/types/email";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { EnvelopeIcon, XMarkIcon } from "@heroicons/react/24/outline";

import { show_action_toast } from "@/components/toast/action_toast";
import {
  get_unsubscribe_display_text,
  get_sender_domain,
  execute_unsubscribe,
} from "@/utils/unsubscribe_detector";
import { track_subscription } from "@/services/api/subscriptions";
import { persist_unsubscribe } from "@/hooks/use_unsubscribed_senders";
import { use_should_reduce_motion } from "@/provider";
import { use_i18n } from "@/lib/i18n/context";
import { use_preferences } from "@/contexts/preferences_context";

interface UnsubscribeBannerProps {
  unsubscribe_info: UnsubscribeInfo;
  sender_email: string;
  sender_name: string;
  on_unsubscribed?: () => void;
}

export function UnsubscribeBanner({
  unsubscribe_info,
  sender_email,
  sender_name,
  on_unsubscribed,
}: UnsubscribeBannerProps) {
  const { t } = use_i18n();
  const { preferences } = use_preferences();
  const reduce_motion = use_should_reduce_motion();
  const [is_dismissed, set_is_dismissed] = useState(false);
  const tracked_ref = useRef(false);
  const pending_timeout_ref = useRef<NodeJS.Timeout | null>(null);
  const cancelled_ref = useRef(false);

  useEffect(() => {
    if (!unsubscribe_info.has_unsubscribe || tracked_ref.current) return;

    tracked_ref.current = true;
    let is_mounted = true;

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
    };
  }, [sender_email, sender_name, unsubscribe_info]);

  useEffect(() => {
    return () => {
      if (pending_timeout_ref.current) {
        clearTimeout(pending_timeout_ref.current);
      }
    };
  }, []);

  const handle_unsubscribe = useCallback(async () => {
    cancelled_ref.current = false;
    set_is_dismissed(true);

    const delay_seconds = preferences.undo_send_seconds ?? 10;
    const delay_ms = delay_seconds * 1000;

    show_action_toast({
      message: t("mail.successfully_unsubscribed"),
      action_type: "not_spam",
      email_ids: [],
      duration_ms: delay_ms,
      on_undo: async () => {
        cancelled_ref.current = true;
        if (pending_timeout_ref.current) {
          clearTimeout(pending_timeout_ref.current);
          pending_timeout_ref.current = null;
        }
        set_is_dismissed(false);
      },
    });

    pending_timeout_ref.current = setTimeout(async () => {
      pending_timeout_ref.current = null;
      if (cancelled_ref.current) return;

      try {
        const result = await execute_unsubscribe(unsubscribe_info);
        if (result === "api") {
          persist_unsubscribe(sender_email, sender_name, {
            unsubscribe_link: unsubscribe_info.unsubscribe_link,
            list_unsubscribe_header: unsubscribe_info.list_unsubscribe_header,
          }, "auto");
          on_unsubscribed?.();
        } else {
          const url = unsubscribe_info.unsubscribe_link || unsubscribe_info.unsubscribe_mailto;
          show_action_toast({
            message: t("mail.unsubscribe_manual_required"),
            action_type: "not_spam",
            email_ids: [],
            duration_ms: 15000,
            action_label: t("mail.open_unsubscribe_page"),
            on_undo: async () => {
              if (url) window.open(url, "_blank", "noopener,noreferrer");
            },
          });
        }
      } catch {
        show_action_toast({
          message: t("mail.unsubscribe_failed"),
          action_type: "not_spam",
          email_ids: [],
        });
      }
    }, delay_ms);
  }, [unsubscribe_info, preferences.undo_send_seconds, on_unsubscribed, t]);

  if (!unsubscribe_info.has_unsubscribe || is_dismissed) {
    return null;
  }

  const domain = get_sender_domain(sender_email);
  const display_text = get_unsubscribe_display_text(unsubscribe_info, t);

  return (
    <AnimatePresence>
      <motion.div
        animate={{ opacity: 1, y: 0, height: "auto" }}
        className="overflow-hidden"
        exit={{ opacity: 0, y: -10, height: 0 }}
        initial={reduce_motion ? false : { opacity: 0, y: -10, height: 0 }}
        transition={{ duration: reduce_motion ? 0 : 0.2 }}
      >
        <div
          className="mx-6 mt-4 p-4 rounded-lg border flex items-center gap-3"
          style={{
            backgroundColor: "var(--bg-secondary)",
            borderColor: "var(--border-secondary)",
          }}
        >
          <div
            className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center"
            style={{ backgroundColor: "rgba(59, 130, 246, 0.1)" }}
          >
            <EnvelopeIcon className="w-5 h-5 text-brand" />
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-[14px] font-medium text-txt-primary">
              {display_text}
            </p>
            <p className="text-[13px] mt-0.5 text-txt-secondary">
              {t("mail.stop_receiving_from")}{" "}
              <span className="font-medium">{domain}</span>
            </p>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              className="rounded-md px-3 py-1 text-sm font-medium transition-colors bg-brand text-white"
              type="button"
              onClick={handle_unsubscribe}
            >
              {t("mail.unsubscribe")}
            </button>
            <button
              className="p-1.5 rounded-md transition-colors hover:bg-black/5 dark:hover:bg-white/5 text-txt-muted"
              type="button"
              onClick={() => set_is_dismissed(true)}
            >
              <XMarkIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
