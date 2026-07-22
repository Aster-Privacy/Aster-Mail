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
import type { DecryptedThreadMessage } from "@/types/thread";
import type { QueuedEmailInternal } from "./send_queue_types";

import { get_current_account } from "./account_manager";
import {
  encrypt_for_recipients,
  create_sent_envelope,
} from "./send_queue_encryption";
import { react_to_message } from "./api/reactions";
import { get_cached_preferences } from "./api/preferences";
import { en } from "@/lib/i18n/translations/en";

export interface ReactionResult {
  success: boolean;
  error?: string;
}

function resolve_reaction_recipient(
  message: DecryptedThreadMessage,
  current_user_email: string,
): string | null {
  const sender_is_self =
    message.sender_email.toLowerCase().trim() ===
    current_user_email.toLowerCase().trim();

  if (!sender_is_self) {
    return message.sender_email;
  }

  return message.to_recipients?.[0]?.email ?? null;
}

export async function send_reaction(
  message: DecryptedThreadMessage,
  emoji: string,
  thread_token?: string,
): Promise<ReactionResult> {
  if (get_cached_preferences()?.reactions_enabled === false) {
    return { success: false, error: en.errors.reactions_disabled };
  }

  const current_account = await get_current_account();

  if (!current_account) {
    return { success: false, error: en.errors.no_active_account };
  }

  const sender_email = current_account.user.email;
  const recipient = resolve_reaction_recipient(message, sender_email);

  if (!recipient) {
    return { success: false, error: en.errors.no_recipients };
  }

  try {
    const body = JSON.stringify({ aster_reaction: true, emoji });

    const encryption_result = await encrypt_for_recipients(
      body,
      [recipient],
      sender_email,
    );

    const queued_email: QueuedEmailInternal = {
      id: "",
      scheduled_time: 0,
      timeout_id: 0,
      callbacks: { on_complete: () => {}, on_cancel: () => {} },
      to: [recipient],
      subject: "",
      body,
    };

    const envelope_data = await create_sent_envelope(queued_email, sender_email);

    const response = await react_to_message({
      target_message_id: message.id,
      message_group_id: message.message_group_id,
      thread_token,
      to: [recipient],
      body: encryption_result.encrypted_body,
      is_e2e_encrypted: encryption_result.is_encrypted,
      encrypted_envelope: envelope_data.encrypted_envelope,
      envelope_nonce: envelope_data.envelope_nonce,
      folder_token: envelope_data.folder_token,
      sender_email,
    });

    if (response.error || !response.data?.success) {
      return {
        success: false,
        error: response.error ?? en.errors.failed_send_reaction,
      };
    }

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : en.errors.failed_send_reaction,
    };
  }
}
