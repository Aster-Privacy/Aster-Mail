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
  account_sender_identity,
  type SenderIdentity,
} from "./address_sender_identity";
import { type DoubleRatchet } from "./double_ratchet";
import { get_vault_from_memory } from "./memory_key_store";
import { get_sync_encryption_key } from "./ratchet_conversation";
import {
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
import { archive_ratchet_state } from "./ratchet_state_store";
import { load_ratchet_for_merge } from "./ratchet_sync";

export async function adopt_server_state_before_send(
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

export async function seal_lane_with_heal(
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
