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
import type { Email } from "@/types/email";

import { useState, useCallback, useMemo } from "react";
import { motion } from "framer-motion";

import { open_external } from "@/utils/open_link";
import { EmailViewerHeader } from "@/components/email/email_viewer_header";
import { EmailViewerContent } from "@/components/email/email_viewer_content";
import {
  ErrorBoundary,
  EmailErrorFallback,
} from "@/components/ui/error_boundary";
import { update_item_metadata } from "@/services/crypto/mail_metadata";
import { batch_archive, batch_unarchive } from "@/services/api/archive";
import { report_spam_sender, remove_spam_sender } from "@/services/api/mail";
import { show_action_toast } from "@/components/toast/action_toast";
import { detect_unsubscribe_info } from "@/utils/unsubscribe_detector";
import { emit_mail_changed, emit_mail_soft_refresh } from "@/hooks/mail_events";
import { use_should_reduce_motion } from "@/provider";
import { use_i18n } from "@/lib/i18n/context";

export function EmailViewer({
  email,
  on_close,
}: {
  email: Email;
  on_close: () => void;
}) {
  const { t } = use_i18n();
  const reduce_motion = use_should_reduce_motion();
  const [is_archive_loading, set_is_archive_loading] = useState(false);
  const [is_spam_loading, set_is_spam_loading] = useState(false);
  const [is_trash_loading, set_is_trash_loading] = useState(false);

  const is_in_trash = email.is_trashed || false;

  const unsubscribe_info = useMemo(() => {
    if (email.unsubscribe_info) {
      return email.unsubscribe_info;
    }

    return detect_unsubscribe_info(
      email.html_content,
      email.body || email.preview,
    );
  }, [email.unsubscribe_info, email.html_content, email.body, email.preview]);

  const handle_unsubscribe = useCallback(() => {
    if (unsubscribe_info.unsubscribe_link) {
      const link = unsubscribe_info.unsubscribe_link.trim().toLowerCase();

      if (!link.startsWith("https://") && !link.startsWith("http://")) {
        return;
      }
      try {
        const url = new URL(unsubscribe_info.unsubscribe_link);

        if (url.protocol !== "https:" && url.protocol !== "http:") {
          return;
        }
        open_external(unsubscribe_info.unsubscribe_link);
      } catch (error) {
        if (import.meta.env.DEV) console.error(error);

        return;
      }
    } else if (unsubscribe_info.unsubscribe_mailto) {
      const mailto = unsubscribe_info.unsubscribe_mailto.trim();

      if (
        mailto.includes("<") ||
        mailto.includes(">") ||
        mailto.includes("'") ||
        mailto.includes('"')
      ) {
        return;
      }
      window.location.href = `mailto:${encodeURIComponent(mailto)}?subject=Unsubscribe`;
    }
  }, [unsubscribe_info]);

  const handle_archive = useCallback(async () => {
    if (is_archive_loading) return;
    set_is_archive_loading(true);
    const result = await batch_archive({ ids: [email.id], tier: "hot" });

    set_is_archive_loading(false);
    if (result.data?.success) {
      emit_mail_changed();
      show_action_toast({
        message: t("common.conversation_archived"),
        action_type: "archive",
        email_ids: [email.id],
        on_undo: async () => {
          const result = await batch_unarchive({ ids: [email.id] });

          if (result.error) {
            throw new Error(result.error);
          }
          emit_mail_soft_refresh();
        },
      });
      on_close();
    }
  }, [email.id, is_archive_loading, on_close, t]);

  const handle_spam = useCallback(async () => {
    if (is_spam_loading) return;
    set_is_spam_loading(true);
    const result = await update_item_metadata(
      email.id,
      {},
      { is_spam: true, is_trashed: false },
    );

    set_is_spam_loading(false);
    if (result.success) {
      const sender = email.sender?.email;

      if (sender) {
        report_spam_sender(sender).catch(() => {});
      }
      emit_mail_changed();
      show_action_toast({
        message: t("common.conversation_marked_as_spam_toast"),
        action_type: "spam",
        email_ids: [email.id],
        on_undo: async () => {
          const undo_result = await update_item_metadata(
            email.id,
            {},
            { is_spam: false },
          );

          if (!undo_result.success) {
            throw new Error(t("common.failed_to_undo_spam"));
          }
          if (sender) {
            remove_spam_sender(sender).catch(() => {});
          }
          emit_mail_soft_refresh();
        },
      });
      on_close();
    }
  }, [email.id, email.sender?.email, is_spam_loading, on_close, t]);

  const handle_trash = useCallback(async () => {
    if (is_trash_loading) return;
    set_is_trash_loading(true);
    const result = await update_item_metadata(
      email.id,
      {},
      { is_trashed: true },
    );

    set_is_trash_loading(false);
    if (result.success) {
      emit_mail_changed();
      show_action_toast({
        message: t("common.conversation_moved_to_trash_toast"),
        action_type: "trash",
        email_ids: [email.id],
        on_undo: async () => {
          const undo_result = await update_item_metadata(
            email.id,
            {},
            { is_trashed: false },
          );

          if (!undo_result.success) {
            throw new Error(t("common.failed_to_undo_trash"));
          }
          emit_mail_soft_refresh();
        },
      });
      on_close();
    }
  }, [email.id, is_trash_loading, on_close, t]);

  return (
    <ErrorBoundary fallback={<EmailErrorFallback on_retry={on_close} />}>
      <motion.div
        animate={{ opacity: 1, x: 0 }}
        className="flex flex-col h-full"
        exit={{ opacity: 0, x: 20 }}
        initial={reduce_motion ? false : { opacity: 0, x: 20 }}
        transition={{ duration: reduce_motion ? 0 : 0.3 }}
      >
        <EmailViewerHeader
          is_archive_loading={is_archive_loading}
          is_in_trash={is_in_trash}
          is_spam_loading={is_spam_loading}
          is_trash_loading={is_trash_loading}
          on_archive={handle_archive}
          on_close={on_close}
          on_spam={handle_spam}
          on_trash={handle_trash}
          on_unsubscribe={handle_unsubscribe}
          unsubscribe_info={unsubscribe_info}
        />
        <EmailViewerContent email={email} />
      </motion.div>
    </ErrorBoundary>
  );
}
