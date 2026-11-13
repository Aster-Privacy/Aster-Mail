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
import { get_recipient_public_key } from "../api/keys";

import { array_to_base64, base64_to_array } from "./base64";
import { DoubleRatchet, type BootstrapData } from "./double_ratchet";
import { type EncryptedVault } from "./key_manager";
import { verify_ratchet_prekey_bundle_detailed } from "./key_manager_pgp";
import { is_strict_recipient_bundle_enforced } from "./crypto_enforcement_policy";
import {
  record_bundle_verification,
  record_peer_identity_event,
} from "./ratchet_verification_status";
import {
  derive_conversation_id,
  get_sync_encryption_key,
  run_serialized_for_conversation,
} from "./ratchet_conversation";
import {
  check_and_pin_identity,
  check_owner_key_pin,
  flag_recipient_untrusted,
  has_peer_advertised_pq,
  remembered_peer_x3dh_version,
  is_recipient_bundle_accepted,
  is_recipient_flagged_untrusted,
  type OwnerKeyPinStatus,
} from "./ratchet_identity_pin";
import {
  detect_identity_pin_drift,
  fetch_prekey_bundle,
  fetch_ratchet_identity,
} from "./ratchet_prekey_bundle";
import {
  can_seal_recovery_lane,
  recovery_lane_is_post_quantum,
  seal_recovery_lane,
  type RecoveryLaneData,
  type RecoveryLaneRecipientKeys,
} from "./ratchet_recovery_lane";
import {
  merge_discards_local_epoch,
  merge_ratchet_states,
} from "./ratchet_state_merge";
import {
  archive_ratchet_state,
  load_ratchet_state,
  save_ratchet_state,
} from "./ratchet_state_store";
import { load_ratchet_for_merge, sync_ratchet_to_server } from "./ratchet_sync";
import {
  KeyPinUnavailableError,
  RecipientKeyUntrustedError,
  RecoveryLaneUnavailableError,
  type RatchetRecipientData,
} from "./ratchet_types";
import {
  bundle_has_signed_pq_identity,
  bundle_is_downgraded,
  bundle_supports_pq,
  perform_x3dh_sender,
  PQ_IDENTITY_KEY_ID,
  restrict_bundle_to_signed_pq_key,
  X3DH_VERSION_LEGACY,
  X3DH_VERSION_ONE_TIME_BOUND,
  type PrekeyBundle,
} from "./x3dh";

import { zero_uint8_array } from "@/services/crypto/secure_memory";
import { is_crypto_module_load_error } from "@/services/crypto/openpgp_loader";

async function adopt_server_state_before_send(
  conversation_id: string,
  ratchet: DoubleRatchet,
): Promise<void> {
  try {
    const sync_key = await get_sync_encryption_key();

    if (!sync_key) {
      return;
    }

    const server = await load_ratchet_for_merge(conversation_id, sync_key);

    if (!server) {
      return;
    }

    const local = await ratchet.serialize();

    if (merge_discards_local_epoch(local, server.state, server.versioned)) {
      await archive_ratchet_state(local);
    }

    ratchet.adopt_state(
      merge_ratchet_states(local, server.state, server.versioned),
    );
  } catch {
    return;
  }
}

export async function encrypt_for_ratchet_recipient(
  sender_email: string,
  recipient_email: string,
  recipient_username: string,
  body: string,
  vault: EncryptedVault,
): Promise<RatchetRecipientData | null> {
  const conversation_id = await derive_conversation_id(
    sender_email,
    recipient_email,
  );

  return run_serialized_for_conversation(conversation_id, () =>
    encrypt_for_ratchet_recipient_unlocked(
      conversation_id,
      recipient_email,
      recipient_username,
      body,
      vault,
    ),
  );
}

type BundleVerification = Awaited<
  ReturnType<typeof verify_ratchet_prekey_bundle_detailed>
> & {
  owner_pin: OwnerKeyPinStatus;
  flagged_untrusted: boolean;
  accepted_by_user: boolean;
};

async function verify_recipient_bundle(
  bundle: PrekeyBundle,
  recipient_username: string,
  recipient_email: string,
): Promise<BundleVerification> {
  const owner_key = await get_recipient_public_key(
    recipient_username,
    recipient_email,
  );
  const owner_public_key = owner_key.data?.public_key ?? null;
  const pin_id = (recipient_email ?? recipient_username).toLowerCase();
  const owner_pin = owner_public_key
    ? await check_owner_key_pin(pin_id, owner_public_key)
    : "unknown";
  const flagged_untrusted = await is_recipient_flagged_untrusted(pin_id);

  const verification = await verify_ratchet_prekey_bundle_detailed(
    bundle.signed_prekey_signature,
    bundle.kem_identity_key,
    bundle.signed_prekey,
    owner_public_key,
    bundle.pq_kem_public_key ?? null,
  );

  const accepted_by_user =
    verification.verdict === "tampered" &&
    (await is_recipient_bundle_accepted(pin_id, bundle));

  return { ...verification, owner_pin, flagged_untrusted, accepted_by_user };
}

function is_bundle_untrusted(verification: BundleVerification): boolean {
  return (
    (verification.verdict === "tampered" && !verification.accepted_by_user) ||
    verification.owner_pin === "changed" ||
    verification.flagged_untrusted
  );
}

function is_bundle_verification_rejected(
  verification: BundleVerification,
): boolean {
  return (
    is_bundle_untrusted(verification) ||
    verification.verdict === "tampered" ||
    (is_strict_recipient_bundle_enforced() &&
      verification.verdict !== "verified")
  );
}

function signature_covers_pq_identity(
  verification: BundleVerification,
): boolean {
  return verification.verdict === "verified" && verification.strict;
}

async function is_pq_identity_signed_by_owner(
  published: PrekeyBundle,
  recipient_username: string,
  recipient_email: string,
): Promise<boolean> {
  try {
    const verification = await verify_recipient_bundle(
      published,
      recipient_username,
      recipient_email,
    );

    return (
      !is_bundle_verification_rejected(verification) &&
      bundle_has_signed_pq_identity(
        published,
        signature_covers_pq_identity(verification),
      )
    );
  } catch {
    return false;
  }
}

function session_uses_unsigned_pq_prekey(
  bootstrap: BootstrapData | null,
): boolean {
  return (
    !!bootstrap?.pq_ciphertext && bootstrap.pq_key_id !== PQ_IDENTITY_KEY_ID
  );
}

function resolve_recovery_lane_keys(
  bundle: PrekeyBundle | null,
  bootstrap: BootstrapData | null,
): RecoveryLaneRecipientKeys | null {
  const identity_public =
    bundle?.kem_identity_key ?? bootstrap?.recipient_identity_key ?? "";

  if (!identity_public) return null;

  const session_pq_identity_public =
    bootstrap?.recipient_identity_key === identity_public
      ? (bootstrap.recipient_pq_identity_key ?? "")
      : "";
  const pq_identity_public =
    bundle?.pq_kem_public_key || session_pq_identity_public;

  return { identity_public, pq_identity_public };
}

function session_lane_lacks_advertised_pq_key(
  bootstrap: BootstrapData | null,
  advertised_pq_identity_key: string | null | undefined,
): boolean {
  return (
    !!advertised_pq_identity_key &&
    bootstrap?.recipient_pq_identity_key !== advertised_pq_identity_key
  );
}

async function encrypt_for_ratchet_recipient_unlocked(
  conversation_id: string,
  recipient_email: string,
  recipient_username: string,
  body: string,
  vault: EncryptedVault,
): Promise<RatchetRecipientData | null> {
  try {
    if (!vault.ratchet_identity_key || !vault.ratchet_identity_public) {
      return null;
    }

    let ratchet = await load_ratchet_state(conversation_id);

    if (ratchet) {
      await adopt_server_state_before_send(conversation_id, ratchet);
    }

    let ephemeral_key_base64 = "";
    let pq_ciphertext_base64: string | undefined;
    let pq_key_id_value: number | undefined;
    let x3dh_version_value: number | undefined;
    let one_time_prekey_id_value: number | undefined;
    let signed_prekey_id_value: string | undefined;

    let bundle: PrekeyBundle | null = null;

    if (ratchet) {
      const bootstrap = ratchet.get_bootstrap();

      const sender_changed =
        !bootstrap ||
        bootstrap.sender_identity_key !== vault.ratchet_identity_public;

      let recipient_changed = false;

      if (!sender_changed) {
        const identity = await fetch_ratchet_identity(
          recipient_username,
          recipient_email,
        );

        if (!identity) {
          bundle = await fetch_prekey_bundle(
            recipient_username,
            recipient_email,
          );
        }

        const advertised = identity ?? bundle;

        if (advertised) {
          recipient_changed =
            bootstrap?.recipient_identity_key !== advertised.kem_identity_key ||
            session_lane_lacks_advertised_pq_key(
              bootstrap,
              advertised.pq_kem_public_key,
            );

          if (
            !recipient_changed &&
            session_uses_unsigned_pq_prekey(bootstrap) &&
            advertised.pq_kem_public_key
          ) {
            recipient_changed = await is_pq_identity_signed_by_owner(
              advertised,
              recipient_username,
              recipient_email,
            );
          }
        }
      }

      if (sender_changed || recipient_changed) {
        ratchet = null;
      }
    }

    if (!ratchet) {
      if (!bundle) {
        bundle = await fetch_prekey_bundle(recipient_username, recipient_email);
      }

      if (!bundle) {
        return null;
      }

      await detect_identity_pin_drift(
        (recipient_email ?? recipient_username).toLowerCase(),
        bundle.kem_identity_key,
      );

      const bundle_verification = await verify_recipient_bundle(
        bundle,
        recipient_username,
        recipient_email,
      );

      const bundle_peer = (recipient_email ?? recipient_username).toLowerCase();

      record_bundle_verification(bundle_peer, bundle_verification);

      const advertises_pq = Boolean(bundle.pq_kem_public_key);
      const pq_downgraded =
        bundle_is_downgraded(bundle) ||
        (!advertises_pq && (await has_peer_advertised_pq(bundle_peer)));

      if (is_bundle_untrusted(bundle_verification)) {
        await flag_recipient_untrusted(bundle_peer);
        throw new RecipientKeyUntrustedError(recipient_email);
      }

      const bundle_rejected =
        pq_downgraded || is_bundle_verification_rejected(bundle_verification);

      if (bundle_rejected) {
        if (pq_downgraded) {
          record_peer_identity_event(bundle_peer, "downgraded");
          console.warn(
            "ratchet prekey bundle dropped its post-quantum key; routing via PGP",
          );
        } else if (import.meta.env.DEV) {
          console.warn(
            "ratchet prekey bundle failed verification; routing via PGP",
          );
        }

        return null;
      }

      const identity_pin_status = await check_and_pin_identity(
        bundle_peer,
        bundle.kem_identity_key,
        bundle_verification.verdict === "verified" &&
          (bundle_verification.owner_pin === "ok" ||
            bundle_verification.owner_pin === "first"),
        advertises_pq,
        bundle.x3dh_max_version,
      );

      if (identity_pin_status === "drift") {
        await flag_recipient_untrusted(bundle_peer);
        throw new RecipientKeyUntrustedError(recipient_email);
      }

      if (identity_pin_status === "unknown") {
        throw new KeyPinUnavailableError(bundle_peer);
      }

      const sender_identity_jwk: JsonWebKey = JSON.parse(
        vault.ratchet_identity_key,
      );

      const x3dh_result = await perform_x3dh_sender(
        sender_identity_jwk,
        restrict_bundle_to_signed_pq_key(
          bundle,
          signature_covers_pq_identity(bundle_verification),
        ),
        await remembered_peer_x3dh_version(bundle_peer),
      );

      try {
        const recipient_signed_prekey_raw = base64_to_array(
          bundle.signed_prekey,
        );

        ratchet = await DoubleRatchet.init_sender(
          x3dh_result.shared_secret,
          recipient_signed_prekey_raw,
          conversation_id,
        );

        ephemeral_key_base64 = array_to_base64(
          x3dh_result.ephemeral_public_key,
        );

        if (x3dh_result.pq_ciphertext && x3dh_result.pq_key_id !== undefined) {
          pq_ciphertext_base64 = array_to_base64(x3dh_result.pq_ciphertext);
          pq_key_id_value = x3dh_result.pq_key_id;
        }

        x3dh_version_value =
          x3dh_result.x3dh_version > X3DH_VERSION_LEGACY
            ? x3dh_result.x3dh_version
            : undefined;

        const bootstrap_data: BootstrapData = {
          ephemeral_key: ephemeral_key_base64,
          pq_ciphertext: pq_ciphertext_base64,
          pq_key_id: pq_key_id_value,
          sender_identity_key: vault.ratchet_identity_public,
          recipient_identity_key: bundle.kem_identity_key,
          recipient_pq_identity_key: bundle.pq_kem_public_key ?? undefined,
          x3dh_version: x3dh_version_value,
        };

        if (
          x3dh_result.x3dh_version === X3DH_VERSION_ONE_TIME_BOUND &&
          x3dh_result.one_time_prekey_id !== undefined
        ) {
          one_time_prekey_id_value = x3dh_result.one_time_prekey_id;
          signed_prekey_id_value = x3dh_result.signed_prekey_id;
          bootstrap_data.one_time_prekey_id = one_time_prekey_id_value;

          if (signed_prekey_id_value !== undefined) {
            bootstrap_data.signed_prekey_id = signed_prekey_id_value;
          }
        }

        ratchet.set_bootstrap(bootstrap_data);
      } finally {
        x3dh_result.shared_secret.fill(0);
      }
    } else {
      const bootstrap = ratchet.get_bootstrap();

      if (bootstrap) {
        ephemeral_key_base64 = bootstrap.ephemeral_key;
        pq_ciphertext_base64 = bootstrap.pq_ciphertext;
        pq_key_id_value = bootstrap.pq_key_id;
        x3dh_version_value = bootstrap.x3dh_version;
        one_time_prekey_id_value = bootstrap.one_time_prekey_id;
        signed_prekey_id_value = bootstrap.signed_prekey_id;
      }
    }

    const recovery_keys = resolve_recovery_lane_keys(
      bundle,
      ratchet.get_bootstrap(),
    );

    if (!can_seal_recovery_lane(recovery_keys)) {
      if (import.meta.env.DEV) {
        console.warn(
          "no recovery lane keys for recipient; routing via PGP fallback",
        );
      }

      return null;
    }

    if (pq_ciphertext_base64 && !recovery_lane_is_post_quantum(recovery_keys)) {
      if (import.meta.env.DEV) {
        console.warn(
          "recovery lane lacks a post-quantum key; routing via PGP fallback",
        );
      }

      return null;
    }

    const { message: encrypted, message_key } =
      await ratchet.encrypt_returning_message_key(body);

    let recovery: RecoveryLaneData;

    try {
      recovery = await seal_recovery_lane(
        array_to_base64(message_key),
        conversation_id,
        vault.ratchet_identity_public,
        recovery_keys,
      );
    } catch {
      throw new RecoveryLaneUnavailableError(recipient_email);
    } finally {
      zero_uint8_array(message_key);
    }

    await save_ratchet_state(ratchet);

    const sync_key_send = await get_sync_encryption_key();

    if (sync_key_send) {
      try {
        await sync_ratchet_to_server(ratchet, sync_key_send);
      } catch {
        /* best-effort */
      }
    }

    const recipient_data: RatchetRecipientData = {
      ephemeral_key: ephemeral_key_base64,
      header: encrypted.header,
      ciphertext: encrypted.ciphertext,
      nonce: encrypted.nonce,
      recovery,
    };

    if (pq_ciphertext_base64 && pq_key_id_value !== undefined) {
      recipient_data.pq_ciphertext = pq_ciphertext_base64;
      recipient_data.pq_key_id = pq_key_id_value;
    }

    if (x3dh_version_value !== undefined) {
      recipient_data.x3dh_v = x3dh_version_value;
    }

    if (
      x3dh_version_value === X3DH_VERSION_ONE_TIME_BOUND &&
      one_time_prekey_id_value !== undefined
    ) {
      recipient_data.opk_id = one_time_prekey_id_value;

      if (signed_prekey_id_value !== undefined) {
        recipient_data.spk_id = signed_prekey_id_value;
      }
    }

    return recipient_data;
  } catch (err) {
    if (
      err instanceof RecoveryLaneUnavailableError ||
      err instanceof RecipientKeyUntrustedError ||
      err instanceof KeyPinUnavailableError ||
      is_crypto_module_load_error(err)
    ) {
      throw err;
    }

    if (import.meta.env.DEV) {
      console.warn("ratchet encrypt failed; routing via PGP fallback", err);
    }

    return null;
  }
}

export type PostQuantumRecipientStatus =
  "supported" | "unsupported" | "downgraded" | "untrusted";

type SessionPostQuantumStatus = "signed" | "unsigned" | "renewing";

async function session_post_quantum_status(
  bootstrap: BootstrapData,
  recipient_username: string,
  recipient_email: string,
): Promise<SessionPostQuantumStatus> {
  const identity = await fetch_ratchet_identity(
    recipient_username,
    recipient_email,
  ).catch(() => null);

  if (!identity) return "unsigned";

  if (
    bootstrap.recipient_identity_key !== identity.kem_identity_key ||
    session_lane_lacks_advertised_pq_key(
      bootstrap,
      identity.pq_kem_public_key,
    ) ||
    (session_uses_unsigned_pq_prekey(bootstrap) &&
      !!identity.pq_kem_public_key)
  ) {
    return "renewing";
  }

  if (
    !bootstrap.pq_ciphertext ||
    bootstrap.pq_key_id !== PQ_IDENTITY_KEY_ID ||
    bootstrap.recipient_pq_identity_key !== identity.pq_kem_public_key
  ) {
    return "unsigned";
  }

  return (await is_pq_identity_signed_by_owner(
    identity,
    recipient_username,
    recipient_email,
  ))
    ? "signed"
    : "unsigned";
}

export async function recipient_post_quantum_status(
  sender_email: string,
  recipient_email: string,
  recipient_username: string,
): Promise<PostQuantumRecipientStatus> {
  const conversation_id = await derive_conversation_id(
    sender_email,
    recipient_email,
  );

  const existing = await load_ratchet_state(conversation_id);
  const bootstrap = existing?.get_bootstrap();

  if (bootstrap) {
    const session_status = await session_post_quantum_status(
      bootstrap,
      recipient_username,
      recipient_email,
    );

    if (session_status !== "renewing") {
      return session_status === "signed" ? "supported" : "unsupported";
    }
  }

  const bundle = await fetch_prekey_bundle(recipient_username, recipient_email);

  if (!bundle) return "unsupported";

  const verification = await verify_recipient_bundle(
    bundle,
    recipient_username,
    recipient_email,
  );

  if (is_bundle_untrusted(verification)) {
    await flag_recipient_untrusted(
      (recipient_email ?? recipient_username).toLowerCase(),
    );

    return "untrusted";
  }

  if (bundle_supports_pq(bundle)) {
    return !is_bundle_verification_rejected(verification) &&
      bundle_has_signed_pq_identity(
        bundle,
        signature_covers_pq_identity(verification),
      )
      ? "supported"
      : "unsupported";
  }

  return bundle_is_downgraded(bundle) ? "downgraded" : "unsupported";
}

export async function recipient_supports_post_quantum(
  sender_email: string,
  recipient_email: string,
  recipient_username: string,
): Promise<boolean> {
  const status = await recipient_post_quantum_status(
    sender_email,
    recipient_email,
    recipient_username,
  );

  return status === "supported";
}
