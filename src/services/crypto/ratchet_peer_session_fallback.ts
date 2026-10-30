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
import { type DoubleRatchet, type EncryptedMessage } from "./double_ratchet";
import { run_serialized_for_conversation } from "./ratchet_conversation";
import {
  list_ratchet_conversations,
  load_ratchet_state,
  save_ratchet_state,
} from "./ratchet_state_store";

const IDENTITY_INDEX_TTL_MS = 5 * 60 * 1000;
const MAX_INDEXED_CONVERSATIONS = 5000;
const MAX_MATCHED_SESSIONS = 4;
const DEFAULT_PEER_LOCK_WAIT_MS = 5000;

interface IdentityIndex {
  built_at: number;
  identities: Map<string, string | null>;
}

let identity_index: IdentityIndex | null = null;

function peer_identity_key(ratchet: DoubleRatchet | null): string | null {
  if (!ratchet) return null;

  return (
    ratchet.get_remote_identity_key() ??
    ratchet.get_bootstrap()?.recipient_identity_key ??
    null
  );
}

export function reset_peer_session_index(): void {
  identity_index = null;
}

async function load_identity_index(): Promise<Map<string, string | null>> {
  const conversation_ids = (await list_ratchet_conversations()).slice(
    0,
    MAX_INDEXED_CONVERSATIONS,
  );
  const fresh =
    identity_index && Date.now() - identity_index.built_at < IDENTITY_INDEX_TTL_MS;
  const previous = fresh ? identity_index!.identities : new Map();
  const identities = new Map<string, string | null>();

  for (const conversation_id of conversation_ids) {
    const known = previous.get(conversation_id);

    if (known) {
      identities.set(conversation_id, known);
      continue;
    }

    const ratchet = await load_ratchet_state(conversation_id).catch(() => null);

    identities.set(conversation_id, peer_identity_key(ratchet));
  }

  identity_index = {
    built_at: fresh ? identity_index!.built_at : Date.now(),
    identities,
  };

  return identities;
}

export async function peer_conversation_ids(
  derived_conversation_id: string,
  sender_identity_key: string,
): Promise<string[]> {
  if (!sender_identity_key) return [];

  const identities = await load_identity_index().catch(
    () => new Map<string, string | null>(),
  );

  return [...identities.entries()]
    .filter(
      ([conversation_id, identity_key]) =>
        conversation_id !== derived_conversation_id &&
        identity_key === sender_identity_key,
    )
    .map(([conversation_id]) => conversation_id)
    .slice(0, MAX_MATCHED_SESSIONS);
}

export interface PeerSessionPlaintext {
  plaintext: string;
  ratchet: DoubleRatchet;
  peer_identity_key: string;
}

export async function decrypt_with_peer_session(
  derived_conversation_id: string,
  sender_identity_key: string,
  message: EncryptedMessage,
  lock_wait_ms = DEFAULT_PEER_LOCK_WAIT_MS,
): Promise<PeerSessionPlaintext | null> {
  if (!sender_identity_key) return null;

  const candidates = await peer_conversation_ids(
    derived_conversation_id,
    sender_identity_key,
  );

  for (const conversation_id of candidates) {
    const lock = { started: false, abandoned: false };
    const attempt = run_serialized_for_conversation(
      conversation_id,
      async (): Promise<PeerSessionPlaintext | null> => {
        if (lock.abandoned) return null;

        lock.started = true;

        const ratchet = await load_ratchet_state(conversation_id).catch(
          () => null,
        );

        if (!ratchet) return null;
        if (peer_identity_key(ratchet) !== sender_identity_key) {
          return null;
        }

        try {
          const plaintext = await ratchet.decrypt(message);

          await save_ratchet_state(ratchet);

          return { plaintext, ratchet, peer_identity_key: sender_identity_key };
        } catch {
          return null;
        }
      },
    );

    let wait_timer: ReturnType<typeof setTimeout> | undefined;
    const timed_out = await Promise.race([
      attempt.then(() => false),
      new Promise<boolean>((resolve) => {
        wait_timer = setTimeout(() => resolve(true), lock_wait_ms);
      }),
    ]);

    clearTimeout(wait_timer);

    if (timed_out && !lock.started) {
      lock.abandoned = true;
      continue;
    }

    const opened = await attempt;

    if (opened) return opened;
  }

  return null;
}
