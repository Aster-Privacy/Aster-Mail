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
  type RatchetPrekeySignatureFormat,
  type RatchetPrekeyVerdict,
} from "./key_manager_pgp_signing";

export type SenderIdentityStatus = "verified" | "unverified" | "mismatch";

export type PeerIdentityEvent = "rotated" | "downgraded";

export interface PeerIdentityEventRecord {
  peer: string;
  event: PeerIdentityEvent;
  observed_at: number;
}

export interface BundleVerificationRecord {
  peer: string;
  verdict: RatchetPrekeyVerdict;
  format: RatchetPrekeySignatureFormat;
  strict: boolean;
  observed_at: number;
}

const MAX_TRACKED_PEERS = 512;
const MAX_TRACKED_MESSAGES = 512;

const bundle_records = new Map<string, BundleVerificationRecord>();
const message_records = new Map<string, SenderIdentityStatus>();
const peer_identity_events = new Map<string, PeerIdentityEventRecord>();
const peer_identity_listeners = new Set<() => void>();

function notify_peer_identity_listeners(): void {
  peer_identity_listeners.forEach((listener) => {
    try {
      listener();
    } catch {
      return;
    }
  });
}

export function record_peer_identity_event(
  peer: string,
  event: PeerIdentityEvent,
): void {
  const key = peer.trim().toLowerCase();

  if (!key) return;

  peer_identity_events.delete(key);
  peer_identity_events.set(key, { peer: key, event, observed_at: Date.now() });

  evict_oldest(peer_identity_events, MAX_TRACKED_PEERS);

  if (import.meta.env.DEV) {
    console.warn(`ratchet peer identity ${event} for ${key}`);
  }

  notify_peer_identity_listeners();
}

export function get_peer_identity_event(
  peer: string | null | undefined,
): PeerIdentityEventRecord | null {
  if (!peer) return null;

  return peer_identity_events.get(peer.trim().toLowerCase()) ?? null;
}

export function dismiss_peer_identity_event(peer: string): void {
  if (peer_identity_events.delete(peer.trim().toLowerCase())) {
    notify_peer_identity_listeners();
  }
}

export function subscribe_peer_identity_events(
  listener: () => void,
): () => void {
  peer_identity_listeners.add(listener);

  return () => {
    peer_identity_listeners.delete(listener);
  };
}

function evict_oldest<K, V>(store: Map<K, V>, limit: number): void {
  while (store.size > limit) {
    const oldest = store.keys().next();

    if (oldest.done) return;

    store.delete(oldest.value);
  }
}

export function record_bundle_verification(
  peer: string,
  verification: {
    verdict: RatchetPrekeyVerdict;
    format: RatchetPrekeySignatureFormat;
    strict: boolean;
  },
): void {
  const key = peer.toLowerCase();

  bundle_records.delete(key);
  bundle_records.set(key, {
    peer: key,
    verdict: verification.verdict,
    format: verification.format,
    strict: verification.strict,
    observed_at: Date.now(),
  });

  evict_oldest(bundle_records, MAX_TRACKED_PEERS);
}

export function get_bundle_verification(
  peer: string,
): BundleVerificationRecord | null {
  return bundle_records.get(peer.toLowerCase()) ?? null;
}

export function list_bundle_verifications(): BundleVerificationRecord[] {
  return [...bundle_records.values()];
}

export function record_message_sender_identity(
  message_key: string,
  status: SenderIdentityStatus,
): void {
  if (!message_key) return;

  message_records.delete(message_key);
  message_records.set(message_key, status);

  evict_oldest(message_records, MAX_TRACKED_MESSAGES);
}

export function get_message_sender_identity(
  message_key: string,
): SenderIdentityStatus | null {
  return message_records.get(message_key) ?? null;
}

export function clear_ratchet_verification_status(): void {
  bundle_records.clear();
  message_records.clear();
  peer_identity_events.clear();
  notify_peer_identity_listeners();
}
