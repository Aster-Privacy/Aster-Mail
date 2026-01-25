import type { Email } from "@/types/email";

import { useState, useCallback, useMemo } from "react";
import { motion } from "framer-motion";

import { EmailViewerHeader } from "@/components/email_viewer_header";
import { EmailViewerContent } from "@/components/email_viewer_content";
import { EmailReplySection } from "@/components/email_reply_section";
import {
  ErrorBoundary,
  EmailErrorFallback,
} from "@/components/ui/error_boundary";
import { update_mail_item } from "@/services/api/mail";
import { batch_archive, batch_unarchive } from "@/services/api/archive";
import { show_action_toast } from "@/components/action_toast";
import { detect_unsubscribe_info } from "@/utils/unsubscribe_detector";
import { emit_mail_changed } from "@/hooks/mail_events";

const ASTER_FOOTER_TEXT = "\n\nSecured by Aster Mail - https://astermail.org";

export function EmailViewer({
  email,
  on_close,
}: {
  email: Email;
  on_close: () => void;
}) {
  const [show_reply_menu, set_show_reply_menu] = useState(false);
  const [reply_text, set_reply_text] = useState(ASTER_FOOTER_TEXT);
  const [is_archive_loading, set_is_archive_loading] = useState(false);
  const [is_spam_loading, set_is_spam_loading] = useState(false);
  const [is_trash_loading, set_is_trash_loading] = useState(false);

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
        window.open(
          unsubscribe_info.unsubscribe_link,
          "_blank",
          "noopener,noreferrer",
        );
      } catch {
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
        message: "Conversation archived",
        action_type: "archive",
        email_ids: [email.id],
        on_undo: async () => {
          const result = await batch_unarchive({ ids: [email.id] });

          if (result.error) {
            throw new Error(result.error);
          }
          emit_mail_changed();
        },
      });
      on_close();
    }
  }, [email.id, is_archive_loading, on_close]);

  const handle_spam = useCallback(async () => {
    if (is_spam_loading) return;
    set_is_spam_loading(true);
    const result = await update_mail_item(email.id, { is_spam: true });

    set_is_spam_loading(false);
    if (!result.error) {
      emit_mail_changed();
      show_action_toast({
        message: "Conversation marked as spam",
        action_type: "spam",
        email_ids: [email.id],
        on_undo: async () => {
          const result = await update_mail_item(email.id, { is_spam: false });

          if (result.error) {
            throw new Error(result.error);
          }
          emit_mail_changed();
        },
      });
      on_close();
    }
  }, [email.id, is_spam_loading, on_close]);

  const handle_trash = useCallback(async () => {
    if (is_trash_loading) return;
    set_is_trash_loading(true);
    const result = await update_mail_item(email.id, { is_trashed: true });

    set_is_trash_loading(false);
    if (!result.error) {
      emit_mail_changed();
      show_action_toast({
        message: "Conversation moved to trash",
        action_type: "trash",
        email_ids: [email.id],
        on_undo: async () => {
          const result = await update_mail_item(email.id, {
            is_trashed: false,
          });

          if (result.error) {
            throw new Error(result.error);
          }
          emit_mail_changed();
        },
      });
      on_close();
    }
  }, [email.id, is_trash_loading, on_close]);

  return (
    <ErrorBoundary fallback={<EmailErrorFallback on_retry={on_close} />}>
      <motion.div
        animate={{ opacity: 1, x: 0 }}
        className="flex flex-col h-full"
        exit={{ opacity: 0, x: 20 }}
        initial={{ opacity: 0, x: 20 }}
        transition={{ duration: 0.3 }}
      >
        <EmailViewerHeader
          is_archive_loading={is_archive_loading}
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
        <EmailReplySection
          email={email}
          reply_text={reply_text}
          set_reply_text={set_reply_text}
          set_show_reply_menu={set_show_reply_menu}
          show_reply_menu={show_reply_menu}
        />
      </motion.div>
    </ErrorBoundary>
  );
}
