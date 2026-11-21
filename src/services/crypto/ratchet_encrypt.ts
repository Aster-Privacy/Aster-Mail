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
import {
  extract_username_from_email,
  get_recipient_public_key,
} from "../api/keys";

import {
  account_sender_identity,
  type SenderIdentity,
} from "./address_sender_identity";
import { array_to_base64, base64_to_array } from "./base64";
import { DoubleRatchet, type BootstrapData } from "./double_ratchet";
import { type EncryptedVault } from "./key_manager";
import { verify_ratchet_prekey_bundle_detailed } from "./key_manager_pgp";
import {
  is_signed_ratchet_keys_required,
  is_strict_recipient_bundle_enforced,
} from "./crypto_enforcement_policy";
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
  resolve_recipient_bundle,
  resolve_recipient_identity,
  type DirectoryTrust,
  type ResolvedDirectoryEntry,
} from "./address_identity_directory";
import {
  check_and_pin_identity,
  check_owner_key_pin,
  flag_recipient_untrusted,
  read_peer_downgrade_floor,
  is_recipient_bundle_accepted,
  is_recipient_flagged_untrusted,
  is_identity_confirmed_by_user,
  lookup_identity_pin_record,
  trust_recipient_keys,
  type OwnerKeyPinStatus,
} from "./ratchet_identity_pin";
import { get_vault_from_memory } from "./memory_key_store";
import { detect_identity_pin_drift } from "./ratchet_prekey_bundle";
import {
  can_seal_recovery_lane,
  recovery_lane_is_post_quantum,
  recovery_lane_transcript,
  seal_recovery_lane,
  RecoveryLaneSenderKeyMissingError,
  type RecoveryLaneData,
  type RecoveryLaneRecipientKeys,
  type RecoveryLaneTranscript,
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
  RecipientPinUnreadableError,
  RecipientKeyUntrustedError,
  RecoveryLaneUnavailableError,
  type RatchetRecipientData,
} from "./ratchet_types";
import {
  bundle_has_signed_pq_identity,
  bundle_is_downgraded,
  minimum_x3dh_version,
  perform_x3dh_sender,
  restrict_bundle_to_signed_pq_key,
  PQ_IDENTITY_KEY_ID,
  X3DH_VERSION_LEGACY,
  X3DH_VERSION_ONE_TIME_BOUND,
  type PrekeyBundle,
} from "./x3dh";

import { start_with_fresh_bundle_once } from "./one_time_prekey_watch";
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
  sender_identity?: SenderIdentity,
  required_recipient_identity?: string,
  local_bundle?: PrekeyBundle,
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
      sender_identity ?? account_sender_identity(vault),
      required_recipient_identity,
      local_bundle,
    ),
  );
}

async function healed_sender_identity(
  sender_identity: SenderIdentity,
): Promise<SenderIdentity | null> {
  try {
    const { ensure_ratchet_keys } = await import("./ensure_ratchet_keys");

    if (!(await ensure_ratchet_keys())) return null;
  } catch {
    return null;
  }

  const vault = get_vault_from_memory();
  const reloaded = vault ? account_sender_identity(vault) : null;

  if (
    !reloaded ||
    reloaded.identity_public !== sender_identity.identity_public ||
    reloaded.identity_jwk === sender_identity.identity_jwk
  ) {
    return null;
  }

  return reloaded;
}

async function seal_lane_with_heal(
  message_key: string,
  conversation_id: string,
  sender_identity: SenderIdentity,
  recipient: RecoveryLaneRecipientKeys,
  transcript: RecoveryLaneTranscript,
): Promise<RecoveryLaneData | undefined> {
  const seal = (identity_jwk: string): Promise<RecoveryLaneData> =>
    seal_recovery_lane(
      message_key,
      conversation_id,
      sender_identity.identity_public,
      recipient,
      identity_jwk,
      transcript,
    );

  try {
    return await seal(sender_identity.identity_jwk);
  } catch (error) {
    if (!(error instanceof RecoveryLaneSenderKeyMissingError)) throw error;
  }

  const healed = await healed_sender_identity(sender_identity);

  if (!healed) return undefined;

  try {
    return await seal(healed.identity_jwk);
  } catch (error) {
    if (error instanceof RecoveryLaneSenderKeyMissingError) return undefined;

    throw error;
  }
}

type BundleVerification = Awaited<
  ReturnType<typeof verify_ratchet_prekey_bundle_detailed>
> & {
  owner_pin: OwnerKeyPinStatus;
  flagged_untrusted: boolean;
  accepted_by_user: boolean;
  owner_public_key: string | null;
  self_bound?: boolean;
};

async function address_entry_owner_pin(
  pin_id: string,
  bundle: PrekeyBundle,
  trust: DirectoryTrust,
): Promise<OwnerKeyPinStatus> {
  if (trust === "replaced") return "changed";
  if (trust === "endorsed") return "ok";

  const pin = await lookup_identity_pin_record(pin_id).catch(() => null);

  if (pin && pin !== "unreadable" && pin.verified === true) return "ok";

  return (await is_identity_confirmed_by_user(pin_id, bundle.kem_identity_key))
    ? "ok"
    : "first";
}

async function verify_address_entry_bundle(
  bundle: PrekeyBundle,
  pin_id: string,
  trust: DirectoryTrust,
): Promise<BundleVerification> {
  const flagged_untrusted = await is_recipient_flagged_untrusted(pin_id);

  if (trust === "invalid") {
    return {
      verdict: "tampered",
      format: "v2",
      strict: true,
      owner_pin: "unknown",
      flagged_untrusted,
      accepted_by_user: await is_recipient_bundle_accepted(pin_id, bundle),
      owner_public_key: null,
    };
  }

  const owner_pin = await address_entry_owner_pin(pin_id, bundle, trust);

  return {
    verdict: "verified",
    format: "v2",
    strict: trust !== "entry" || owner_pin === "ok",
    owner_pin,
    flagged_untrusted,
    accepted_by_user: false,
    owner_public_key: null,
    self_bound: true,
  };
}

async function verify_recipient_bundle(
  bundle: PrekeyBundle,
  recipient_username: string,
  recipient_email: string,
  trust: DirectoryTrust = "account",
): Promise<BundleVerification> {
  if (trust !== "account" && trust !== "downgraded") {
    return verify_address_entry_bundle(
      bundle,
      (recipient_email ?? recipient_username).toLowerCase(),
      trust,
    );
  }

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

  return {
    ...verification,
    owner_pin: trust === "downgraded" ? "changed" : owner_pin,
    flagged_untrusted,
    accepted_by_user,
    owner_public_key,
  };
}

export async function is_identity_bound_by_current_bundle(
  peer_email: string,
  identity_key: string,
): Promise<boolean> {
  const peer = peer_email.trim().toLowerCase();
  const username = extract_username_from_email(peer);

  if (!username || !identity_key) return false;

  try {
    const resolved = await resolve_recipient_bundle(username, peer);
    const bundle = resolved?.entry ?? null;

    if (!resolved || !bundle || bundle.kem_identity_key !== identity_key) {
      return false;
    }

    const verification = await verify_recipient_bundle(
      bundle,
      username,
      peer,
      resolved.trust,
    );

    return (
      verification.verdict === "verified" &&
      verification.strict &&
      (verification.owner_pin === "ok" || verification.owner_pin === "first")
    );
  } catch {
    return false;
  }
}

function is_own_published_bundle(
  bundle: PrekeyBundle,
  vault: EncryptedVault,
): boolean {
  return (
    Boolean(vault.ratchet_identity_public) &&
    Boolean(vault.ratchet_signed_prekey_public) &&
    bundle.kem_identity_key === vault.ratchet_identity_public &&
    bundle.signed_prekey === vault.ratchet_signed_prekey_public &&
    (bundle.pq_kem_public_key ?? null) ===
      (vault.ratchet_pq_identity_public ?? null)
  );
}

async function refresh_own_identity_pins(
  pin_id: string,
  bundle: PrekeyBundle,
  verification: BundleVerification,
): Promise<BundleVerification> {
  await trust_recipient_keys(
    pin_id,
    bundle.kem_identity_key,
    verification.owner_public_key,
    bundle,
  );

  return {
    ...verification,
    owner_pin: verification.owner_public_key ? "ok" : verification.owner_pin,
    flagged_untrusted: false,
    accepted_by_user: verification.verdict === "tampered",
  };
}

async function settle_own_bundle(
  pin_id: string,
  bundle: PrekeyBundle,
  verification: BundleVerification,
  vault: EncryptedVault | null,
): Promise<BundleVerification> {
  if (!vault || !is_own_published_bundle(bundle, vault)) return verification;
  if (!is_bundle_untrusted(verification)) return verification;

  return refresh_own_identity_pins(pin_id, bundle, verification).catch(
    () => verification,
  );
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
      verification.verdict !== "verified") ||
    (is_signed_ratchet_keys_required() &&
      !signature_covers_pq_identity(verification))
  );
}

function signature_covers_pq_identity(
  verification: BundleVerification,
): boolean {
  return (
    verification.verdict === "verified" &&
    (verification.strict || verification.self_bound === true)
  );
}

async function is_pq_identity_signed_by_owner(
  published: PrekeyBundle,
  recipient_username: string,
  recipient_email: string,
  trust: DirectoryTrust = "account",
): Promise<boolean> {
  try {
    const verification = await verify_recipient_bundle(
      published,
      recipient_username,
      recipient_email,
      trust,
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

function session_lacks_signed_pq_key(
  bootstrap: BootstrapData | null,
): boolean {
  return (
    !!bootstrap &&
    (!bootstrap.pq_ciphertext || bootstrap.pq_key_id !== PQ_IDENTITY_KEY_ID)
  );
}

function session_below_minimum_x3dh(bootstrap: BootstrapData | null): boolean {
  return (
    !!bootstrap &&
    (bootstrap.x3dh_version ?? X3DH_VERSION_LEGACY) < minimum_x3dh_version()
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

interface StartedSenderSession {
  ratchet: DoubleRatchet;
  ephemeral_key: string;
  pq_ciphertext?: string;
  pq_key_id?: number;
  x3dh_version?: number;
  one_time_prekey_id?: number;
  signed_prekey_id?: string;
  one_time_prekey_withheld: boolean;
}

async function start_sender_session(
  conversation_id: string,
  sender_identity: SenderIdentity,
  bundle: PrekeyBundle,
  remembered_x3dh_version: number | null = null,
  pq_identity_signed: boolean | null = null,
): Promise<StartedSenderSession> {
  const sender_identity_jwk: JsonWebKey = JSON.parse(
    sender_identity.identity_jwk,
  );
  const x3dh_result = await perform_x3dh_sender(
    sender_identity_jwk,
    pq_identity_signed === null
      ? bundle
      : restrict_bundle_to_signed_pq_key(bundle, pq_identity_signed),
    remembered_x3dh_version,
  );

  try {
    const ratchet = await DoubleRatchet.init_sender(
      x3dh_result.shared_secret,
      base64_to_array(bundle.signed_prekey),
      conversation_id,
      bundle.kem_identity_key,
    );
    const ephemeral_key = array_to_base64(x3dh_result.ephemeral_public_key);
    const pq_ciphertext =
      x3dh_result.pq_ciphertext && x3dh_result.pq_key_id !== undefined
        ? array_to_base64(x3dh_result.pq_ciphertext)
        : undefined;
    const pq_key_id = pq_ciphertext ? x3dh_result.pq_key_id : undefined;
    const x3dh_version =
      x3dh_result.x3dh_version > X3DH_VERSION_LEGACY
        ? x3dh_result.x3dh_version
        : undefined;

    const bootstrap_data: BootstrapData = {
      ephemeral_key,
      pq_ciphertext,
      pq_key_id,
      sender_identity_key: sender_identity.identity_public,
      recipient_identity_key: bundle.kem_identity_key,
      recipient_pq_identity_key: bundle.pq_kem_public_key ?? undefined,
      x3dh_version,
    };

    let one_time_prekey_id: number | undefined;
    let signed_prekey_id: string | undefined;

    if (
      x3dh_result.x3dh_version === X3DH_VERSION_ONE_TIME_BOUND &&
      x3dh_result.one_time_prekey_id !== undefined
    ) {
      one_time_prekey_id = x3dh_result.one_time_prekey_id;
      signed_prekey_id = x3dh_result.signed_prekey_id;
      bootstrap_data.one_time_prekey_id = one_time_prekey_id;

      if (signed_prekey_id !== undefined) {
        bootstrap_data.signed_prekey_id = signed_prekey_id;
      }
    }

    ratchet.set_bootstrap(bootstrap_data);

    return {
      ratchet,
      ephemeral_key,
      pq_ciphertext,
      pq_key_id,
      x3dh_version,
      one_time_prekey_id,
      signed_prekey_id,
      one_time_prekey_withheld: x3dh_result.one_time_prekey_withheld === true,
    };
  } finally {
    x3dh_result.shared_secret.fill(0);
  }
}

async function start_session_with_fresh_bundle(
  conversation_id: string,
  sender_identity: SenderIdentity,
  bundle: PrekeyBundle,
  covers_pq: boolean,
  remembered_version: number | null,
  bundle_peer: string,
  refetch: () => Promise<{ entry: PrekeyBundle } | null>,
): Promise<{ started: StartedSenderSession; bundle: PrekeyBundle }> {
  const outcome = await start_with_fresh_bundle_once(
    bundle,
    (candidate) =>
      start_sender_session(
        conversation_id,
        sender_identity,
        restrict_bundle_to_signed_pq_key(candidate, covers_pq),
        remembered_version,
      ),
    async () => (await refetch())?.entry ?? null,
    (first, fresh) =>
      first.kem_identity_key === fresh.kem_identity_key &&
      first.signed_prekey === fresh.signed_prekey &&
      first.pq_kem_public_key === fresh.pq_kem_public_key,
    (candidate) => candidate.one_time_prekey_withheld,
    (candidate) => Boolean(candidate.ec_one_time_prekey),
  );

  if (outcome.withheld) {
    record_peer_identity_event(bundle_peer, "downgraded");
  }

  return { started: outcome.started, bundle: outcome.bundle };
}

async function encrypt_for_ratchet_recipient_unlocked(
  conversation_id: string,
  recipient_email: string,
  recipient_username: string,
  body: string,
  vault: EncryptedVault,
  sender_identity: SenderIdentity | null,
  required_recipient_identity?: string,
  local_bundle?: PrekeyBundle,
): Promise<RatchetRecipientData | null> {
  try {
    if (!sender_identity) {
      return null;
    }

    let ratchet = await load_ratchet_state(conversation_id);

    if (
      ratchet &&
      required_recipient_identity &&
      ratchet.get_bootstrap()?.recipient_identity_key !==
        required_recipient_identity
    ) {
      ratchet = null;
    }

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
    let resolved_bundle: ResolvedDirectoryEntry<PrekeyBundle> | null = null;

    if (ratchet) {
      const bootstrap = ratchet.get_bootstrap();

      const sender_changed =
        !bootstrap ||
        bootstrap.sender_identity_key !== sender_identity.identity_public;

      let recipient_changed = false;

      if (!sender_changed && local_bundle) {
        bundle = local_bundle;
        recipient_changed =
          bootstrap?.recipient_identity_key !==
            local_bundle.kem_identity_key ||
          session_lane_lacks_advertised_pq_key(
            bootstrap,
            local_bundle.pq_kem_public_key,
          );
      } else if (!sender_changed) {
        const session_identity = bootstrap?.recipient_identity_key;
        const identity = await resolve_recipient_identity(
          recipient_username,
          recipient_email,
          session_identity,
        );

        if (!identity) {
          resolved_bundle = await resolve_recipient_bundle(
            recipient_username,
            recipient_email,
            session_identity,
          );
          bundle = resolved_bundle?.entry ?? null;
        }

        const advertised = identity?.entry ?? bundle;

        if (advertised) {
          recipient_changed =
            session_identity !== advertised.kem_identity_key ||
            session_lane_lacks_advertised_pq_key(
              bootstrap,
              advertised.pq_kem_public_key,
            );

          if (
            !recipient_changed &&
            session_lacks_signed_pq_key(bootstrap) &&
            advertised.pq_kem_public_key
          ) {
            recipient_changed = await is_pq_identity_signed_by_owner(
              advertised,
              recipient_username,
              recipient_email,
              identity?.trust ?? resolved_bundle?.trust,
            );
          }

          if (!recipient_changed && is_signed_ratchet_keys_required()) {
            recipient_changed =
              session_below_minimum_x3dh(bootstrap) ||
              !(await is_pq_identity_signed_by_owner(
                advertised,
                recipient_username,
                recipient_email,
                identity?.trust ?? resolved_bundle?.trust,
              ));
          }
        }
      }

      if (sender_changed || recipient_changed) {
        ratchet = null;
      }
    }

    if (!ratchet && local_bundle) {
      bundle = local_bundle;

      const started = await start_sender_session(
        conversation_id,
        sender_identity,
        local_bundle,
        null,
        true,
      );

      ratchet = started.ratchet;
      ephemeral_key_base64 = started.ephemeral_key;
      pq_ciphertext_base64 = started.pq_ciphertext;
      pq_key_id_value = started.pq_key_id;
      x3dh_version_value = started.x3dh_version;
      one_time_prekey_id_value = started.one_time_prekey_id;
      signed_prekey_id_value = started.signed_prekey_id;
    } else if (!ratchet) {
      if (!resolved_bundle) {
        resolved_bundle = await resolve_recipient_bundle(
          recipient_username,
          recipient_email,
        );
      }

      bundle = resolved_bundle?.entry ?? null;

      if (!resolved_bundle || !bundle) {
        return null;
      }

      if (
        required_recipient_identity &&
        bundle.kem_identity_key !== required_recipient_identity
      ) {
        return null;
      }

      if (!resolved_bundle.scoped) {
        await detect_identity_pin_drift(
          (recipient_email ?? recipient_username).toLowerCase(),
          bundle.kem_identity_key,
        );
      }

      const bundle_peer = (recipient_email ?? recipient_username).toLowerCase();

      const bundle_verification = await settle_own_bundle(
        bundle_peer,
        bundle,
        await verify_recipient_bundle(
          bundle,
          recipient_username,
          recipient_email,
          resolved_bundle.trust,
        ),
        vault,
      );

      record_bundle_verification(bundle_peer, bundle_verification);

      const advertises_pq = Boolean(bundle.pq_kem_public_key);
      const covers_pq = signature_covers_pq_identity(bundle_verification);
      const signs_pq = bundle_has_signed_pq_identity(bundle, covers_pq);

      if (is_bundle_untrusted(bundle_verification)) {
        await flag_recipient_untrusted(bundle_peer);
        throw new RecipientKeyUntrustedError(recipient_email);
      }

      const floor = await read_peer_downgrade_floor(bundle_peer);

      if (floor === "unreadable") {
        throw new RecipientPinUnreadableError(bundle_peer);
      }

      const pq_downgraded =
        bundle_is_downgraded(bundle) ||
        (!advertises_pq && floor.pq_seen) ||
        (!signs_pq && floor.pq_signed_seen);

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
        covers_pq && bundle_verification.owner_pin === "ok",
        advertises_pq,
        resolved_bundle.scoped,
        covers_pq ? bundle.x3dh_max_version : null,
        signs_pq,
        bundle_verification.signed_at ?? null,
      );

      if (identity_pin_status === "drift") {
        await flag_recipient_untrusted(bundle_peer);
        throw new RecipientKeyUntrustedError(recipient_email);
      }

      if (identity_pin_status === "unreadable") {
        throw new RecipientPinUnreadableError(bundle_peer);
      }

      if (identity_pin_status === "unknown") {
        throw new KeyPinUnavailableError(bundle_peer);
      }

      let started: StartedSenderSession;

      const pinned_floor = await read_peer_downgrade_floor(bundle_peer);

      if (pinned_floor === "unreadable") {
        throw new RecipientPinUnreadableError(bundle_peer);
      }

      const remembered_version = pinned_floor.x3dh_version;

      const outcome = await start_session_with_fresh_bundle(
        conversation_id,
        sender_identity,
        bundle,
        covers_pq,
        remembered_version,
        bundle_peer,
        () => resolve_recipient_bundle(recipient_username, recipient_email),
      );

      started = outcome.started;
      bundle = outcome.bundle;

      ratchet = started.ratchet;
      ephemeral_key_base64 = started.ephemeral_key;
      pq_ciphertext_base64 = started.pq_ciphertext;
      pq_key_id_value = started.pq_key_id;
      x3dh_version_value = started.x3dh_version;
      one_time_prekey_id_value = started.one_time_prekey_id;
      signed_prekey_id_value = started.signed_prekey_id;
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

    let recovery: RecoveryLaneData | undefined;

    try {
      recovery = await seal_lane_with_heal(
        array_to_base64(message_key),
        conversation_id,
        sender_identity,
        recovery_keys,
        recovery_lane_transcript(encrypted, Date.now()),
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
      ...(recovery ? { recovery } : {}),
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
  const resolved = await resolve_recipient_identity(
    recipient_username,
    recipient_email,
    bootstrap.recipient_identity_key,
  ).catch(() => null);

  if (!resolved) return "unsigned";

  const identity = resolved.entry;

  if (
    bootstrap.recipient_identity_key !== identity.kem_identity_key ||
    session_lane_lacks_advertised_pq_key(
      bootstrap,
      identity.pq_kem_public_key,
    ) ||
    (session_lacks_signed_pq_key(bootstrap) &&
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
    resolved.trust,
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

  const resolved = await resolve_recipient_bundle(
    recipient_username,
    recipient_email,
  );
  const bundle = resolved?.entry ?? null;

  if (!resolved || !bundle) return "unsupported";

  const verification = await settle_own_bundle(
    (recipient_email ?? recipient_username).toLowerCase(),
    bundle,
    await verify_recipient_bundle(
      bundle,
      recipient_username,
      recipient_email,
      resolved.trust,
    ),
    get_vault_from_memory(),
  );

  if (is_bundle_untrusted(verification)) {
    await flag_recipient_untrusted(
      (recipient_email ?? recipient_username).toLowerCase(),
    );

    return "untrusted";
  }

  const covers_pq = signature_covers_pq_identity(verification);

  if (
    !is_bundle_verification_rejected(verification) &&
    bundle_has_signed_pq_identity(bundle, covers_pq)
  ) {
    return "supported";
  }

  const vouched =
    verification.verdict === "verified" || verification.verdict === "legacy";

  if (!vouched) return "unsupported";

  const peer = (recipient_email ?? recipient_username).toLowerCase();
  const signs_pq = bundle_has_signed_pq_identity(bundle, covers_pq);

  if (bundle_is_downgraded(bundle)) return "downgraded";
  if (signs_pq) return "unsupported";

  const floor = await read_peer_downgrade_floor(peer);

  if (floor === "unreadable") throw new RecipientPinUnreadableError(peer);

  return floor.pq_signed_seen ? "downgraded" : "unsupported";
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
