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
import type { DraftClickData } from "@/components/email/inbox/inbox_types";
import type { EncryptedVault } from "@/services/crypto/key_manager";

import {
  cancel_scheduled_email,
  type ScheduledEmailWithContent,
} from "@/services/api/scheduled";
import { create_draft, delete_draft } from "@/services/api/multi_drafts";
import {
  emit_scheduled_cancelled,
  emit_scheduled_changed,
} from "@/hooks/mail_events";
import { invalidate_mail_stats } from "@/hooks/use_mail_stats";

export type ScheduledToDraftResult =
  { data: DraftClickData } | { error: string | undefined };

export async function scheduled_to_draft(
  email: ScheduledEmailWithContent,
  vault: EncryptedVault,
): Promise<ScheduledToDraftResult> {
  const { content } = email;
  const is_reply = Boolean(
    content.in_reply_to || content.thread_id || content.reply_to_id,
  );
  const draft_type = is_reply ? "reply" : "new";
  const draft_content = {
    to_recipients: content.to_recipients,
    cc_recipients: content.cc_recipients,
    bcc_recipients: content.bcc_recipients,
    subject: content.subject,
    message:
      content.is_plain_text && content.plain_body !== undefined
        ? content.plain_body
        : content.body,
    from_email: content.from?.email,
    ...(content.is_plain_text ? { is_plain_text: true } : {}),
  };

  const created = await create_draft(
    draft_content,
    vault,
    draft_type,
    content.reply_to_id,
    undefined,
    content.thread_id,
  );

  if (created.error || !created.data) {
    return { error: created.error };
  }

  const cancelled = await cancel_scheduled_email(email.id);

  if (cancelled.error || !cancelled.data?.success) {
    await delete_draft(created.data.id).catch(() => undefined);

    return { error: cancelled.error };
  }

  invalidate_mail_stats();
  emit_scheduled_cancelled({ email_id: email.id });
  emit_scheduled_changed({ action: "cancelled", email_id: email.id });

  return {
    data: {
      id: created.data.id,
      version: created.data.version,
      draft_type,
      thread_token: content.thread_id,
      reply_to_id: content.reply_to_id,
      rfc_message_id: content.in_reply_to,
      updated_at: created.data.updated_at,
      ...draft_content,
    },
  };
}
