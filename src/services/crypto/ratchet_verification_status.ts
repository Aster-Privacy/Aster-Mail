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

export type PeerIdentityEvent = "rotated" | "downgraded" | "untrusted";

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
const unauthenticated_plaintexts = new Map<string, Set<string>>();
const unconfirmed_sender_plaintexts = new Map<string, Set<string>>();
const evicted_untrusted_plaintexts = new Set<string>();
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

function plaintext_digest(plaintext: string): string {
  let first = 0x811c9dc5;
  let second = 0x01000193;

  for (let i = 0; i < plaintext.length; i++) {
    const code = plaintext.charCodeAt(i);

    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ code, 0x5bd1e995);
    second ^= second >>> 15;
  }

  return `${plaintext.length}:${(first >>> 0).toString(36)}:${(second >>> 0).toString(36)}`;
}

function mark_plaintext(
  store: Map<string, Set<string>>,
  plaintext: string,
  message_key: string,
): void {
  if (!plaintext) return;

  const keys = store.get(plaintext) ?? new Set<string>();

  keys.add(message_key);
  store.delete(plaintext);
  store.set(plaintext, keys);

  while (store.size > MAX_TRACKED_MESSAGES) {
    const oldest = store.keys().next();

    if (oldest.done) return;

    evicted_untrusted_plaintexts.add(plaintext_digest(oldest.value));
    store.delete(oldest.value);
  }
}

function was_evicted_untrusted(plaintext: string): boolean {
  return (
    evicted_untrusted_plaintexts.size > 0 &&
    evicted_untrusted_plaintexts.has(plaintext_digest(plaintext))
  );
}

export function mark_unauthenticated_plaintext(
  plaintext: string,
  message_key = "",
): void {
  mark_plaintext(unauthenticated_plaintexts, plaintext, message_key);
}

function clear_plaintext(
  store: Map<string, Set<string>>,
  plaintext: string,
  message_key: string,
): void {
  const keys = store.get(plaintext);

  if (!keys) return;

  keys.delete(message_key);

  if (keys.size === 0) store.delete(plaintext);
}

export function clear_unauthenticated_plaintext(
  plaintext: string,
  message_key = "",
): void {
  clear_plaintext(unauthenticated_plaintexts, plaintext, message_key);
}

export function clear_unconfirmed_sender_plaintext(
  plaintext: string,
  message_key = "",
): void {
  clear_plaintext(unconfirmed_sender_plaintexts, plaintext, message_key);
}

export function is_unauthenticated_plaintext(
  plaintext: string | null | undefined,
): boolean {
  return !!plaintext && unauthenticated_plaintexts.has(plaintext);
}

export function mark_unconfirmed_sender_plaintext(
  plaintext: string,
  message_key = "",
): void {
  mark_plaintext(unconfirmed_sender_plaintexts, plaintext, message_key);
}

export function is_unconfirmed_sender_plaintext(
  plaintext: string | null | undefined,
): boolean {
  return !!plaintext && unconfirmed_sender_plaintexts.has(plaintext);
}

export function is_trusted_ratchet_plaintext(
  plaintext: string | null | undefined,
): boolean {
  return (
    !!plaintext &&
    !is_unauthenticated_plaintext(plaintext) &&
    !is_unconfirmed_sender_plaintext(plaintext) &&
    !was_evicted_untrusted(plaintext)
  );
}

export function clear_ratchet_verification_status(): void {
  bundle_records.clear();
  message_records.clear();
  unauthenticated_plaintexts.clear();
  unconfirmed_sender_plaintexts.clear();
  evicted_untrusted_plaintexts.clear();
  peer_identity_events.clear();
  notify_peer_identity_listeners();
}
