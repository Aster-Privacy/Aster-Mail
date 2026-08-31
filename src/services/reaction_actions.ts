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

import { resolve_current_user } from "./current_identity";
import {
  encrypt_for_recipients,
  create_sent_envelope,
} from "./send_queue_encryption";
import { react_to_message, unreact_to_message } from "./api/reactions";
import {
  reaction_restriction,
  reaction_restriction_keys,
} from "./reaction_restrictions";
import { get_cached_preferences } from "./api/preferences";
import { is_internal_email } from "./api/keys";

import {
  get_cached_sender_identity_for_address,
  type CachedSenderIdentity,
} from "@/hooks/use_sender_aliases";
import { get_active_translations } from "@/lib/i18n/translations";

export interface ReactionResult {
  success: boolean;
  error?: string;
  own_reaction_mail_item_id?: string;
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

function resolve_reaction_sender_identity(
  message: DecryptedThreadMessage,
  primary_email: string,
): CachedSenderIdentity | undefined {
  const candidates = [
    ...(message.to_recipients ?? []),
    ...(message.cc_recipients ?? []),
  ];
  const primary = primary_email.trim().toLowerCase();
  let identity: CachedSenderIdentity | undefined;

  for (const candidate of candidates) {
    const email = candidate.email?.trim();

    if (!email) continue;
    if (email.toLowerCase() === primary) return undefined;
    if (identity) continue;

    identity = get_cached_sender_identity_for_address(email);
  }

  return identity;
}

export function is_own_reaction_address(email: string): boolean {
  return get_cached_sender_identity_for_address(email) !== undefined;
}

function resolve_reaction_in_reply_to(
  message: DecryptedThreadMessage,
): string | undefined {
  return message.raw_headers?.find((h) => h.name.toLowerCase() === "message-id")
    ?.value;
}

export async function remove_reaction(
  reaction_mail_item_id: string,
): Promise<ReactionResult> {
  try {
    const response = await unreact_to_message({ reaction_mail_item_id });

    if (response.error || !response.data?.success) {
      return {
        success: false,
        error: get_active_translations().errors.failed_remove_reaction,
      };
    }

    return { success: true };
  } catch {
    return {
      success: false,
      error: get_active_translations().errors.failed_remove_reaction,
    };
  }
}

export async function send_reaction(
  message: DecryptedThreadMessage,
  emoji: string,
  thread_token?: string,
): Promise<ReactionResult> {
  if (get_cached_preferences()?.reactions_enabled === false) {
    return {
      success: false,
      error: get_active_translations().errors.reactions_disabled,
    };
  }

  const current_user = await resolve_current_user();

  if (!current_user?.email) {
    return {
      success: false,
      error: get_active_translations().errors.no_active_account,
    };
  }

  const primary_email = current_user.email;
  const restriction = reaction_restriction(
    message,
    primary_email,
    true,
    is_own_reaction_address,
  );

  if (restriction) {
    return {
      success: false,
      error:
        get_active_translations().errors[
          reaction_restriction_keys[restriction]
        ],
    };
  }

  const recipient = resolve_reaction_recipient(message, primary_email);

  if (!recipient) {
    return {
      success: false,
      error: get_active_translations().errors.no_recipients,
    };
  }

  const alias_identity = resolve_reaction_sender_identity(
    message,
    primary_email,
  );
  const sender_email = alias_identity?.email ?? primary_email;

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

    const envelope_data = await create_sent_envelope(
      queued_email,
      sender_email,
    );

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
      reply_subject: is_internal_email(recipient) ? undefined : message.subject,
      sender_email,
      sender_alias_hash: alias_identity?.address_hash,
      sender_display_name: alias_identity?.display_name,
      in_reply_to: is_internal_email(recipient)
        ? undefined
        : resolve_reaction_in_reply_to(message),
    });

    if (response.error || !response.data?.success) {
      return {
        success: false,
        error: get_active_translations().errors.failed_send_reaction,
      };
    }

    return {
      success: true,
      own_reaction_mail_item_id: response.data.own_reaction_mail_item_id,
    };
  } catch {
    return {
      success: false,
      error: get_active_translations().errors.failed_send_reaction,
    };
  }
}
