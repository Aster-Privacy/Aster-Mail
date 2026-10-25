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

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { EnvelopeIcon, XMarkIcon } from "@heroicons/react/24/outline";

import {
  get_unsubscribe_display_text,
  get_sender_domain,
} from "@/utils/unsubscribe_detector";
import { use_unsubscribed_senders } from "@/hooks/use_unsubscribed_senders";
import { use_unsubscribe_action } from "@/hooks/use_unsubscribe_action";
import { use_should_reduce_motion } from "@/provider";
import { use_i18n } from "@/lib/i18n/context";
import { safe_sender_name } from "@/lib/sender_trust_store";

interface UnsubscribeBannerProps {
  unsubscribe_info: UnsubscribeInfo;
  sender_email: string;
  sender_name: string;
  on_unsubscribed?: () => void;
}

export function UnsubscribeBanner({
  unsubscribe_info,
  sender_email,
  sender_name: claimed_name,
  on_unsubscribed,
}: UnsubscribeBannerProps) {
  const { t } = use_i18n();
  const sender_name = safe_sender_name(claimed_name, sender_email);
  const reduce_motion = use_should_reduce_motion();
  const { is_unsubscribed } = use_unsubscribed_senders();
  const [is_dismissed, set_is_dismissed] = useState(false);
  const { unsubscribe: handle_unsubscribe, is_pending } =
    use_unsubscribe_action({
      unsubscribe_info,
      sender_email,
      sender_name,
      on_unsubscribed,
    });

  if (
    !unsubscribe_info.has_unsubscribe ||
    is_dismissed ||
    is_pending ||
    is_unsubscribed(sender_email)
  ) {
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
          <EnvelopeIcon className="w-5 h-5 flex-shrink-0 text-txt-muted" />

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
              className="rounded-[var(--aster-radius-control)] px-3 py-1 text-sm font-medium transition-colors bg-brand text-[var(--accent-fg,#ffffff)]"
              type="button"
              onClick={handle_unsubscribe}
            >
              {t("mail.unsubscribe")}
            </button>
            <button
              className="p-1.5 rounded-[14px] transition-colors hover:bg-[var(--aster-hover)] text-txt-muted"
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
