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
import { zero_uint8_array } from "@/services/crypto/secure_memory";
import { get_recipient_public_key } from "../api/keys";
import { array_to_base64, base64_to_array } from "./base64";
import { DoubleRatchet, type BootstrapData } from "./double_ratchet";
import { type EncryptedVault } from "./key_manager";
import { verify_ratchet_prekey_bundle } from "./key_manager_pgp";
import { derive_conversation_id, get_sync_encryption_key, run_serialized_for_conversation } from "./ratchet_conversation";
import { check_and_pin_identity } from "./ratchet_identity_pin";
import { detect_identity_pin_drift, fetch_prekey_bundle, fetch_ratchet_identity } from "./ratchet_prekey_bundle";
import { can_seal_recovery_lane, seal_recovery_lane, type RecoveryLaneData, type RecoveryLaneRecipientKeys } from "./ratchet_recovery_lane";
import { merge_ratchet_states } from "./ratchet_state_merge";
import { load_ratchet_state, save_ratchet_state } from "./ratchet_state_store";
import { load_ratchet_from_server, sync_ratchet_to_server } from "./ratchet_sync";
import { RecoveryLaneUnavailableError, type RatchetRecipientData } from "./ratchet_types";
import { bundle_supports_pq, perform_x3dh_sender, type PrekeyBundle } from "./x3dh";

async function adopt_server_state_before_send(
  conversation_id: string,
  ratchet: DoubleRatchet,
): Promise<void> {
  try {
    const sync_key = await get_sync_encryption_key();

    if (!sync_key) {
      return;
    }

    const server = await load_ratchet_from_server(conversation_id, sync_key);

    if (!server) {
      return;
    }

    const local = await ratchet.serialize();
    const remote = await server.ratchet.serialize();

    ratchet.adopt_state(merge_ratchet_states(local, remote));
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

function resolve_recovery_lane_keys(
  bundle: PrekeyBundle | null,
  bootstrap: BootstrapData | null,
): RecoveryLaneRecipientKeys | null {
  const identity_public =
    bundle?.kem_identity_key ?? bootstrap?.recipient_identity_key ?? "";

  if (!identity_public) return null;

  const pq_identity_public = bundle?.kem_identity_key
    ? (bundle.pq_kem_public_key ?? "")
    : (bootstrap?.recipient_pq_identity_key ?? "");

  return { identity_public, pq_identity_public };
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

        if (identity) {
          if (bootstrap?.recipient_identity_key !== identity.kem_identity_key) {
            recipient_changed = true;
          }
        } else {
          bundle = await fetch_prekey_bundle(
            recipient_username,
            recipient_email,
          );

          if (
            bundle &&
            bootstrap?.recipient_identity_key !== bundle.kem_identity_key
          ) {
            recipient_changed = true;
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

      const owner_key = await get_recipient_public_key(
        recipient_username,
        recipient_email,
      );
      const bundle_verdict = await verify_ratchet_prekey_bundle(
        bundle.signed_prekey_signature,
        bundle.kem_identity_key,
        bundle.signed_prekey,
        owner_key.data?.public_key ?? null,
        bundle.pq_kem_public_key ?? null,
      );

      if (bundle_verdict === "tampered") {
        if (import.meta.env.DEV) {
          console.warn(
            "ratchet prekey bundle signature failed verification; routing via PGP",
          );
        }

        return null;
      }

      const identity_pin_status = await check_and_pin_identity(
        (recipient_email ?? recipient_username).toLowerCase(),
        bundle.kem_identity_key,
        bundle_verdict === "verified",
      );

      if (identity_pin_status === "drift") {
        if (import.meta.env.DEV) {
          console.warn(
            "ratchet recipient identity key differs from the pinned value; routing via PGP",
          );
        }

        return null;
      }

      const sender_identity_jwk: JsonWebKey = JSON.parse(
        vault.ratchet_identity_key,
      );

      const x3dh_result = await perform_x3dh_sender(
        sender_identity_jwk,
        bundle,
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

        ratchet.set_bootstrap({
          ephemeral_key: ephemeral_key_base64,
          pq_ciphertext: pq_ciphertext_base64,
          pq_key_id: pq_key_id_value,
          sender_identity_key: vault.ratchet_identity_public,
          recipient_identity_key: bundle.kem_identity_key,
          recipient_pq_identity_key: bundle.pq_kem_public_key ?? undefined,
        });
      } finally {
        x3dh_result.shared_secret.fill(0);
      }
    } else {
      const bootstrap = ratchet.get_bootstrap();

      if (bootstrap) {
        ephemeral_key_base64 = bootstrap.ephemeral_key;
        pq_ciphertext_base64 = bootstrap.pq_ciphertext;
        pq_key_id_value = bootstrap.pq_key_id;
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

    return recipient_data;
  } catch (err) {
    if (err instanceof RecoveryLaneUnavailableError) {
      throw err;
    }

    if (import.meta.env.DEV) {
      console.warn("ratchet encrypt failed; routing via PGP fallback", err);
    }

    return null;
  }
}

export async function recipient_supports_post_quantum(
  sender_email: string,
  recipient_email: string,
  recipient_username: string,
): Promise<boolean> {
  const conversation_id = await derive_conversation_id(
    sender_email,
    recipient_email,
  );

  const existing = await load_ratchet_state(conversation_id);
  const bootstrap = existing?.get_bootstrap();

  if (bootstrap) {
    return Boolean(bootstrap.pq_ciphertext);
  }

  const bundle = await fetch_prekey_bundle(recipient_username, recipient_email);

  if (!bundle) return false;

  return bundle_supports_pq(bundle);
}
