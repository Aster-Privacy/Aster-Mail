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
import { get_active_translations } from "@/lib/i18n/translations";
import { derive_own_public_key } from "@/utils/email_crypto";
import { get_recipient_public_key, is_internal_email } from "./api/keys";
import { ensure_ratchet_keys } from "./crypto/ensure_ratchet_keys";
import { encrypt_message_multi } from "./crypto/key_manager";
import { get_passphrase_from_memory, get_vault_from_memory, has_passphrase_in_memory } from "./crypto/memory_key_store";
import { RecoveryLaneUnavailableError, build_ratchet_envelope, encrypt_for_ratchet_recipient, is_post_quantum_recipient_data, recipient_supports_post_quantum } from "./crypto/ratchet_manager";
import { resolve_own_username_for_key_lookup, resolve_username_for_key_lookup } from "./send_queue_recipients";
import { PostQuantumUnavailableError, create_error, type EncryptionResult, type SendReadinessResult } from "./send_queue_types";

export function check_send_readiness_internal(): SendReadinessResult {
  const vault = get_vault_from_memory();

  if (!vault || !vault.identity_key) {
    return {
      ready: false,
      error: create_error(
        "vault_unavailable",
        get_active_translations().errors.encryption_keys_not_loaded,
      ),
    };
  }

  if (!has_passphrase_in_memory()) {
    return {
      ready: false,
      error: create_error(
        "vault_unavailable",
        get_active_translations().errors.session_expired_reenter,
      ),
    };
  }

  return { ready: true };
}

function post_quantum_error(recipients: string[]): PostQuantumUnavailableError {
  return new PostQuantumUnavailableError(
    get_active_translations().errors.post_quantum_unavailable.replace(
      "{{recipients}}",
      recipients.join(", "),
    ),
    recipients,
  );
}

export async function check_post_quantum_coverage(
  recipients: string[],
  sender_email?: string,
): Promise<string[]> {
  if (!sender_email) return [];

  const internal_recipients = recipients.filter(is_internal_email);

  if (internal_recipients.length === 0) return [];

  const missing: string[] = [];

  for (const recipient of internal_recipients) {
    const username = await resolve_username_for_key_lookup(recipient);

    if (!username) {
      missing.push(recipient);
      continue;
    }

    try {
      const supported = await recipient_supports_post_quantum(
        sender_email,
        recipient,
        username,
      );

      if (!supported) missing.push(recipient);
    } catch {
      continue;
    }
  }

  return missing;
}

export async function encrypt_for_recipients(
  body: string,
  recipients: string[],
  sender_email?: string,
  allow_non_post_quantum = false,
): Promise<EncryptionResult> {
  const internal_recipients = recipients.filter(is_internal_email);

  if (internal_recipients.length === 0) {
    return { encrypted_body: body, is_encrypted: false };
  }

  const has_external_recipients = recipients.some((r) => !is_internal_email(r));

  const as_result = (ciphertext: string): EncryptionResult =>
    has_external_recipients
      ? {
          encrypted_body: body,
          is_encrypted: false,
          internal_encrypted_body: ciphertext,
        }
      : { encrypted_body: ciphertext, is_encrypted: true };

  let vault = get_vault_from_memory();

  if (sender_email && vault) {
    await ensure_ratchet_keys();
    vault = get_vault_from_memory();
  }

  if (
    sender_email &&
    vault?.ratchet_identity_key &&
    vault?.ratchet_identity_public
  ) {
    const ratchet_results: Record<
      string,
      Awaited<ReturnType<typeof encrypt_for_ratchet_recipient>>
    > = {};
    let all_ratchet_ok = true;

    for (const recipient of internal_recipients) {
      const username = await resolve_username_for_key_lookup(recipient);

      if (!username) {
        all_ratchet_ok = false;
        break;
      }

      let result: Awaited<ReturnType<typeof encrypt_for_ratchet_recipient>>;

      try {
        result = await encrypt_for_ratchet_recipient(
          sender_email,
          recipient,
          username,
          body,
          vault,
        );
      } catch (err) {
        if (err instanceof RecoveryLaneUnavailableError) {
          throw create_error(
            "encryption_failed",
            get_active_translations().errors.cannot_send_no_recovery_key,
          );
        }

        throw err;
      }

      if (result) {
        ratchet_results[recipient.toLowerCase()] = result;
      } else {
        all_ratchet_ok = false;
        break;
      }
    }

    if (all_ratchet_ok) {
      const sender_lower = sender_email.toLowerCase();

      if (!internal_recipients.some((r) => r.toLowerCase() === sender_lower)) {
        const sender_username =
          await resolve_own_username_for_key_lookup(sender_email);

        if (sender_username) {
          let self_result: Awaited<
            ReturnType<typeof encrypt_for_ratchet_recipient>
          >;

          try {
            self_result = await encrypt_for_ratchet_recipient(
              sender_email,
              sender_email,
              sender_username,
              body,
              vault,
            );
          } catch (err) {
            if (err instanceof RecoveryLaneUnavailableError) {
              throw create_error(
                "encryption_failed",
                get_active_translations().errors.cannot_send_no_recovery_key,
              );
            }

            throw err;
          }

          if (self_result) {
            ratchet_results[sender_lower] = self_result;
          }
        }
      }
    }

    if (all_ratchet_ok && Object.keys(ratchet_results).length > 0) {
      if (!allow_non_post_quantum) {
        const non_pq = Object.entries(ratchet_results)
          .filter(([, data]) => !is_post_quantum_recipient_data(data))
          .map(([recipient]) => recipient);

        if (non_pq.length > 0) {
          throw post_quantum_error(non_pq);
        }
      }

      const envelope = build_ratchet_envelope(
        vault.ratchet_identity_public,
        ratchet_results as Record<
          string,
          NonNullable<(typeof ratchet_results)[string]>
        >,
      );

      return as_result(envelope);
    }
  }

  if (!allow_non_post_quantum) {
    throw post_quantum_error(internal_recipients);
  }

  const public_keys: string[] = [];

  for (const recipient of internal_recipients) {
    const username = await resolve_username_for_key_lookup(recipient);

    if (!username) {
      throw create_error(
        "encryption_failed",
        get_active_translations().errors.cannot_send_no_recipient_keys,
      );
    }

    const key_response = await get_recipient_public_key(username, recipient);

    if (key_response.error || !key_response.data) {
      if (key_response.code && key_response.code !== "NOT_FOUND") {
        throw create_error(
          "encryption_failed",
          get_active_translations().errors.failed_encrypt_envelope,
        );
      }

      throw create_error(
        "encryption_failed",
        get_active_translations().errors.cannot_send_no_recipient_keys,
      );
    }

    public_keys.push(key_response.data.public_key);
  }

  if (public_keys.length === 0) {
    throw create_error(
      "encryption_failed",
      get_active_translations().errors.cannot_send_no_recipient_keys,
    );
  }

  try {
    const passphrase = get_passphrase_from_memory();
    const signing_key =
      vault?.identity_key && passphrase
        ? [vault.identity_key, ...(vault.previous_keys ?? [])].map(
            (armored_secret_key) => ({ armored_secret_key, passphrase }),
          )
        : undefined;
    const own_public_key = await derive_own_public_key();

    if (own_public_key) public_keys.push(own_public_key);

    const encrypted = await encrypt_message_multi(body, public_keys, signing_key);

    return as_result(encrypted);
  } catch (err) {
    throw create_error(
      "encryption_failed",
      `Encryption failed: ${err instanceof Error ? err.message : "unknown error"}. Cannot send unencrypted.`,
    );
  }
}
