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
import { encrypt_for_recipients, create_sent_envelope } from "./send_queue_encryption";
import { send_simple_email } from "./api/send";
import { get_current_account } from "./account_manager";
import type { QueuedEmailInternal } from "./send_queue_types";

export interface SendReactionParams {
  thread_token: string;
  target_message_id: string;
  emoji: string;
  recipient_emails: string[];
  sender_email?: string;
}

async function send_reaction_message(
  type: "reaction" | "reaction_remove",
  params: SendReactionParams,
): Promise<void> {
  const sender_email =
    params.sender_email ?? (await get_current_account())?.user?.email;

  if (!sender_email) {
    return;
  }

  const reaction_body = JSON.stringify({
    type,
    target_message_id: params.target_message_id,
    emoji: params.emoji,
  });

  const { encrypted_body, is_encrypted } = await encrypt_for_recipients(
    reaction_body,
    params.recipient_emails,
    sender_email,
  );

  const fake_email: QueuedEmailInternal = {
    id: "",
    scheduled_time: 0,
    timeout_id: 0,
    callbacks: { on_complete: () => {}, on_cancel: () => {} },
    to: params.recipient_emails,
    subject: "",
    body: reaction_body,
  };

  const envelope_data = await create_sent_envelope(fake_email, sender_email);

  await send_simple_email({
    to: params.recipient_emails,
    subject: "",
    body: is_encrypted ? encrypted_body : reaction_body,
    is_e2e_encrypted: is_encrypted,
    encrypted_envelope: envelope_data.encrypted_envelope,
    envelope_nonce: envelope_data.envelope_nonce,
    folder_token: envelope_data.folder_token,
    encrypted_metadata: envelope_data.encrypted_metadata,
    metadata_nonce: envelope_data.metadata_nonce,
    thread_token: params.thread_token,
    sender_email,
  });
}

export async function send_reaction(params: SendReactionParams): Promise<void> {
  return send_reaction_message("reaction", params);
}

export async function send_reaction_remove(
  params: SendReactionParams,
): Promise<void> {
  return send_reaction_message("reaction_remove", params);
}
