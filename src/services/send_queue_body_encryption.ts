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
import { get_recipient_public_key } from "./api/keys";
import {
  account_sender_identity,
  derive_address_sender_identity,
  type SenderIdentity,
} from "./crypto/address_sender_identity";
import { resolve_address_send_state } from "./crypto/address_identity_directory";
import {
  is_primary_address,
  local_account_bundle,
  local_address_bundle,
  type AddressEntryKeys,
} from "./crypto/address_identity_entry";
import { ensure_ratchet_keys } from "./crypto/ensure_ratchet_keys";
import type { PrekeyBundle } from "./crypto/x3dh";
import {
  encrypt_message_multi,
  type EncryptedVault,
} from "./crypto/key_manager";
import {
  get_passphrase_from_memory,
  get_vault_from_memory,
  has_passphrase_in_memory,
} from "./crypto/memory_key_store";
import {
  KeyPinUnavailableError,
  RecipientPinUnreadableError,
  RecipientKeyUntrustedError,
  RecoveryLaneUnavailableError,
  build_ratchet_envelope,
  encrypt_for_ratchet_recipient,
  is_post_quantum_recipient_data,
  recipient_post_quantum_status,
} from "./crypto/ratchet_manager";
import {
  assert_owner_key_trusted,
  resolve_own_username_for_key_lookup,
  resolve_username_for_key_lookup,
} from "./send_queue_recipients";
import { is_internal_recipient } from "./recipient_classification";
import {
  PostQuantumUnavailableError,
  create_error,
  type EncryptionResult,
  type SendReadinessResult,
} from "./send_queue_types";

import { derive_own_public_key } from "@/utils/email_crypto";
import { load_openpgp } from "@/services/crypto/openpgp_loader";
import { get_active_translations } from "@/lib/i18n/translations";
import { normalize_address_ignoring_dots } from "@/utils/address_dots";

function map_ratchet_error(err: unknown): unknown {
  if (err instanceof RecoveryLaneUnavailableError) {
    return create_error(
      "encryption_failed",
      get_active_translations().errors.cannot_send_no_recovery_key,
    );
  }

  if (err instanceof RecipientKeyUntrustedError) {
    return create_error(
      "encryption_failed",
      get_active_translations().errors.recipient_key_untrusted,
    );
  }

  if (err instanceof RecipientPinUnreadableError) {
    return create_error(
      "encryption_failed",
      get_active_translations().errors.recipient_key_unreadable,
    );
  }

  if (err instanceof KeyPinUnavailableError) {
    return create_error(
      "encryption_failed",
      get_active_translations().errors.key_trust_check_failed,
    );
  }

  return err;
}

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

export interface PostQuantumCoverage {
  missing: string[];
  downgraded: string[];
  untrusted: string[];
  unreadable: string[];
}

export async function check_post_quantum_status(
  recipients: string[],
  sender_email?: string,
): Promise<PostQuantumCoverage> {
  const coverage: PostQuantumCoverage = {
    missing: [],
    downgraded: [],
    untrusted: [],
    unreadable: [],
  };

  if (!sender_email) return coverage;

  const internal_recipients = recipients.filter(is_internal_recipient);

  if (internal_recipients.length === 0) return coverage;

  for (const recipient of internal_recipients) {
    const username = await resolve_username_for_key_lookup(recipient);

    if (!username) {
      coverage.missing.push(recipient);
      continue;
    }

    try {
      const status = await recipient_post_quantum_status(
        sender_email,
        recipient,
        username,
      );

      if (status === "supported") continue;

      if (status === "untrusted") {
        coverage.untrusted.push(recipient);
        continue;
      }

      coverage.missing.push(recipient);

      if (status === "downgraded") coverage.downgraded.push(recipient);
    } catch (err) {
      if (err instanceof RecipientPinUnreadableError) {
        coverage.unreadable.push(recipient);
        continue;
      }

      throw map_ratchet_error(err);
    }
  }

  await check_self_copy_trust(sender_email, internal_recipients, coverage);

  return coverage;
}

async function check_self_copy_trust(
  sender_email: string,
  internal_recipients: string[],
  coverage: PostQuantumCoverage,
): Promise<void> {
  if (!is_internal_recipient(sender_email)) return;

  const ratchet_sender = await resolve_ratchet_sender(sender_email);
  const sender_lower = ratchet_sender.toLowerCase();

  if (internal_recipients.some((r) => r.toLowerCase() === sender_lower)) {
    return;
  }

  const username = await resolve_own_username_for_key_lookup(ratchet_sender);

  if (!username) return;

  try {
    const status = await recipient_post_quantum_status(
      ratchet_sender,
      ratchet_sender,
      username,
    );

    if (status === "untrusted") coverage.untrusted.push(sender_lower);
  } catch (err) {
    if (err instanceof RecipientPinUnreadableError) {
      coverage.unreadable.push(sender_lower);

      return;
    }

    throw map_ratchet_error(err);
  }
}

export async function check_post_quantum_coverage(
  recipients: string[],
  sender_email?: string,
): Promise<string[]> {
  const coverage = await check_post_quantum_status(recipients, sender_email);

  return coverage.missing;
}

async function resolve_ratchet_sender(sender_email: string): Promise<string> {
  const { get_current_account } = await import("@/services/account_manager");
  const account = await get_current_account().catch(() => null);
  const primary_email = account?.user?.email;

  if (primary_email && is_primary_address(sender_email, primary_email)) {
    return normalize_address_ignoring_dots(sender_email);
  }

  return sender_email;
}

export async function sender_uses_account_key(
  sender_email: string | undefined,
): Promise<boolean> {
  if (!sender_email) return true;

  const { get_current_account } = await import("@/services/account_manager");
  const account = await get_current_account().catch(() => null);
  const primary_email = account?.user?.email;

  return is_primary_address(sender_email, primary_email);
}

const ADDRESS_MISMATCH_STATUS = 422;

async function resolve_own_lookup_username(
  sender_email: string,
): Promise<string | null> {
  const { get_current_account } = await import("@/services/account_manager");
  const account = await get_current_account().catch(() => null);

  return (
    account?.user?.username ??
    (await resolve_own_username_for_key_lookup(sender_email).catch(() => null))
  );
}

export async function resolve_sender_identity(
  sender_email: string,
  vault: EncryptedVault,
): Promise<SenderIdentity> {
  const errors = get_active_translations().errors;

  if (await sender_uses_account_key(sender_email)) {
    return account_sender_identity(vault);
  }

  const state = await resolve_address_send_state(
    vault,
    sender_email,
    await resolve_own_lookup_username(sender_email),
  );

  if (state === "inactive") return account_sender_identity(vault);

  if (state === "unavailable") {
    throw create_error("encryption_failed", errors.failed_encrypt_envelope);
  }

  const derived =
    state === "active"
      ? derive_address_sender_identity(vault.ratchet_identity_key, sender_email)
      : null;

  if (!derived) {
    throw create_error(
      "encryption_failed",
      errors.failed_encrypt_envelope,
      ADDRESS_MISMATCH_STATUS,
    );
  }

  return derived;
}

function own_local_bundle(
  vault: EncryptedVault,
  sender_email: string,
  uses_address_identity: boolean,
): PrekeyBundle | undefined {
  const keys: AddressEntryKeys | null = uses_address_identity
    ? local_address_bundle(vault, sender_email)
    : local_account_bundle(vault);

  return keys ? { ...keys, address_scoped: uses_address_identity } : undefined;
}

export async function encrypt_for_recipients(
  body: string,
  recipients: string[],
  sender_email?: string,
  allow_non_post_quantum = false,
): Promise<EncryptionResult> {
  const internal_recipients = recipients.filter(is_internal_recipient);

  if (internal_recipients.length === 0) {
    return { encrypted_body: body, is_encrypted: false };
  }

  const has_external_recipients = recipients.some(
    (r) => !is_internal_recipient(r),
  );

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
    const ratchet_sender = await resolve_ratchet_sender(sender_email);
    const sender_identity = await resolve_sender_identity(
      ratchet_sender,
      vault,
    );

    const ratchet_results: Record<
      string,
      Awaited<ReturnType<typeof encrypt_for_ratchet_recipient>>
    > = {};
    let all_ratchet_ok = true;
    const own_address_identity =
      sender_identity.identity_public === vault.ratchet_identity_public
        ? undefined
        : sender_identity.identity_public;
    const own_address = ratchet_sender.toLowerCase();
    const own_bundle = own_local_bundle(
      vault,
      ratchet_sender,
      own_address_identity !== undefined,
    );

    for (const recipient of internal_recipients) {
      const username = await resolve_username_for_key_lookup(recipient);

      if (!username) {
        all_ratchet_ok = false;
        break;
      }

      let result: Awaited<ReturnType<typeof encrypt_for_ratchet_recipient>>;

      try {
        result = await encrypt_for_ratchet_recipient(
          ratchet_sender,
          recipient,
          username,
          body,
          vault,
          sender_identity,
          recipient.toLowerCase() === own_address
            ? own_address_identity
            : undefined,
          recipient.toLowerCase() === own_address ? own_bundle : undefined,
        );
      } catch (err) {
        throw map_ratchet_error(err);
      }

      if (result) {
        ratchet_results[recipient.toLowerCase()] = result;
      } else {
        all_ratchet_ok = false;
        break;
      }
    }

    if (all_ratchet_ok) {
      const sender_lower = ratchet_sender.toLowerCase();

      if (!internal_recipients.some((r) => r.toLowerCase() === sender_lower)) {
        const sender_username =
          await resolve_own_username_for_key_lookup(ratchet_sender);

        if (sender_username) {
          let self_result: Awaited<
            ReturnType<typeof encrypt_for_ratchet_recipient>
          >;

          try {
            self_result = await encrypt_for_ratchet_recipient(
              ratchet_sender,
              ratchet_sender,
              sender_username,
              body,
              vault,
              sender_identity,
              own_address_identity,
              own_bundle,
            );
          } catch (err) {
            throw map_ratchet_error(err);
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
        sender_identity.identity_public,
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

    await assert_owner_key_trusted(recipient, key_response.data.public_key);
    public_keys.push(key_response.data.public_key);
  }

  if (public_keys.length === 0) {
    throw create_error(
      "encryption_failed",
      get_active_translations().errors.cannot_send_no_recipient_keys,
    );
  }

  await load_openpgp();

  try {
    const passphrase = get_passphrase_from_memory();
    const signs_with_account_key = await sender_uses_account_key(sender_email);
    const signing_key =
      signs_with_account_key && vault?.identity_key && passphrase
        ? [vault.identity_key, ...(vault.previous_keys ?? [])].map(
            (armored_secret_key) => ({ armored_secret_key, passphrase }),
          )
        : undefined;
    const own_public_key = signs_with_account_key
      ? await derive_own_public_key()
      : null;

    if (own_public_key) public_keys.push(own_public_key);

    const encrypted = await encrypt_message_multi(
      body,
      public_keys,
      signing_key,
    );

    return as_result(encrypted);
  } catch {
    throw create_error(
      "encryption_failed",
      get_active_translations().errors.failed_encrypt_envelope,
    );
  }
}
