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
  is_encrypted_reaction_recipient,
  reaction_restriction,
  reaction_restriction_keys,
  resolve_reaction_recipient,
} from "./reaction_restrictions";
import { get_cached_preferences } from "./api/preferences";
import {
  ensure_post_quantum_consent,
  type PostQuantumConsentBlock,
} from "./post_quantum_consent";
import { SendError, type EncryptionResult } from "./send_queue_types";

import {
  ensure_sender_alias_caches,
  get_cached_sender_identity_for_address,
  get_cached_sender_identity_for_routing_token,
  is_sender_alias_cache_populated,
  type CachedSenderIdentity,
} from "@/hooks/use_sender_aliases";
import { extract_delivered_to } from "@/utils/delivered_to";
import { get_active_translations } from "@/lib/i18n/translations";
import { clamp_subject } from "@/lib/reply_subject";

export interface ReactionResult {
  success: boolean;
  error?: string;
  cancelled?: boolean;
  own_reaction_mail_item_id?: string;
}

function translate_consent_block(block: PostQuantumConsentBlock): string {
  const errors = get_active_translations().errors;

  return block === "errors.recipient_key_untrusted"
    ? errors.recipient_key_untrusted
    : errors.key_trust_check_failed;
}

type ReactionBody =
  | { ok: true; result: EncryptionResult }
  | { ok: false; result: ReactionResult };

async function seal_reaction_body(
  body: string,
  recipient: string,
  sender_email: string,
): Promise<ReactionBody> {
  const consent = await ensure_post_quantum_consent([recipient], sender_email);

  if (!consent.proceed) {
    return {
      ok: false,
      result: consent.blocked_by
        ? { success: false, error: translate_consent_block(consent.blocked_by) }
        : { success: false, cancelled: true },
    };
  }

  const result = await encrypt_for_recipients(
    body,
    [recipient],
    sender_email,
    consent.allow_non_post_quantum,
  );

  if (!result.is_encrypted) {
    return {
      ok: false,
      result: {
        success: false,
        error: get_active_translations().errors.failed_encrypt_envelope,
      },
    };
  }

  return { ok: true, result };
}

export type ReactionSender =
  | { kind: "primary" }
  | { kind: "identity"; identity: CachedSenderIdentity }
  | { kind: "undetermined" };

function normalize_address(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function resolve_cached_reaction_sender(
  message: DecryptedThreadMessage,
  primary_email: string,
): ReactionSender {
  const primary = normalize_address(primary_email);
  const delivered_to = extract_delivered_to(message.raw_headers);
  const delivered =
    get_cached_sender_identity_for_routing_token(message.routing_token) ??
    get_cached_sender_identity_for_address(delivered_to);

  if (delivered) return { kind: "identity", identity: delivered };

  const visible = [
    ...(message.to_recipients ?? []),
    ...(message.cc_recipients ?? []),
  ].map((recipient) => normalize_address(recipient.email));

  if (primary && visible.includes(primary)) return { kind: "primary" };

  for (const address of visible) {
    const identity = get_cached_sender_identity_for_address(address);

    if (identity) return { kind: "identity", identity };
  }

  if (primary && normalize_address(delivered_to) === primary) {
    return { kind: "primary" };
  }

  if (!message.routing_token && visible.length === 0) {
    return { kind: "primary" };
  }

  return { kind: "undetermined" };
}

export async function resolve_reaction_sender(
  message: DecryptedThreadMessage,
  primary_email: string,
): Promise<ReactionSender> {
  const cached = resolve_cached_reaction_sender(message, primary_email);

  if (cached.kind === "identity") return cached;
  if (!message.routing_token && is_sender_alias_cache_populated()) {
    return cached;
  }

  await ensure_sender_alias_caches({
    refresh: Boolean(message.routing_token),
  });

  return resolve_cached_reaction_sender(message, primary_email);
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
        error:
          response.error ??
          get_active_translations().errors.failed_remove_reaction,
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
  const require_encryption =
    get_cached_preferences()?.require_encryption === true;
  const restriction = reaction_restriction(
    message,
    primary_email,
    true,
    is_own_reaction_address,
    require_encryption,
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

  const reaction_sender = await resolve_reaction_sender(message, primary_email);

  if (reaction_sender.kind === "undetermined") {
    return {
      success: false,
      error: get_active_translations().errors.cannot_react_bcc,
    };
  }

  const alias_identity =
    reaction_sender.kind === "identity" ? reaction_sender.identity : undefined;
  const sender_email = alias_identity?.email ?? primary_email;

  const recipient_is_internal = is_encrypted_reaction_recipient(recipient);

  if (!recipient_is_internal && require_encryption) {
    return {
      success: false,
      error: get_active_translations().errors.cannot_react_require_encryption,
    };
  }

  try {
    const body = JSON.stringify({ aster_reaction: true, emoji });

    let encryption_result: EncryptionResult = {
      encrypted_body: body,
      is_encrypted: false,
    };

    if (recipient_is_internal) {
      const sealed = await seal_reaction_body(body, recipient, sender_email);

      if (!sealed.ok) return sealed.result;

      encryption_result = sealed.result;
    }

    if (
      !encryption_result.is_encrypted &&
      (recipient_is_internal || require_encryption)
    ) {
      return {
        success: false,
        error: get_active_translations().errors.failed_encrypt_envelope,
      };
    }

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
      reply_subject: recipient_is_internal
        ? undefined
        : clamp_subject(message.subject),
      sender_email,
      sender_alias_hash: alias_identity?.address_hash,
      sender_display_name: alias_identity?.display_name,
      in_reply_to: recipient_is_internal
        ? undefined
        : resolve_reaction_in_reply_to(message),
    });

    if (response.server_code === "REACTION_LIMIT_REACHED") {
      return {
        success: false,
        error: get_active_translations().errors.cannot_react_limit,
      };
    }

    if (response.error || !response.data?.success) {
      return {
        success: false,
        error:
          response.error ??
          get_active_translations().errors.failed_send_reaction,
      };
    }

    return {
      success: true,
      own_reaction_mail_item_id: response.data.own_reaction_mail_item_id,
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof SendError && error.message
          ? error.message
          : get_active_translations().errors.failed_send_reaction,
    };
  }
}
