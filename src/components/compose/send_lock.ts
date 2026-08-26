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
export const SEND_LOCK_STALL_MS = 60000;

export const SEND_REPEAT_GUARD_MS = 2000;

export interface SendLock {
  held: boolean;
  started_at: number;
}

export function can_acquire_send_lock(lock: SendLock, now: number): boolean {
  if (!lock.held) return true;

  return now - lock.started_at >= SEND_LOCK_STALL_MS;
}

export function is_repeat_send(last_send_at: number, now: number): boolean {
  if (last_send_at <= 0) return false;

  return now - last_send_at < SEND_REPEAT_GUARD_MS;
}

export function is_attachment_set_incomplete(
  is_loading_forward_attachments: boolean | undefined,
): boolean {
  return is_loading_forward_attachments === true;
}

export const DUPLICATE_SEND_WINDOW_MS = 30000;

const RECENT_SEND_LIMIT = 24;

const recent_sends = new Map<string, number>();

function hash_send_content(value: string): string {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return `${(hash >>> 0).toString(36)}:${value.length.toString(36)}`;
}

function prune_recent_sends(now: number): void {
  for (const [fingerprint, sent_at] of recent_sends) {
    if (now - sent_at >= DUPLICATE_SEND_WINDOW_MS)
      recent_sends.delete(fingerprint);
  }

  while (recent_sends.size > RECENT_SEND_LIMIT) {
    const oldest = recent_sends.keys().next();

    if (oldest.done) break;

    recent_sends.delete(oldest.value);
  }
}

export function build_send_fingerprint(
  recipients: string[],
  subject: string,
  body: string,
  extra = "",
): string {
  const normalized_recipients = recipients
    .map((recipient) => recipient.trim().toLowerCase())
    .filter((recipient) => recipient.length > 0)
    .sort()
    .join(",");

  const normalized_subject = subject.replace(/\s+/g, " ").trim().toLowerCase();
  const normalized_body = body.replace(/\s+/g, " ").trim();

  if (normalized_recipients.length === 0) return "";

  if (normalized_subject.length === 0 && normalized_body.length === 0)
    return "";

  return hash_send_content(
    `${normalized_recipients}|${normalized_subject}|${normalized_body}|${extra}`,
  );
}

export function is_duplicate_send(fingerprint: string, now: number): boolean {
  if (fingerprint.length === 0) return false;

  prune_recent_sends(now);

  const sent_at = recent_sends.get(fingerprint);

  if (sent_at === undefined) return false;

  return now - sent_at < DUPLICATE_SEND_WINDOW_MS;
}

export function record_send(fingerprint: string, now: number): void {
  if (fingerprint.length === 0) return;

  recent_sends.delete(fingerprint);
  recent_sends.set(fingerprint, now);
  prune_recent_sends(now);
}

export function forget_send(fingerprint: string): void {
  if (fingerprint.length === 0) return;

  recent_sends.delete(fingerprint);
}

export function reset_recent_sends(): void {
  recent_sends.clear();
}
