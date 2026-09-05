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
import { base64_to_array } from "./base64";
import {
  DoubleRatchet,
  type EncryptedMessage,
  type SerializedState,
} from "./double_ratchet";
import { type EncryptedVault } from "./key_manager";
import { type RatchetKeySet } from "./key_manager_core";
import { fetch_from_escrow, upload_to_escrow } from "./message_escrow";
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
  set_cached_ratchet_plaintext,
} from "./ratchet_plaintext_cache";
import { detect_identity_pin_drift } from "./ratchet_prekey_bundle";
import { open_recovery_lane } from "./ratchet_recovery_lane";
import {
  archive_ratchet_state,
  load_archived_ratchet_states,
  load_ratchet_state,
  save_ratchet_state,
} from "./ratchet_state_store";
import { merge_skipped_message_keys } from "./ratchet_state_merge";
import {
  load_ratchet_from_server,
  sync_ratchet_to_server,
} from "./ratchet_sync";
import {
  type RatchetEnvelope,
  type RatchetRecipientData,
} from "./ratchet_types";
import { adopt_refreshed_vault, fetch_refreshed_vault } from "./vault_refresh";
import { is_authenticated_ratchet_enforced } from "./crypto_enforcement_policy";
import {
  authenticate_sender_identity,
  note_message_sender_identity,
  SenderIdentityUnverifiedError,
} from "./sender_identity_authentication";
import { perform_x3dh_receiver } from "./x3dh";

import { zero_uint8_array } from "@/services/crypto/secure_memory";
import { ignore_error } from "@/lib/ignore_error";

function resolve_recipient_data(
  our_email: string,
  envelope: RatchetEnvelope,
): RatchetRecipientData | null {
  const direct = envelope.recipients[our_email.toLowerCase()];

  if (direct) return direct;

  for (const key of Object.keys(envelope.recipients)) {
    if (key.toLowerCase() === our_email.toLowerCase()) {
      return envelope.recipients[key];
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

async function attempt_ratchet_decrypt(
  our_email: string,
  sender_email: string,
  envelope: RatchetEnvelope,
  vault: EncryptedVault,
  data: RatchetRecipientData | null,
  message_id?: string,
): Promise<RatchetDecryptAttempt> {
  const dedupe_key = message_id
    ? build_dedupe_key(message_id, data)
    : undefined;

  if (dedupe_key) {
    const cached = await get_cached_ratchet_plaintext(dedupe_key);

    if (cached !== null) return { plaintext: cached, error: null };
  }

  const conversation_id = await derive_conversation_id(our_email, sender_email);

  return run_serialized_for_conversation(conversation_id, async () => {
    if (dedupe_key) {
      const cached = await get_cached_ratchet_plaintext(dedupe_key);

      if (cached !== null) return { plaintext: cached, error: null };
    }

    let plaintext: string | null = null;
    let decrypt_error: unknown = null;

    await authenticate_sender_identity(
      sender_email,
      envelope.sender_identity_key,
    ).catch(() => "unverified" as const);

    if (data) {
      try {
        plaintext = await decrypt_ratchet_for_recipient(
          our_email,
          sender_email,
          data,
          envelope.sender_identity_key,
          vault,
        );
      } catch (err) {
        decrypt_error = err;
      }
    }

    if (plaintext !== null) {
      void detect_identity_pin_drift(
        sender_email.toLowerCase(),
        envelope.sender_identity_key,
      );

      note_message_sender_identity(
        message_id ?? dedupe_key ?? "",
        sender_email,
      );

      if (dedupe_key) {
        await set_cached_ratchet_plaintext(dedupe_key, plaintext);
        void upload_to_escrow(dedupe_key, plaintext).catch((caught) =>
          ignore_error(
            "services/crypto/ratchet_decrypt:attempt_ratchet_decrypt",
            caught,
          ),
        );
      }

      return { plaintext, error: null };
    }

    if (dedupe_key) {
      const escrowed = await fetch_from_escrow(dedupe_key).catch(() => null);

      if (escrowed !== null) return { plaintext: escrowed, error: null };
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
): Promise<string | null> {
  const our_data = resolve_recipient_data(our_email, envelope);

  const primary = await attempt_ratchet_decrypt(
    our_email,
    sender_email,
    envelope,
    vault,
    our_data,
    message_id,
  );

  if (primary.plaintext !== null) return primary.plaintext;

  if (!our_data && sender_email.toLowerCase() !== our_email.toLowerCase()) {
    const alias_self_data = resolve_recipient_data(sender_email, envelope);

    if (alias_self_data) {
      const fallback = await attempt_ratchet_decrypt(
        sender_email,
        sender_email,
        envelope,
        vault,
        alias_self_data,
        message_id,
      );

      if (fallback.plaintext !== null) return fallback.plaintext;
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
          sender_email,
          envelope,
          vault,
          alias_data,
          message_id,
        );

        if (alias_attempt.plaintext !== null) return alias_attempt.plaintext;
      } catch (caught) {
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
  return `${keys.ratchet_identity_public}:${keys.ratchet_pq_identity_public ?? ""}`;
}

function receiver_key_sets(vault: EncryptedVault): RatchetKeySet[] {
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

  return sets;
}

interface RecoveryLaneCandidate {
  identity_jwk: string;
  identity_public: string;
  pq_identity_secret: string;
  pq_identity_public: string;
}

function recovery_lane_key_candidates(
  vault: EncryptedVault,
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

  return candidates;
}

async function try_recovery_lane(
  data: RatchetRecipientData,
  conversation_id: string,
  sender_identity_key: string,
  vault: EncryptedVault,
): Promise<string | null> {
  const message_key_base64 = await open_recovery_lane_message_key(
    data,
    conversation_id,
    sender_identity_key,
    vault,
  );

  if (message_key_base64 === null) return null;

  const message_key = base64_to_array(message_key_base64);

  try {
    return await DoubleRatchet.decrypt_with_message_key(
      {
        header: data.header,
        ciphertext: data.ciphertext,
        nonce: data.nonce,
      },
      message_key,
    );
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
): Promise<string | null> {
  if (!data.recovery) return null;

  const candidates = recovery_lane_key_candidates(vault);

  const ordered = [
    ...candidates.filter((c) => c.identity_public === data.recovery?.rid),
    ...candidates.filter((c) => c.identity_public !== data.recovery?.rid),
  ];

  for (const candidate of ordered) {
    const opened = await open_recovery_lane(
      data.recovery,
      conversation_id,
      sender_identity_key,
      {
        identity_jwk: candidate.identity_jwk,
        identity_public: candidate.identity_public,
        pq_identity_secret: candidate.pq_identity_secret,
      },
      candidate.pq_identity_public,
    );

    if (opened !== null) return opened;
  }

  return null;
}

async function init_receiver_from_bootstrap(
  data: RatchetRecipientData,
  sender_identity_key: string,
  keys: RatchetKeySet,
  conversation_id: string,
): Promise<DoubleRatchet | null> {
  if (
    !keys.ratchet_identity_key ||
    !keys.ratchet_signed_prekey ||
    !keys.ratchet_signed_prekey_public ||
    !data.ephemeral_key
  ) {
    return null;
  }

  const receiver_identity_jwk: JsonWebKey = JSON.parse(
    keys.ratchet_identity_key,
  );
  const receiver_signed_prekey_jwk: JsonWebKey = JSON.parse(
    keys.ratchet_signed_prekey,
  );

  const sender_identity_raw = base64_to_array(sender_identity_key);
  const sender_ephemeral_raw = base64_to_array(data.ephemeral_key);

  const pq_input =
    data.pq_ciphertext && data.pq_key_id !== undefined
      ? {
          pq_ciphertext: base64_to_array(data.pq_ciphertext),
          pq_key_id: data.pq_key_id,
        }
      : null;

  if (!pq_input && keys.ratchet_pq_identity_public) {
    console.warn(
      "ratchet receiver: PQ-capable identity received a non-PQ bootstrap, proceeding classically",
    );
  }

  const shared_secret = await perform_x3dh_receiver(
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
  );

  const own_keypair = await jwk_to_ratchet_keypair(
    keys.ratchet_signed_prekey,
    keys.ratchet_signed_prekey_public,
  );

  const ratchet = await DoubleRatchet.init_receiver(
    shared_secret,
    own_keypair,
    conversation_id,
  );

  shared_secret.fill(0);
  own_keypair.secret_key.fill(0);

  return ratchet;
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

  if (previous_skipped.length === 0) return;

  const current = await snapshot_ratchet_state(ratchet);

  current.state.skipped_message_keys = merge_skipped_message_keys(
    previous_skipped,
    current.state.skipped_message_keys ?? [],
  );

  ratchet.adopt_state(current);
}

async function decrypt_ratchet_for_recipient(
  our_email: string,
  sender_email: string,
  data: RatchetRecipientData,
  sender_identity_key: string,
  vault: EncryptedVault,
): Promise<string | null> {
  const key_sets = receiver_key_sets(vault);

  if (key_sets.length === 0) {
    return null;
  }

  const conversation_id = await derive_conversation_id(our_email, sender_email);

  const is_first_chain_bootstrap =
    !!data.ephemeral_key && data.header.previous_chain_length === 0;

  const message: EncryptedMessage = {
    header: data.header,
    ciphertext: data.ciphertext,
    nonce: data.nonce,
  };

  const loaded_ratchet = await load_ratchet_state(conversation_id);
  const loaded_snapshot = loaded_ratchet
    ? await snapshot_ratchet_state(loaded_ratchet)
    : null;

  let ratchet = loaded_ratchet;
  let ratchet_origin: "loaded" | "archived" | "replacement" = "loaded";

  let plaintext: string | null = null;

  if (ratchet) {
    try {
      plaintext = await ratchet.decrypt(message);
    } catch {
      plaintext = null;
    }
  }

  if (plaintext === null) {
    const identity_status = await authenticate_sender_identity(
      sender_email,
      sender_identity_key,
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
        ignore_error(
          "services/crypto/ratchet_decrypt:archived_state_fallback",
          caught,
        );
      }
    }

    let last_error: unknown = null;

    if (plaintext !== null && ratchet_origin === "archived") {
      const archived_snapshot = await snapshot_ratchet_state(ratchet!);
      const archived_epoch = archived_snapshot.state.epoch ?? 0;
      const primary_epoch = loaded_snapshot
        ? (loaded_snapshot.state.epoch ?? 0)
        : -1;

      if (archived_epoch > primary_epoch) {
        if (loaded_snapshot) {
          await archive_ratchet_state(loaded_snapshot);
        }

        await save_ratchet_state(ratchet!);
      } else {
        await archive_ratchet_state(archived_snapshot);
      }

      return plaintext;
    }

    for (const keys of key_sets) {
      let candidate: DoubleRatchet | null = null;

      try {
        candidate = await init_receiver_from_bootstrap(
          data,
          sender_identity_key,
          keys,
          conversation_id,
        );
      } catch (err) {
        last_error = err;
        continue;
      }

      if (!candidate) {
        continue;
      }

      try {
        plaintext = await candidate.decrypt(message);
        ratchet = candidate;
        ratchet_origin = "replacement";
        break;
      } catch (err) {
        last_error = err;
      }
    }

    if (plaintext === null || !ratchet) {
      const server_sync_key = await get_sync_encryption_key();

      if (server_sync_key) {
        try {
          const server_state = await load_ratchet_from_server(
            conversation_id,
            server_sync_key,
          );

          if (server_state) {
            try {
              plaintext = await server_state.ratchet.decrypt(message);
              ratchet = server_state.ratchet;
              ratchet_origin = "replacement";
            } catch {
              /* server state also cannot decrypt */
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

        for (const keys of receiver_key_sets(refreshed.vault)) {
          if (tried.has(key_set_fingerprint(keys))) continue;

          let candidate: DoubleRatchet | null = null;

          try {
            candidate = await init_receiver_from_bootstrap(
              data,
              sender_identity_key,
              keys,
              conversation_id,
            );
          } catch {
            continue;
          }

          if (!candidate) continue;

          try {
            plaintext = await candidate.decrypt(message);
            ratchet = candidate;
            ratchet_origin = "replacement";
            await adopt_refreshed_vault(refreshed);
            break;
          } catch (caught) {
            ignore_error(
              "services/crypto/ratchet_decrypt:decrypt_ratchet_for_recipient",
              caught,
            );
          }
        }
      }
    }

    if (plaintext === null || !ratchet) {
      const recovered = await try_recovery_lane(
        data,
        conversation_id,
        sender_identity_key,
        vault,
      );

      if (recovered !== null) return recovered;

      if (data.recovery) {
        const refreshed = await fetch_refreshed_vault();

        if (refreshed) {
          const recovered_refreshed = await try_recovery_lane(
            data,
            conversation_id,
            sender_identity_key,
            refreshed.vault,
          );

          if (recovered_refreshed !== null) {
            await adopt_refreshed_vault(refreshed);

            return recovered_refreshed;
          }
        }
      }

      if (identity_unverified) {
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

  if (ratchet_origin === "replacement" && loaded_snapshot) {
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

  return plaintext;
}
