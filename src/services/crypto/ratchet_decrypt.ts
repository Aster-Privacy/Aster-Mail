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
  address_receiver_key_sets,
  canonical_address_form,
} from "./address_identity_entry";
import { is_own_address_identity_key } from "./address_sender_identity";
import { base64_to_array, canonical_base64_to_array } from "./base64";
import {
  DoubleRatchet,
  InvalidRatchetStateError,
  is_skip_limit_error,
  SkipLimitError,
  type EncryptedMessage,
  type SerializedState,
} from "./double_ratchet";
import { type EncryptedVault } from "./key_manager";
import { type RatchetKeySet } from "./key_manager_core";
import {
  fetch_from_escrow,
  fetch_verified_from_escrow,
  upload_to_escrow,
} from "./message_escrow";
import {
  derive_conversation_id,
  get_sync_encryption_key,
  run_serialized_for_conversation,
} from "./ratchet_conversation";
import {
  jwk_to_ratchet_keypair,
  resolve_pq_identity_secret,
} from "./ratchet_keys";
import {
  get_cached_ratchet_plaintext,
  get_cached_ratchet_sender_key,
  mark_cached_downgraded,
  read_cached_opening,
  set_cached_ratchet_plaintext,
  type PlaintextBinding,
} from "./ratchet_plaintext_cache";
import { detect_identity_pin_drift } from "./ratchet_prekey_bundle";
import {
  first_contact_standing,
  is_first_contact_unconfirmed,
  is_identity_confirmed_by_user,
  lookup_owner_key_pin,
  note_first_contact_identity,
  note_account_bound_opening,
  read_peer_downgrade_floor,
} from "./ratchet_identity_pin";
import { is_identity_bound_by_current_bundle } from "./ratchet_encrypt";
import {
  clear_unauthenticated_plaintext,
  clear_unconfirmed_sender_plaintext,
  is_unauthenticated_plaintext,
  mark_unauthenticated_plaintext,
  is_unconfirmed_sender_plaintext,
  mark_downgraded_plaintext,
  mark_unconfirmed_sender_plaintext,
  record_message_sender_identity,
  record_peer_identity_event,
  type SenderIdentityStatus,
} from "./ratchet_verification_status";
import { claim_rotation_notice } from "./rotation_notice";
import { claim_bootstrap, type BootstrapClaim } from "./bootstrap_replay";
import {
  claim_lane_nonce,
  lookup_lane_sender_pin,
  pin_lane_sender,
} from "./ratchet_lane_sender_pin";
import { recovery_lane_verdict } from "./recovery_lane_trust";
import {
  open_recovery_lane,
  open_unauthenticated_recovery_lane,
  recovery_lane_sent_at,
  recovery_lane_transcript,
  type RecoveryLaneBinding,
} from "./ratchet_recovery_lane";
import {
  decrypt_with_peer_session,
  peer_conversation_ids,
} from "./ratchet_peer_session_fallback";
import {
  archive_ratchet_state,
  load_archived_ratchet_states,
  load_ratchet_state,
  save_ratchet_state,
} from "./ratchet_state_store";
import { record_received_chain } from "./ratchet_received_chains";
import {
  archived_session_supersedes,
  local_received_chains,
  merge_skipped_message_keys,
  server_replacement_supersedes,
} from "./ratchet_state_merge";
import {
  load_ratchet_from_server,
  sync_ratchet_to_server,
} from "./ratchet_sync";
import {
  type RatchetEnvelope,
  type RatchetRecipientData,
} from "./ratchet_types";
import { adopt_refreshed_vault, fetch_refreshed_vault } from "./vault_refresh";
import { recover_ratchet_keys_from_history } from "./vault_key_recovery";
import { is_authenticated_ratchet_enforced } from "./crypto_enforcement_policy";
import {
  standing_confirms,
  standing_is_retired,
  type SenderKeyStanding,
} from "./sender_key_retirement";
import {
  authenticate_sender_identity,
  accept_endorsed_sender_rotation,
  check_sender_identity_continuity,
  has_received_sender_identity,
  is_sender_identity_published,
  note_message_sender_identity,
  sender_key_standing,
  type SenderIdentityContinuity,
  SenderIdentityUnverifiedError,
  AccountBindingRefusedError,
} from "./sender_identity_authentication";
import {
  compute_signed_prekey_id,
  minimum_x3dh_version,
  receive_handshake,
  X3DH_VERSION_ACCOUNT_BOUND,
  X3DH_READ_VERSION_MAX,
  X3DH_VERSION_MAX,
  X3DH_VERSION_ONE_TIME_BOUND,
  type HandshakeBinding,
} from "./x3dh";
import { fingerprint_from_hex } from "./handshake_keys/bundle_signing";
import {
  discard_used_one_time_prekey,
  published_owner_fingerprint,
  responder_binding,
} from "./ratchet_receive_io";

import { zero_uint8_array } from "@/services/crypto/secure_memory";
import { ignore_error } from "@/lib/ignore_error";
import { get_sender_trust_context } from "@/lib/sender_trust_store";
import { same_address_ignoring_dots } from "@/utils/address_dots";

interface ResolvedRecipientData {
  address: string;
  data: RatchetRecipientData;
}

export function has_case_duplicates(keys: string[]): boolean {
  return new Set(keys.map((key) => key.toLowerCase())).size < keys.length;
}

function resolve_recipient_data(
  our_email: string,
  envelope: RatchetEnvelope,
): ResolvedRecipientData | null {
  const our_lower = our_email.toLowerCase();
  const direct = envelope.recipients[our_lower];

  if (direct) return { address: our_lower, data: direct };

  for (const key of Object.keys(envelope.recipients)) {
    if (key.toLowerCase() === our_lower) {
      return { address: key, data: envelope.recipients[key] };
    }
  }

  for (const key of Object.keys(envelope.recipients)) {
    if (same_address_ignoring_dots(key, our_email)) {
      return { address: key, data: envelope.recipients[key] };
    }
  }

  return null;
}

const MAX_ALIAS_RECIPIENT_ATTEMPTS = 8;

function alias_recipient_candidates(
  our_email: string,
  sender_email: string,
  envelope: RatchetEnvelope,
): string[] {
  const our_lower = our_email.toLowerCase();
  const sender_lower = sender_email.toLowerCase();

  return Object.keys(envelope.recipients)
    .filter((key) => {
      const lower = key.toLowerCase();

      return lower !== our_lower && lower !== sender_lower;
    })
    .slice(0, MAX_ALIAS_RECIPIENT_ATTEMPTS);
}

function build_dedupe_key(
  message_id: string,
  data: RatchetRecipientData | null,
): string {
  if (!data) return message_id;

  return `${message_id}:${data.header.dh_public}:${data.header.message_number}`;
}

interface RatchetDecryptAttempt {
  plaintext: string | null;
  error: unknown;
}

const MAX_SKIP_LIMITED_MESSAGES = 1024;
const skip_limit_hits = new Set<string>();
const skip_limited_messages = new Map<string, string>();

function note_session_decrypt_failure(
  message_key: string,
  error: unknown,
): void {
  if (message_key && is_skip_limit_error(error)) {
    skip_limit_hits.add(message_key);
  }
}

function remember_skip_limited_message(
  dedupe_key: string,
  conversation_id: string,
): void {
  skip_limited_messages.delete(dedupe_key);
  skip_limited_messages.set(dedupe_key, conversation_id);

  while (skip_limited_messages.size > MAX_SKIP_LIMITED_MESSAGES) {
    const oldest = skip_limited_messages.keys().next();

    if (oldest.done) return;

    skip_limited_messages.delete(oldest.value);
  }
}

function forget_skip_limited_conversation(conversation_id: string): void {
  for (const [key, conversation] of skip_limited_messages) {
    if (conversation === conversation_id) {
      skip_limited_messages.delete(key);
    }
  }
}

export function reset_skip_limited_messages(): void {
  skip_limit_hits.clear();
  skip_limited_messages.clear();
}

const MAX_ESCROW_UPGRADE_MISSES = 2048;
const escrow_upgrade_misses = new Set<string>();

function note_escrow_upgrade_miss(dedupe_key: string): void {
  escrow_upgrade_misses.add(dedupe_key);

  while (escrow_upgrade_misses.size > MAX_ESCROW_UPGRADE_MISSES) {
    const oldest = escrow_upgrade_misses.values().next();

    if (oldest.done) return;

    escrow_upgrade_misses.delete(oldest.value);
  }
}

async function prefer_escrowed_plaintext(
  plaintext: string,
  dedupe_key: string,
  message_id: string | undefined,
  binding: PlaintextBinding,
): Promise<string> {
  if (!is_unauthenticated_plaintext(plaintext)) return plaintext;
  if (escrow_upgrade_misses.has(dedupe_key)) return plaintext;

  let escrowed: string | null;

  try {
    escrowed = await fetch_verified_from_escrow(dedupe_key, binding);
  } catch (error) {
    if (!(error instanceof Error && error.name === "EscrowUnavailableError")) {
      note_escrow_upgrade_miss(dedupe_key);
    }

    return plaintext;
  }

  if (escrowed === null) {
    note_escrow_upgrade_miss(dedupe_key);

    return plaintext;
  }

  clear_unauthenticated_plaintext(escrowed, dedupe_key);

  if (is_unconfirmed_sender_plaintext(escrowed)) {
    record_message_sender_identity(message_id ?? dedupe_key, "unverified");
  } else {
    note_message_sender_identity(message_id ?? dedupe_key);
  }

  return escrowed;
}

interface RatchetSessionPlaintext {
  plaintext: string;
  sender_identity_key: string | null;
  archived: boolean;
  weak_bootstrap: boolean;
  account_unbound: boolean;
  first_contact: boolean;
  key_standing?: SenderKeyStanding;
  session_bound?: boolean;
}

export function escrow_account_bound(
  session_bound: boolean | undefined,
  unconfirmed_sender: boolean,
  downgraded: boolean,
): boolean {
  return session_bound === true && !unconfirmed_sender && !downgraded;
}

async function opening_key_standing(
  sender_email: string,
  identity_key: string | null,
  sent_at: number | undefined,
): Promise<SenderKeyStanding> {
  return sender_key_standing(sender_email, identity_key ?? "", sent_at).catch(
    () => "unavailable" as const,
  );
}

type OpeningStanding = "clean" | "downgraded" | "unknown";

function account_bound_floor_key(account_email: string): string {
  return (
    canonical_address_form(account_email) || account_email.trim().toLowerCase()
  );
}

function is_unbound_handshake(x3dh_v: number | undefined): boolean {
  return (
    (x3dh_v ?? 1) < Math.min(X3DH_VERSION_ACCOUNT_BOUND, X3DH_READ_VERSION_MAX)
  );
}

function valid_server_time(sent_at: number | undefined): number | null {
  return typeof sent_at === "number" && Number.isFinite(sent_at) && sent_at > 0
    ? sent_at
    : null;
}

export function opening_sets_floor(
  identity_status: SenderIdentityStatus,
  key_standing: SenderKeyStanding | undefined,
): boolean {
  return identity_status === "verified" && standing_confirms(key_standing ?? null);
}

async function judge_opening(
  account_email: string,
  sender_email: string,
  account_unbound: boolean,
  sent_at: number | undefined,
): Promise<OpeningStanding> {
  if (!account_unbound) return "clean";
  if (is_own_sender_address(sender_email, account_email)) return "clean";

  const floor = await read_peer_downgrade_floor(
    sender_email.trim().toLowerCase(),
  ).catch(() => "unreadable" as const);

  if (floor === "unreadable") return "unknown";
  if (Object.keys(floor.bound_at).length === 0) return "clean";

  const scope = account_bound_floor_key(account_email);

  if (!scope) return "unknown";

  const bound_at =
    floor.bound_at[scope] ?? Math.min(...Object.values(floor.bound_at));

  const server_time = valid_server_time(sent_at);

  if (server_time === null) return "unknown";

  return server_time > bound_at ? "downgraded" : "clean";
}

function is_own_sender_address(
  sender_email: string,
  our_email: string,
): boolean {
  const sender = sender_email.trim();

  if (sender.length === 0) return false;
  if (same_address_ignoring_dots(sender, our_email.trim())) return true;

  return get_sender_trust_context().own_addresses.some((address) =>
    same_address_ignoring_dots(sender, address),
  );
}

async function sender_continuity(
  our_email: string,
  sender_email: string,
  sender_identity_key: string,
  vault: EncryptedVault,
  session_bound: boolean,
): Promise<SenderIdentityContinuity> {
  if (
    session_bound &&
    is_own_session_sender(our_email, sender_email, sender_identity_key, vault)
  ) {
    return "known";
  }

  return check_sender_identity_continuity(
    sender_email,
    sender_identity_key,
  ).catch(() => "unreadable" as const);
}

function is_own_session_sender(
  our_email: string,
  sender_email: string,
  sender_identity_key: string,
  vault: EncryptedVault,
): boolean {
  return (
    is_own_sender_address(sender_email, our_email) &&
    (is_own_identity_key(vault, sender_identity_key) ||
      is_own_address_identity_key(vault, [sender_email], sender_identity_key))
  );
}

async function is_first_contact(
  our_email: string,
  sender_email: string,
  sender_identity_key: string,
  vault: EncryptedVault,
): Promise<boolean> {
  if (
    is_own_session_sender(our_email, sender_email, sender_identity_key, vault)
  ) {
    return false;
  }

  const continuity = await sender_continuity(
    our_email,
    sender_email,
    sender_identity_key,
    vault,
    true,
  );

  if (continuity === "new") return true;
  if (continuity !== "known") return false;

  const standing = await first_contact_standing(
    sender_email.trim().toLowerCase(),
    sender_identity_key,
  );

  if (standing === "confirmed") return false;
  if (standing !== "absent") return true;

  return !(await has_received_sender_identity(
    sender_email,
    sender_identity_key,
  ).catch(() => false));
}

async function is_weak_bootstrap_session(
  conversation_id: string,
): Promise<boolean> {
  const ratchet = await load_ratchet_state(conversation_id).catch(() => null);

  return ratchet?.is_weak_bootstrap() ?? false;
}

async function bind_session_sender_identity_key(
  conversation_id: string,
  sender_identity_key: string,
): Promise<void> {
  const ratchet = await load_ratchet_state(conversation_id).catch(() => null);

  if (!ratchet || ratchet.get_remote_identity_key()) return;

  ratchet.set_remote_identity_key(sender_identity_key);
  await save_ratchet_state(ratchet);
}

type OwnerClaimStanding = "none" | "matched" | "refused" | "unknown";

async function owner_claim_standing(
  data: RatchetRecipientData | null,
  sender_email: string,
): Promise<OwnerClaimStanding> {
  if (!data?.ephemeral_key) return "none";
  if ((data.x3dh_v ?? 0) < X3DH_VERSION_ACCOUNT_BOUND) return "none";
  if (!data.ifp || !fingerprint_from_hex(data.ifp)) return "refused";

  const peer = sender_email.trim().toLowerCase();

  try {
    const pin = await lookup_owner_key_pin(peer);

    if (pin === "unreadable" || pin?.conflict) return "unknown";
    if (pin) return pin.fingerprint === data.ifp ? "matched" : "refused";

    const published = await published_owner_fingerprint(peer);

    if (published === null) return "unknown";

    return published === data.ifp ? "matched" : "refused";
  } catch {
    return "unknown";
  }
}

async function settle_cached_plaintext(
  our_email: string,
  account_email: string,
  data: RatchetRecipientData | null,
  cached: string,
  dedupe_key: string,
  message_id: string | undefined,
  sender_email: string,
  vault: EncryptedVault,
  binding: PlaintextBinding,
  sent_at?: number,
): Promise<RatchetDecryptAttempt> {
  const claim = await owner_claim_standing(data, sender_email);

  if (claim === "refused") {
    record_message_sender_identity(message_id ?? dedupe_key, "unverified");

    return {
      plaintext: null,
      error: new AccountBindingRefusedError(sender_email.trim().toLowerCase()),
    };
  }

  const plaintext = await prefer_escrowed_plaintext(
    cached,
    dedupe_key,
    message_id,
    binding,
  );
  const opening = await read_cached_opening(dedupe_key, binding);
  const judged: OpeningStanding = opening?.downgraded
    ? "downgraded"
    : await judge_opening(
        account_email,
        sender_email,
        opening?.account_unbound === true,
        sent_at ?? opening?.sent_at,
      );
  const standing: OpeningStanding = judged;

  if (standing !== "clean") {
    if (standing === "downgraded") {
      await mark_cached_downgraded(dedupe_key, binding);
      mark_downgraded_plaintext(plaintext, dedupe_key);
    } else {
      mark_unconfirmed_sender_plaintext(plaintext, dedupe_key);
    }

    record_message_sender_identity(message_id ?? dedupe_key, "unverified");

    return { plaintext, error: null };
  }

  if (
    is_unconfirmed_sender_plaintext(plaintext) &&
    !is_unauthenticated_plaintext(plaintext)
  ) {
    const judged_key = await get_cached_ratchet_sender_key(dedupe_key, binding);
    const continuity = judged_key
      ? await sender_continuity(
          our_email,
          sender_email,
          judged_key,
          vault,
          true,
        )
      : "changed";

    if (
      continuity === "known" &&
      judged_key &&
      !(await is_weak_bootstrap_session(binding.conversation_id)) &&
      !(await is_first_contact_unconfirmed(
        sender_email.trim().toLowerCase(),
        judged_key,
      )) &&
      standing_confirms(
        await opening_key_standing(sender_email, judged_key, sent_at),
      )
    ) {
      clear_unconfirmed_sender_plaintext(plaintext, dedupe_key);
      record_message_sender_identity(
        message_id ?? dedupe_key,
        await authenticate_sender_identity(
          sender_email,
          judged_key,
          sent_at,
        ).catch(() => "unverified" as const),
      );
      await set_cached_ratchet_plaintext(
        dedupe_key,
        plaintext,
        false,
        binding,
        false,
        judged_key ?? undefined,
      );
    }
  }

  return { plaintext, error: null };
}

async function attempt_ratchet_decrypt(
  our_email: string,
  account_email: string,
  sender_email: string,
  envelope: RatchetEnvelope,
  vault: EncryptedVault,
  data: RatchetRecipientData | null,
  message_id?: string,
  sent_at?: number,
): Promise<RatchetDecryptAttempt> {
  const dedupe_key = message_id
    ? build_dedupe_key(message_id, data)
    : undefined;
  const conversation_id = await derive_conversation_id(our_email, sender_email);
  const binding: PlaintextBinding = { sender: sender_email, conversation_id };

  if (dedupe_key) {
    const cached = await get_cached_ratchet_plaintext(dedupe_key, binding);

    if (cached !== null) {
      return settle_cached_plaintext(
        our_email,
        account_email,
        data,
        cached,
        dedupe_key,
        message_id,
        sender_email,
        vault,
        binding,
        sent_at,
      );
    }
  }

  return run_serialized_for_conversation(conversation_id, async () => {
    if (dedupe_key) {
      const cached = await get_cached_ratchet_plaintext(dedupe_key, binding);

      if (cached !== null) {
        return settle_cached_plaintext(
          our_email,
          account_email,
          data,
          cached,
          dedupe_key,
          message_id,
          sender_email,
          vault,
          binding,
          sent_at,
        );
      }
    }

    let decrypted: RatchetSessionPlaintext | null = null;
    let decrypt_error: unknown = null;
    const skip_limited =
      dedupe_key !== undefined && skip_limited_messages.has(dedupe_key);

    if (dedupe_key) {
      skip_limit_hits.delete(dedupe_key);
    }

    if (data && skip_limited) {
      decrypt_error = new SkipLimitError();
    } else if (data) {
      try {
        decrypted = await decrypt_ratchet_for_recipient(
          our_email,
          account_email,
          sender_email,
          data,
          envelope.sender_identity_key,
          vault,
          dedupe_key ?? "",
          sent_at,
        );
      } catch (err) {
        decrypt_error = err;

        if (err instanceof SenderIdentityUnverifiedError && message_id) {
          record_message_sender_identity(message_id, "unverified");
        }
      }
    }

    if (dedupe_key && skip_limit_hits.delete(dedupe_key) && !decrypted) {
      remember_skip_limited_message(dedupe_key, conversation_id);
    }

    if (decrypted !== null) {
      forget_skip_limited_conversation(conversation_id);
    }

    if (decrypted !== null) {
      let plaintext = decrypted.plaintext;
      const lane_plaintext = is_unauthenticated_plaintext(plaintext);
      const bound_identity_key = lane_plaintext
        ? null
        : decrypted.sender_identity_key;
      const identity_key = bound_identity_key ?? envelope.sender_identity_key;
      const first_contact =
        decrypted.first_contact ||
        (!lane_plaintext &&
          (await is_first_contact(
            our_email,
            sender_email,
            identity_key,
            vault,
          )));
      let continuity = await sender_continuity(
        our_email,
        sender_email,
        identity_key,
        vault,
        bound_identity_key !== null,
      );

      if (
        continuity === "changed" &&
        (await accept_endorsed_sender_rotation(
          sender_email,
          identity_key,
          !lane_plaintext,
        ).catch(() => false))
      ) {
        continuity = lane_plaintext ? "superseded" : "known";
      }

      const retired_key = standing_is_retired(decrypted.key_standing ?? null);
      const directory_unconfirmed =
        decrypted.key_standing !== undefined &&
        !standing_confirms(decrypted.key_standing);

      if (retired_key && continuity === "known") continuity = "new";

      const first_contact_noted =
        !directory_unconfirmed &&
        (first_contact && !lane_plaintext
          ? await note_first_contact_identity(
              sender_email.trim().toLowerCase(),
              identity_key,
            )
          : true);

      const sender_status = first_contact_noted
        ? await authenticate_sender_identity(
            sender_email,
            identity_key,
            sent_at,
          ).catch(() => "unverified" as const)
        : ("unverified" as const);

      if (
        !lane_plaintext &&
        !bound_identity_key &&
        !decrypted.archived &&
        continuity === "known"
      ) {
        await bind_session_sender_identity_key(conversation_id, identity_key);
      }

      void detect_identity_pin_drift(sender_email.toLowerCase(), identity_key);

      if (
        continuity === "changed" &&
        claim_rotation_notice(sender_email, identity_key)
      ) {
        record_peer_identity_event(sender_email, "rotated");
      }

      if (continuity === "unreadable") {
        record_peer_identity_event(sender_email, "unreadable");
      }

      if (dedupe_key && lane_plaintext) {
        plaintext = await prefer_escrowed_plaintext(
          plaintext,
          dedupe_key,
          message_id,
          binding,
        );
      }

      const unauthenticated = is_unauthenticated_plaintext(plaintext);
      const from_escrow = lane_plaintext && !unauthenticated;
      const standing = await judge_opening(
        account_email,
        sender_email,
        decrypted.account_unbound,
        sent_at,
      );
      const downgraded = standing === "downgraded";
      const unconfirmed_sender =
        standing !== "clean" ||
        directory_unconfirmed ||
        (from_escrow
          ? is_unconfirmed_sender_plaintext(plaintext)
          : continuity !== "known" ||
            decrypted.weak_bootstrap ||
            first_contact);
      const opening = {
        downgraded,
        account_unbound: decrypted.account_unbound,
        sent_at,
      };

      if (downgraded) {
        mark_downgraded_plaintext(plaintext, dedupe_key ?? message_id ?? "");
        record_peer_identity_event(sender_email, "downgraded");
      }

      if (
        first_contact &&
        !from_escrow &&
        lane_plaintext &&
        !directory_unconfirmed
      ) {
        await note_first_contact_identity(
          sender_email.trim().toLowerCase(),
          identity_key,
        );
      }

      if (unconfirmed_sender) {
        mark_unconfirmed_sender_plaintext(
          plaintext,
          dedupe_key ?? message_id ?? "",
        );
      }

      if (unauthenticated || unconfirmed_sender) {
        record_message_sender_identity(
          message_id ?? dedupe_key ?? "",
          "unverified",
        );
      } else {
        record_message_sender_identity(
          message_id ?? dedupe_key ?? "",
          sender_status,
        );
      }

      if (dedupe_key && unauthenticated) {
        await set_cached_ratchet_plaintext(
          dedupe_key,
          plaintext,
          true,
          binding,
          false,
          undefined,
          opening,
        );
      } else if (dedupe_key && from_escrow) {
        await set_cached_ratchet_plaintext(
          dedupe_key,
          plaintext,
          false,
          binding,
          unconfirmed_sender,
          undefined,
          opening,
        );
      } else if (dedupe_key) {
        await set_cached_ratchet_plaintext(
          dedupe_key,
          plaintext,
          false,
          binding,
          unconfirmed_sender,
          identity_key,
          opening,
        );
        void upload_to_escrow(
          dedupe_key,
          plaintext,
          binding,
          unconfirmed_sender,
          downgraded,
          {
            account_unbound: decrypted.account_unbound,
            account_bound: escrow_account_bound(
              decrypted.session_bound,
              unconfirmed_sender,
              downgraded,
            ),
            sent_at,
          },
        ).catch((caught) =>
          ignore_error(
            "services/crypto/ratchet_decrypt:attempt_ratchet_decrypt",
            caught,
          ),
        );
      }

      return { plaintext, error: null };
    }

    if (decrypt_error instanceof AccountBindingRefusedError) {
      return { plaintext: null, error: decrypt_error };
    }

    if (dedupe_key) {
      const escrowed = await fetch_from_escrow(dedupe_key, binding).catch(
        () => null,
      );

      if (escrowed !== null) {
        const escrowed_standing: OpeningStanding = escrowed.downgraded
          ? "downgraded"
          : await judge_opening(
              account_email,
              sender_email,
              escrowed.account_unbound,
              sent_at ?? escrowed.sent_at,
            );

        if (escrowed_standing !== "clean") {
          clear_unauthenticated_plaintext(escrowed.plaintext, dedupe_key);

          if (escrowed_standing === "downgraded") {
            await mark_cached_downgraded(dedupe_key, binding);
            mark_downgraded_plaintext(escrowed.plaintext, dedupe_key);
          } else {
            mark_unconfirmed_sender_plaintext(escrowed.plaintext, dedupe_key);
          }

          record_message_sender_identity(
            message_id ?? dedupe_key,
            "unverified",
          );

          return { plaintext: escrowed.plaintext, error: null };
        }

        if (escrowed.verified && !escrowed.unconfirmed_sender) {
          clear_unauthenticated_plaintext(escrowed.plaintext, dedupe_key);
          note_message_sender_identity(message_id ?? dedupe_key);
        } else if (escrowed.verified) {
          clear_unauthenticated_plaintext(escrowed.plaintext, dedupe_key);
          record_message_sender_identity(
            message_id ?? dedupe_key,
            "unverified",
          );
        } else {
          mark_unauthenticated_plaintext(escrowed.plaintext, dedupe_key);
          record_message_sender_identity(
            message_id ?? dedupe_key,
            "unverified",
          );
        }

        return { plaintext: escrowed.plaintext, error: null };
      }
    }

    return { plaintext: null, error: decrypt_error };
  });
}

export async function decrypt_ratchet_message(
  our_email: string,
  sender_email: string,
  envelope: RatchetEnvelope,
  vault: EncryptedVault,
  message_id?: string,
  sent_at?: number,
): Promise<string | null> {
  if (has_case_duplicates(Object.keys(envelope.recipients))) {
    return null;
  }

  const our_match = resolve_recipient_data(our_email, envelope);
  const our_data = our_match?.data ?? null;

  const primary = await attempt_ratchet_decrypt(
    our_match?.address ?? our_email,
    our_email,
    sender_email,
    envelope,
    vault,
    our_data,
    message_id,
    sent_at,
  );

  if (primary.plaintext !== null) return primary.plaintext;
  if (primary.error instanceof AccountBindingRefusedError) throw primary.error;

  if (!our_data && sender_email.toLowerCase() !== our_email.toLowerCase()) {
    const alias_self_match = resolve_recipient_data(sender_email, envelope);

    if (alias_self_match) {
      const fallback = await attempt_ratchet_decrypt(
        alias_self_match.address,
        our_email,
        sender_email,
        envelope,
        vault,
        alias_self_match.data,
        message_id,
        sent_at,
      );

      if (fallback.plaintext !== null) return fallback.plaintext;
      if (fallback.error instanceof AccountBindingRefusedError) {
        throw fallback.error;
      }
    }
  }

  if (!our_data) {
    for (const address of alias_recipient_candidates(
      our_email,
      sender_email,
      envelope,
    )) {
      const alias_data = envelope.recipients[address];

      if (!alias_data) continue;

      try {
        const alias_attempt = await attempt_ratchet_decrypt(
          address,
          our_email,
          sender_email,
          envelope,
          vault,
          alias_data,
          message_id,
          sent_at,
        );

        if (alias_attempt.plaintext !== null) return alias_attempt.plaintext;
        if (alias_attempt.error instanceof AccountBindingRefusedError) {
          throw alias_attempt.error;
        }
      } catch (caught) {
        if (caught instanceof AccountBindingRefusedError) throw caught;
        ignore_error(
          "services/crypto/ratchet_decrypt:decrypt_ratchet_message",
          caught,
        );
      }
    }
  }

  if (primary.error) {
    throw primary.error;
  }

  return null;
}

function key_set_fingerprint(keys: RatchetKeySet): string {
  return `${keys.ratchet_identity_public}:${keys.ratchet_signed_prekey_public}:${keys.ratchet_pq_identity_public ?? ""}`;
}

function is_own_identity_key(
  vault: EncryptedVault,
  identity_key: string | undefined,
): boolean {
  if (!identity_key) return false;
  if (vault.ratchet_identity_public === identity_key) return true;

  return (vault.ratchet_previous_keys ?? []).some(
    (previous) => previous.ratchet_identity_public === identity_key,
  );
}

function receiver_key_sets(
  vault: EncryptedVault,
  address = "",
): RatchetKeySet[] {
  const sets: RatchetKeySet[] = [];

  if (
    vault.ratchet_identity_key &&
    vault.ratchet_identity_public &&
    vault.ratchet_signed_prekey &&
    vault.ratchet_signed_prekey_public
  ) {
    sets.push({
      ratchet_identity_key: vault.ratchet_identity_key,
      ratchet_identity_public: vault.ratchet_identity_public,
      ratchet_signed_prekey: vault.ratchet_signed_prekey,
      ratchet_signed_prekey_public: vault.ratchet_signed_prekey_public,
      ratchet_pq_identity_key: vault.ratchet_pq_identity_key,
      ratchet_pq_identity_public: vault.ratchet_pq_identity_public,
      ratchet_pq_identity_seed: vault.ratchet_pq_identity_seed,
    });
  }

  for (const previous of vault.ratchet_previous_keys ?? []) {
    if (
      previous.ratchet_identity_key &&
      previous.ratchet_identity_public &&
      previous.ratchet_signed_prekey &&
      previous.ratchet_signed_prekey_public
    ) {
      sets.push(previous);
    }
  }

  if (sets.length > 0 && address) {
    sets.push(...address_receiver_key_sets(vault, address));
  }

  return sets;
}

async function order_key_sets_for_signed_prekey(
  key_sets: RatchetKeySet[],
  data: RatchetRecipientData,
): Promise<RatchetKeySet[]> {
  if (
    (data.x3dh_v ?? 0) < X3DH_VERSION_ONE_TIME_BOUND ||
    typeof data.spk_id !== "string" ||
    key_sets.length < 2
  ) {
    return key_sets;
  }

  const matching: RatchetKeySet[] = [];
  const others: RatchetKeySet[] = [];

  for (const keys of key_sets) {
    let matches = false;

    try {
      matches =
        !!keys.ratchet_signed_prekey_public &&
        (await compute_signed_prekey_id(
          base64_to_array(keys.ratchet_signed_prekey_public),
        )) === data.spk_id;
    } catch {
      matches = false;
    }

    (matches ? matching : others).push(keys);
  }

  return [...matching, ...others];
}

interface RecoveryLaneCandidate {
  identity_jwk: string;
  identity_public: string;
  pq_identity_secret: string;
  pq_identity_public: string;
}

function recovery_lane_key_candidates(
  vault: EncryptedVault,
  address: string,
): RecoveryLaneCandidate[] {
  const candidates: RecoveryLaneCandidate[] = [];

  const push = (source: {
    ratchet_identity_key?: string;
    ratchet_identity_public?: string;
    ratchet_pq_identity_key?: string;
    ratchet_pq_identity_public?: string;
    ratchet_pq_identity_seed?: string;
  }) => {
    if (source.ratchet_identity_key && source.ratchet_identity_public) {
      candidates.push({
        identity_jwk: source.ratchet_identity_key,
        identity_public: source.ratchet_identity_public,
        pq_identity_secret:
          resolve_pq_identity_secret(
            source.ratchet_pq_identity_key,
            source.ratchet_pq_identity_seed,
          ) ?? "",
        pq_identity_public: source.ratchet_pq_identity_public ?? "",
      });
    }
  };

  push(vault);

  for (const previous of vault.ratchet_previous_keys ?? []) {
    push(previous);
  }

  if (address) {
    for (const derived of address_receiver_key_sets(vault, address)) {
      push(derived);
    }
  }

  return candidates;
}

interface RecoveredLanePlaintext {
  plaintext: string;
  binding: RecoveryLaneBinding;
  opened_with: string;
  conversation_id: string;
  snonce: string;
  sent_at: number;
}

async function try_recovery_lanes(
  data: RatchetRecipientData,
  conversation_ids: string[],
  sender_identity_key: string,
  vault: EncryptedVault,
  address: string,
): Promise<RecoveredLanePlaintext | null> {
  for (const lane_conversation_id of conversation_ids) {
    const recovered = await try_recovery_lane(
      data,
      lane_conversation_id,
      sender_identity_key,
      vault,
      address,
    );

    if (recovered !== null) return recovered;
  }

  return null;
}

async function try_recovery_lane(
  data: RatchetRecipientData,
  conversation_id: string,
  sender_identity_key: string,
  vault: EncryptedVault,
  address: string,
): Promise<RecoveredLanePlaintext | null> {
  const opened = await open_recovery_lane_message_key(
    data,
    conversation_id,
    sender_identity_key,
    vault,
    address,
  );

  if (opened === null) return null;

  const message_key = base64_to_array(opened.message_key);

  try {
    return {
      plaintext: await DoubleRatchet.decrypt_with_message_key(
        {
          header: data.header,
          ciphertext: data.ciphertext,
          nonce: data.nonce,
        },
        message_key,
      ),
      binding: opened.binding,
      opened_with: opened.opened_with,
      conversation_id,
      snonce: opened.binding === "none" ? "" : (data.recovery?.snonce ?? ""),
      sent_at:
        opened.binding === "transcript" && data.recovery
          ? (recovery_lane_sent_at(data.recovery) ?? 0)
          : 0,
    };
  } catch {
    return null;
  } finally {
    zero_uint8_array(message_key);
  }
}

async function open_recovery_lane_message_key(
  data: RatchetRecipientData,
  conversation_id: string,
  sender_identity_key: string,
  vault: EncryptedVault,
  address: string,
): Promise<{
  message_key: string;
  binding: RecoveryLaneBinding;
  opened_with: string;
} | null> {
  if (!data.recovery) return null;

  const candidates = recovery_lane_key_candidates(vault, address);

  const ordered = [
    ...candidates.filter((c) => c.identity_public === data.recovery?.rid),
    ...candidates.filter((c) => c.identity_public !== data.recovery?.rid),
  ];

  const sent_at = recovery_lane_sent_at(data.recovery);
  const bindings: RecoveryLaneBinding[] =
    sent_at === null ? ["legacy", "none"] : ["transcript", "legacy", "none"];

  for (const binding of bindings) {
    for (const candidate of ordered) {
      const own_keys = {
        identity_jwk: candidate.identity_jwk,
        identity_public: candidate.identity_public,
        pq_identity_secret: candidate.pq_identity_secret,
      };
      const message_key =
        binding === "none"
          ? await open_unauthenticated_recovery_lane(
              data.recovery,
              conversation_id,
              sender_identity_key,
              own_keys,
              candidate.pq_identity_public,
            )
          : await open_recovery_lane(
              data.recovery,
              conversation_id,
              sender_identity_key,
              own_keys,
              candidate.pq_identity_public,
              binding === "transcript" && sent_at !== null
                ? recovery_lane_transcript(data, sent_at)
                : null,
            );

      if (message_key !== null) {
        return { message_key, binding, opened_with: candidate.identity_public };
      }
    }
  }

  return null;
}

const UNCOMPRESSED_P256_POINT_LEN = 65;

function is_uncompressed_p256_point(raw: Uint8Array | null): raw is Uint8Array {
  return (
    raw !== null &&
    raw.length === UNCOMPRESSED_P256_POINT_LEN &&
    raw[0] === 0x04
  );
}

async function is_sender_owner_fingerprint(
  peer: string,
  fingerprint: string,
): Promise<boolean> {
  const pin = await lookup_owner_key_pin(peer);

  if (pin === "unreadable" || pin?.conflict) return false;
  if (pin) return pin.fingerprint === fingerprint;

  return (await published_owner_fingerprint(peer)) === fingerprint;
}

export async function sender_account_binding(
  data: RatchetRecipientData,
  sender_email: string,
  keys: RatchetKeySet,
): Promise<HandshakeBinding | null> {
  if ((data.x3dh_v ?? 0) < X3DH_VERSION_ACCOUNT_BOUND) return null;

  const peer = sender_email.trim().toLowerCase();
  const initiator = data.ifp ? fingerprint_from_hex(data.ifp) : null;

  if (
    !initiator ||
    !data.ifp ||
    !(await is_sender_owner_fingerprint(peer, data.ifp))
  ) {
    throw new AccountBindingRefusedError(peer);
  }

  return responder_binding(initiator, keys);
}

async function init_receiver_from_bootstrap(
  data: RatchetRecipientData,
  sender_identity_key: string,
  keys: RatchetKeySet,
  conversation_id: string,
  sender_email: string,
): Promise<DoubleRatchet | null> {
  if (
    !keys.ratchet_identity_key ||
    !keys.ratchet_signed_prekey ||
    !keys.ratchet_signed_prekey_public ||
    !data.ephemeral_key
  ) {
    return null;
  }

  const account_binding = await sender_account_binding(
    data,
    sender_email,
    keys,
  );

  const receiver_identity_jwk: JsonWebKey = JSON.parse(
    keys.ratchet_identity_key,
  );
  const receiver_signed_prekey_jwk: JsonWebKey = JSON.parse(
    keys.ratchet_signed_prekey,
  );

  const sender_identity_raw = canonical_base64_to_array(sender_identity_key);
  const sender_ephemeral_raw = canonical_base64_to_array(data.ephemeral_key);
  const pq_ciphertext_raw = data.pq_ciphertext
    ? canonical_base64_to_array(data.pq_ciphertext)
    : null;

  if (
    !is_uncompressed_p256_point(sender_identity_raw) ||
    !is_uncompressed_p256_point(sender_ephemeral_raw) ||
    (data.pq_ciphertext && !pq_ciphertext_raw)
  ) {
    return null;
  }

  const pq_input =
    pq_ciphertext_raw && data.pq_key_id !== undefined
      ? {
          pq_ciphertext: pq_ciphertext_raw,
          pq_key_id: data.pq_key_id,
        }
      : null;

  const peer = sender_email.toLowerCase();
  const floor = await read_peer_downgrade_floor(peer);
  const floor_unreadable = floor === "unreadable";
  const pq_missing =
    !pq_input &&
    !!keys.ratchet_pq_identity_public &&
    !floor_unreadable &&
    floor.pq_seen;

  if (pq_missing) {
    record_peer_identity_event(sender_email, "downgraded");
  }

  const weak_bootstrap =
    floor_unreadable ||
    pq_missing ||
    is_below_remembered_x3dh(data.x3dh_v, floor.x3dh_version);

  const handshake = await receive_handshake(
    receiver_identity_jwk,
    receiver_signed_prekey_jwk,
    sender_identity_raw,
    sender_ephemeral_raw,
    pq_input,
    resolve_pq_identity_secret(
      keys.ratchet_pq_identity_key,
      keys.ratchet_pq_identity_seed,
    ),
    data.x3dh_v,
    data.opk_id,
    account_binding,
  );
  const shared_secret = handshake.shared_secret;

  const own_keypair = await jwk_to_ratchet_keypair(
    keys.ratchet_signed_prekey,
    keys.ratchet_signed_prekey_public,
  );

  const ratchet = await DoubleRatchet.init_receiver(
    shared_secret,
    own_keypair,
    conversation_id,
    sender_identity_key,
    handshake.session_binding,
  );

  shared_secret.fill(0);
  own_keypair.secret_key.fill(0);

  if (weak_bootstrap) ratchet.mark_weak_bootstrap();

  return ratchet;
}

function is_below_remembered_x3dh(
  received: number | undefined,
  remembered: number,
): boolean {
  return (
    (received ?? 1) <
    Math.max(Math.min(remembered, X3DH_VERSION_MAX), minimum_x3dh_version())
  );
}

async function snapshot_ratchet_state(
  ratchet: DoubleRatchet,
): Promise<SerializedState> {
  return JSON.parse(
    JSON.stringify(await ratchet.serialize()),
  ) as SerializedState;
}

async function carry_forward_skipped_keys(
  ratchet: DoubleRatchet,
  previous: SerializedState,
): Promise<void> {
  const previous_skipped = previous.state.skipped_message_keys ?? [];
  const previous_chains = local_received_chains(previous.state);

  if (previous_skipped.length === 0 && previous_chains.length === 0) return;

  const current = await snapshot_ratchet_state(ratchet);

  current.state.skipped_message_keys = merge_skipped_message_keys(
    previous_skipped,
    current.state.skipped_message_keys ?? [],
  );
  current.state.received_chains = (current.state.received_chains ?? []).reduce(
    (chains, chain) =>
      record_received_chain(chains, chain.dh_public, chain.next),
    previous_chains,
  );

  ratchet.adopt_state(current);
}

async function bootstrap_may_replace_session(
  our_email: string,
  sender_email: string,
  vault: EncryptedVault,
  established_identity_key: string | null,
  bootstrap_identity_key: string | null,
  identity_status: SenderIdentityStatus,
): Promise<boolean> {
  if (!bootstrap_identity_key) return false;

  if (
    established_identity_key !== null &&
    established_identity_key === bootstrap_identity_key
  ) {
    return true;
  }

  const continuity = await sender_continuity(
    our_email,
    sender_email,
    bootstrap_identity_key,
    vault,
    true,
  );

  if (continuity === "known") return true;

  if (continuity === "new") {
    if (identity_status !== "verified") return false;
    if (established_identity_key === null) return true;
  } else if (continuity !== "changed") {
    return false;
  }

  const published = await is_sender_identity_published(
    sender_email,
    bootstrap_identity_key,
  ).catch(() => false);

  if (!published) return false;

  const owner_pin = await lookup_owner_key_pin(
    sender_email.trim().toLowerCase(),
  );

  if (owner_pin === "unreadable") return false;
  if (owner_pin === null) return true;

  return is_identity_bound_by_current_bundle(
    sender_email,
    bootstrap_identity_key,
  );
}

function session_already_on_chain(
  snapshot: SerializedState,
  dh_public: string,
): boolean {
  return (
    snapshot.state.dh_remote_public === dh_public ||
    snapshot.state.skipped_message_keys.some(
      (skipped) => skipped.dh_public === dh_public,
    )
  );
}

async function decrypt_ratchet_for_recipient(
  our_email: string,
  account_email: string,
  sender_email: string,
  data: RatchetRecipientData,
  sender_identity_key: string,
  vault: EncryptedVault,
  message_key = "",
  sent_at?: number,
): Promise<RatchetSessionPlaintext | null> {
  const key_sets = receiver_key_sets(vault, our_email);

  if (key_sets.length === 0) {
    const refreshed = await fetch_refreshed_vault();

    if (!refreshed || receiver_key_sets(refreshed.vault).length === 0) {
      return null;
    }

    await adopt_refreshed_vault(refreshed);

    return decrypt_ratchet_for_recipient(
      our_email,
      account_email,
      sender_email,
      data,
      sender_identity_key,
      refreshed.vault,
      message_key,
      sent_at,
    );
  }

  const conversation_id = await derive_conversation_id(our_email, sender_email);

  const is_first_chain_bootstrap =
    !!data.ephemeral_key && data.header.previous_chain_length === 0;

  const message: EncryptedMessage = {
    header: data.header,
    ciphertext: data.ciphertext,
    nonce: data.nonce,
  };

  const loaded_ratchet = await load_ratchet_state(conversation_id).catch(
    (error: unknown) => {
      if (error instanceof InvalidRatchetStateError) return null;
      throw error;
    },
  );
  const loaded_snapshot = loaded_ratchet
    ? await snapshot_ratchet_state(loaded_ratchet)
    : null;
  const established_identity_key =
    loaded_ratchet?.get_remote_identity_key() ?? null;

  let ratchet = loaded_ratchet;
  let ratchet_origin: "loaded" | "archived" | "replacement" | "bootstrap" =
    "loaded";
  let identity_status: SenderIdentityStatus = "unverified";
  let first_contact = false;

  let plaintext: string | null = null;
  let bootstrap_primary = false;
  const open_bootstrap = (
    candidate: DoubleRatchet,
    source: EncryptedVault,
    keys: RatchetKeySet,
  ): void => {
    bootstrap_primary = is_own_identity_key(
      source,
      keys.ratchet_identity_public,
    );
    candidate.set_account_unbound(
      bootstrap_primary && is_unbound_handshake(data.x3dh_v),
    );
  };
  const bootstrap_seen: { claim: BootstrapClaim | null } = { claim: null };

  const claim_opened_bootstrap = async (): Promise<boolean> => {
    if (ratchet_origin !== "bootstrap" || plaintext === null) return true;

    bootstrap_seen.claim ??= await claim_bootstrap(
      sender_email,
      sender_identity_key,
      data,
      message_key,
      identity_status === "verified",
    );

    if (bootstrap_seen.claim !== "replayed") return true;

    plaintext = null;
    ratchet = null;
    ratchet_origin = "loaded";

    return false;
  };

  if (ratchet) {
    try {
      plaintext = await ratchet.decrypt(message);
    } catch (caught) {
      note_session_decrypt_failure(message_key, caught);
      plaintext = null;
    }
  }

  if (plaintext === null) {
    first_contact = await is_first_contact(
      our_email,
      sender_email,
      sender_identity_key,
      vault,
    );
    const prior_continuity = data.recovery
      ? await check_sender_identity_continuity(
          sender_email,
          sender_identity_key,
        )
      : "unreadable";

    identity_status = await authenticate_sender_identity(
      sender_email,
      sender_identity_key,
      sent_at,
    );

    const identity_unverified =
      is_authenticated_ratchet_enforced() && identity_status === "mismatch";

    for (const archived of await load_archived_ratchet_states(
      conversation_id,
    ).catch(() => [])) {
      try {
        plaintext = await archived.decrypt(message);
        ratchet = archived;
        ratchet_origin = "archived";
        break;
      } catch (caught) {
        note_session_decrypt_failure(message_key, caught);
        ignore_error(
          "services/crypto/ratchet_decrypt:archived_state_fallback",
          caught,
        );
      }
    }

    let last_error: unknown = null;
    let account_binding_refused = false;
    let owner_claim_refused = false;
    const note_bootstrap_refusal = (err: unknown): void => {
      if (err instanceof SenderIdentityUnverifiedError) {
        account_binding_refused = true;
      }

      if (err instanceof AccountBindingRefusedError) {
        owner_claim_refused = true;
      }
    };

    if (plaintext !== null && ratchet_origin === "archived") {
      const archived_snapshot = await snapshot_ratchet_state(ratchet!);

      if (archived_session_supersedes(archived_snapshot, loaded_snapshot)) {
        if (loaded_snapshot) {
          await archive_ratchet_state(loaded_snapshot);
        }

        await save_ratchet_state(ratchet!);
      } else {
        await archive_ratchet_state(archived_snapshot);
      }

      return {
        plaintext,
        sender_identity_key: ratchet!.get_remote_identity_key(),
        archived: true,
        weak_bootstrap: ratchet!.is_weak_bootstrap(),
        account_unbound: ratchet!.is_account_unbound(),
        first_contact,
        session_bound: ratchet!.is_session_bound(),
      };
    }

    for (const keys of await order_key_sets_for_signed_prekey(key_sets, data)) {
      let candidate: DoubleRatchet | null = null;

      try {
        candidate = await init_receiver_from_bootstrap(
          data,
          sender_identity_key,
          keys,
          conversation_id,
          sender_email,
        );
      } catch (err) {
        last_error = err;
        note_bootstrap_refusal(err);
        continue;
      }

      if (!candidate) {
        continue;
      }

      try {
        plaintext = await candidate.decrypt(message);
        ratchet = candidate;
        ratchet_origin = "bootstrap";
        open_bootstrap(candidate, vault, keys);
        break;
      } catch (err) {
        note_session_decrypt_failure(message_key, err);
        last_error = err;
      }
    }

    if (owner_claim_refused) {
      record_message_sender_identity(message_key, "unverified");
      throw new AccountBindingRefusedError(sender_email);
    }

    if (!(await claim_opened_bootstrap())) {
      throw new Error("Opening message was already used");
    }

    if (plaintext === null || !ratchet) {
      const server_sync_key = await get_sync_encryption_key();

      if (server_sync_key) {
        try {
          const server_state = await load_ratchet_from_server(
            conversation_id,
            server_sync_key,
          );

          if (
            server_state &&
            server_replacement_supersedes(
              await snapshot_ratchet_state(server_state.ratchet),
              loaded_snapshot,
            )
          ) {
            try {
              plaintext = await server_state.ratchet.decrypt(message);
              ratchet = server_state.ratchet;
              ratchet_origin = "replacement";
            } catch (caught) {
              note_session_decrypt_failure(message_key, caught);
            }
          }
        } catch {
          /* best-effort */
        }
      }
    }

    if ((plaintext === null || !ratchet) && is_first_chain_bootstrap) {
      const refreshed = await fetch_refreshed_vault();

      if (refreshed) {
        const tried = new Set(key_sets.map(key_set_fingerprint));

        for (const keys of receiver_key_sets(refreshed.vault, our_email)) {
          if (tried.has(key_set_fingerprint(keys))) continue;

          let candidate: DoubleRatchet | null = null;

          try {
            candidate = await init_receiver_from_bootstrap(
              data,
              sender_identity_key,
              keys,
              conversation_id,
              sender_email,
            );
          } catch (err) {
            note_bootstrap_refusal(err);
            continue;
          }

          if (!candidate) continue;

          try {
            plaintext = await candidate.decrypt(message);
            ratchet = candidate;
            ratchet_origin = "bootstrap";
            open_bootstrap(candidate, refreshed.vault, keys);
            await adopt_refreshed_vault(refreshed);
            break;
          } catch (caught) {
            note_session_decrypt_failure(message_key, caught);
            ignore_error(
              "services/crypto/ratchet_decrypt:decrypt_ratchet_for_recipient",
              caught,
            );
          }
        }
      }
    }

    if ((plaintext === null || !ratchet) && is_first_chain_bootstrap) {
      const recovered_vault = await recover_ratchet_keys_from_history();

      for (const keys of recovered_vault
        ? receiver_key_sets(recovered_vault, our_email)
        : []) {
        let candidate: DoubleRatchet | null = null;

        try {
          candidate = await init_receiver_from_bootstrap(
            data,
            sender_identity_key,
            keys,
            conversation_id,
            sender_email,
          );
        } catch (err) {
          note_bootstrap_refusal(err);
          continue;
        }

        if (!candidate) continue;

        try {
          plaintext = await candidate.decrypt(message);
          ratchet = candidate;
          ratchet_origin = "bootstrap";
          open_bootstrap(candidate, recovered_vault ?? vault, keys);
          break;
        } catch (caught) {
          note_session_decrypt_failure(message_key, caught);
          ignore_error(
            "services/crypto/ratchet_decrypt:recovered_key_bootstrap",
            caught,
          );
        }
      }
    }

    if (owner_claim_refused) {
      record_message_sender_identity(message_key, "unverified");
      throw new AccountBindingRefusedError(sender_email);
    }

    if (!(await claim_opened_bootstrap())) {
      throw new Error("Opening message was already used");
    }

    if ((plaintext === null || !ratchet) && identity_status === "verified") {
      const peer_session = await decrypt_with_peer_session(
        conversation_id,
        sender_identity_key,
        message,
      ).catch(() => null);

      if (peer_session) {
        const peer_sync_key = await get_sync_encryption_key();

        if (peer_sync_key) {
          await sync_ratchet_to_server(
            peer_session.ratchet,
            peer_sync_key,
          ).catch((caught) =>
            ignore_error(
              "services/crypto/ratchet_decrypt:peer_session_sync",
              caught,
            ),
          );
        }

        return {
          plaintext: peer_session.plaintext,
          sender_identity_key: peer_session.peer_identity_key,
          archived: false,
          weak_bootstrap: peer_session.ratchet.is_weak_bootstrap(),
          account_unbound: peer_session.ratchet.is_account_unbound(),
          first_contact,
          session_bound: peer_session.ratchet.is_session_bound(),
        };
      }
    }

    if ((plaintext === null || !ratchet) && account_binding_refused) {
      record_message_sender_identity(message_key, "unverified");
      throw new SenderIdentityUnverifiedError(sender_email, "mismatch");
    }

    if (plaintext === null || !ratchet) {
      const lane_conversation_ids =
        data.recovery && identity_status === "verified"
          ? [
              conversation_id,
              ...(await peer_conversation_ids(
                conversation_id,
                sender_identity_key,
              ).catch(() => [] as string[])),
            ]
          : [conversation_id];
      const recovered = await try_recovery_lanes(
        data,
        lane_conversation_ids,
        sender_identity_key,
        vault,
        our_email,
      );

      if (recovered !== null) {
        return trusted_lane_plaintext(
          recovered,
          prior_continuity,
          sender_email,
          sender_identity_key,
          message_key,
          lane_account_unbound(data, vault, recovered, loaded_ratchet),
          sent_at,
          is_own_session_sender(
            our_email,
            sender_email,
            sender_identity_key,
            vault,
          ),
        );
      }

      if (data.recovery) {
        const refreshed = await fetch_refreshed_vault();

        if (refreshed) {
          const recovered_refreshed = await try_recovery_lanes(
            data,
            lane_conversation_ids,
            sender_identity_key,
            refreshed.vault,
            our_email,
          );

          if (recovered_refreshed !== null) {
            await adopt_refreshed_vault(refreshed);

            return trusted_lane_plaintext(
              recovered_refreshed,
              prior_continuity,
              sender_email,
              sender_identity_key,
              message_key,
              lane_account_unbound(
                data,
                refreshed.vault,
                recovered_refreshed,
                loaded_ratchet,
              ),
              sent_at,
              is_own_session_sender(
                our_email,
                sender_email,
                sender_identity_key,
                refreshed.vault,
              ),
            );
          }
        }
      }

      if (identity_unverified) {
        record_message_sender_identity(message_key, "unverified");
        throw new SenderIdentityUnverifiedError(sender_email, identity_status);
      }

      if (last_error) {
        throw last_error;
      }

      return null;
    }
  }

  if (!ratchet) {
    return null;
  }

  const key_standing =
    ratchet_origin === "bootstrap" &&
    !is_own_session_sender(
      our_email,
      sender_email,
      ratchet.get_remote_identity_key() ?? "",
      vault,
    )
      ? await opening_key_standing(
          sender_email,
          ratchet.get_remote_identity_key(),
          sent_at,
        )
      : undefined;
  const retired_key = standing_is_retired(key_standing ?? null);

  if (
    ratchet_origin === "bootstrap" &&
    loaded_snapshot &&
    (bootstrap_seen.claim !== "first" ||
      session_already_on_chain(loaded_snapshot, data.header.dh_public))
  ) {
    await discard_used_one_time_prekey(data);

    if (bootstrap_seen.claim === "unknown") {
      record_message_sender_identity(message_key, "unverified");
      mark_unauthenticated_plaintext(plaintext, message_key);

      return {
        plaintext,
        sender_identity_key: null,
        archived: false,
        weak_bootstrap: ratchet.is_weak_bootstrap(),
        account_unbound: ratchet.is_account_unbound(),
        first_contact: false,
      };
    }

    return {
      plaintext,
      sender_identity_key: ratchet.get_remote_identity_key(),
      archived: false,
      weak_bootstrap: ratchet.is_weak_bootstrap(),
      account_unbound: ratchet.is_account_unbound(),
      first_contact,
      key_standing,
      session_bound: ratchet.is_session_bound(),
    };
  }

  if (
    ratchet_origin === "bootstrap" &&
    loaded_snapshot &&
    ((retired_key &&
      established_identity_key !== ratchet.get_remote_identity_key()) ||
      !(await bootstrap_may_replace_session(
        our_email,
        sender_email,
        vault,
        established_identity_key,
        ratchet.get_remote_identity_key(),
        identity_status,
      )))
  ) {
    await discard_used_one_time_prekey(data);
    record_message_sender_identity(message_key, "unverified");
    mark_unauthenticated_plaintext(plaintext, message_key);

    return {
      plaintext,
      sender_identity_key: null,
      archived: false,
      weak_bootstrap: ratchet.is_weak_bootstrap(),
      account_unbound: ratchet.is_account_unbound(),
      first_contact: false,
    };
  }

  if (
    (ratchet_origin === "replacement" || ratchet_origin === "bootstrap") &&
    loaded_snapshot
  ) {
    await carry_forward_skipped_keys(ratchet, loaded_snapshot);
    await archive_ratchet_state(loaded_snapshot);
  }

  await save_ratchet_state(ratchet);

  const sync_key_recv = await get_sync_encryption_key();

  if (sync_key_recv) {
    try {
      await sync_ratchet_to_server(ratchet, sync_key_recv);
    } catch {
      /* best-effort */
    }
  }

  if (ratchet_origin === "bootstrap") {
    await discard_used_one_time_prekey(data);

    const remote_identity_key = ratchet.get_remote_identity_key();

    if (
      opening_sets_floor(identity_status, key_standing) &&
      !ratchet.is_weak_bootstrap() &&
      remote_identity_key &&
      bootstrap_primary &&
      !is_unbound_handshake(data.x3dh_v) &&
      !is_own_sender_address(sender_email, account_email)
    ) {
      await note_account_bound_opening(
        sender_email.trim().toLowerCase(),
        account_bound_floor_key(account_email),
        remote_identity_key,
        sent_at,
      );
    }
  }

  return {
    plaintext,
    sender_identity_key: ratchet.get_remote_identity_key(),
    archived: false,
    weak_bootstrap: ratchet.is_weak_bootstrap(),
    account_unbound: ratchet.is_account_unbound(),
    first_contact,
    key_standing,
    session_bound: ratchet.is_session_bound(),
  };
}

function lane_account_unbound(
  data: RatchetRecipientData,
  vault: EncryptedVault,
  recovered: RecoveredLanePlaintext,
  session: DoubleRatchet | null,
): boolean {
  if (!is_own_identity_key(vault, recovered.opened_with)) return false;

  if (data.ephemeral_key) return is_unbound_handshake(data.x3dh_v);

  return session?.is_account_unbound() === true;
}

async function trusted_lane_plaintext(
  recovered: RecoveredLanePlaintext,
  continuity: SenderIdentityContinuity,
  sender_email: string,
  sender_identity_key: string,
  message_key: string,
  account_unbound: boolean,
  sent_at: number | undefined,
  own_sender: boolean,
): Promise<RatchetSessionPlaintext> {
  const pin_id = sender_email.trim().toLowerCase();
  const verdict = recovery_lane_verdict({
    binding: recovered.binding,
    freshness:
      recovered.binding === "none"
        ? "unknown"
        : await claim_lane_nonce(
            pin_id,
            recovered.conversation_id,
            recovered.snonce,
            message_key,
            recovered.sent_at,
          ),
    continuity,
    user_confirmed: await is_identity_confirmed_by_user(
      pin_id,
      sender_identity_key,
    ),
    sender_pin: await lookup_lane_sender_pin(pin_id),
  });

  if (verdict === "refused") {
    record_message_sender_identity(message_key, "unverified");
    throw new SenderIdentityUnverifiedError(sender_email, "mismatch");
  }

  const key_standing =
    verdict === "confirmed" && !own_sender
      ? await opening_key_standing(sender_email, sender_identity_key, sent_at)
      : undefined;
  const unconfirmed_key =
    key_standing !== undefined && !standing_confirms(key_standing);

  if (verdict === "confirmed") {
    if (recovered.binding === "transcript") await pin_lane_sender(pin_id);
  } else {
    mark_unauthenticated_plaintext(recovered.plaintext, message_key);
  }

  return {
    plaintext: recovered.plaintext,
    sender_identity_key: verdict === "confirmed" ? sender_identity_key : null,
    archived: false,
    weak_bootstrap: false,
    account_unbound,
    first_contact: false,
    ...(unconfirmed_key ? { key_standing } : {}),
  };
}

export { discard_used_one_time_prekey };
