import { useEffect } from "react";

import { use_auth } from "@/contexts/auth_context";
import { use_preferences } from "@/contexts/preferences_context";
import { sync_client } from "@/services/sync_client";
import { emit_email_received, emit_mail_changed } from "@/hooks/mail_events";
import {
  notify_new_email,
  notify_reply,
  notify_mention,
} from "@/services/notification_service";

interface NewEmailMessage {
  type: string;
  email_id?: string;
  sender?: string;
  subject?: string;
  is_reply?: boolean;
  has_mention?: boolean;
}

export function EmailNotificationManager() {
  const { is_authenticated } = use_auth();
  const { preferences } = use_preferences();

  useEffect(() => {
    if (!is_authenticated) return;

    const unsubscribe = sync_client.register_handler(
      "new_email",
      (data: NewEmailMessage) => {
        if (data.email_id && data.sender && data.subject) {
          if (data.has_mention) {
            notify_mention(
              data.sender,
              data.subject,
              data.email_id,
              preferences,
            );
          } else if (data.is_reply) {
            notify_reply(data.sender, data.subject, data.email_id, preferences);
          } else {
            notify_new_email(
              data.sender,
              data.subject,
              data.email_id,
              preferences,
            );
          }

          emit_email_received({
            email_id: data.email_id,
            sender: data.sender,
            subject: data.subject,
            is_reply: data.is_reply,
            has_mention: data.has_mention,
          });

          emit_mail_changed();
        }
      },
    );

    return unsubscribe;
  }, [is_authenticated, preferences]);

  return null;
}
