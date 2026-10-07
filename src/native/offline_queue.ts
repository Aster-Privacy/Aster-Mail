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
import { Preferences } from "@capacitor/preferences";

import { is_native_platform, get_network_status } from "./capacitor_bridge";
import { haptic_notification } from "./haptic_feedback";

import { user_facing_error } from "@/utils/user_facing_error";
import { MAIL_EVENTS } from "@/hooks/mail_events";
import {
  accounts_storage_unreadable,
  get_current_account_id,
} from "@/services/account_manager";

export type OfflineActionType =
  "send_email" | "archive" | "delete" | "star" | "mark_read" | "move";

export interface QueuedAction {
  id: string;
  type: OfflineActionType;
  payload: unknown;
  created_at: number;
  retry_count: number;
  last_error?: string;
}

const QUEUE_KEY = "aster_offline_queue";
const FAILED_KEY = "aster_offline_failed_queue";
const MAX_RETRIES = 3;
const RETRYABLE_CLIENT_STATUSES = new Set([401, 408, 409, 429]);

class OfflineActionError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
    this.name = "OfflineActionError";
  }
}

export function is_permanent_failure(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const status = (error as { status?: unknown }).status;

  if (typeof status !== "number") return false;
  if (status < 400 || status >= 500) return false;

  return !RETRYABLE_CLIENT_STATUSES.has(status);
}

let is_processing = false;
let web_listeners_registered = false;
let queue_mutex: Promise<void> = Promise.resolve();

async function run_exclusive<T>(operation: () => Promise<T>): Promise<T> {
  const previous = queue_mutex;
  let release: () => void;

  queue_mutex = new Promise<void>((resolve) => {
    release = resolve;
  });

  await previous;

  try {
    return await operation();
  } finally {
    release!();
  }
}

function emit_window_event(name: string): void {
  if (typeof window === "undefined") return;

  window.dispatchEvent(new CustomEvent(name));
}

async function resolve_account_scope(): Promise<string | null> {
  const account_id = await get_current_account_id();

  if (account_id === null && accounts_storage_unreadable()) {
    throw new Error("Account storage unavailable. Retry once it is readable.");
  }

  return account_id;
}

async function resolve_queue_key(): Promise<string> {
  const account_id = await resolve_account_scope();

  return account_id ? `${QUEUE_KEY}:${account_id}` : QUEUE_KEY;
}

async function read_stored(key: string): Promise<string | null> {
  if (!is_native_platform()) {
    return localStorage.getItem(key);
  }

  const { value } = await Preferences.get({ key });

  return value;
}

async function write_stored(key: string, value: string): Promise<void> {
  if (!is_native_platform()) {
    localStorage.setItem(key, value);

    return;
  }

  await Preferences.set({ key, value });
}

async function load_device_cipher() {
  return import("@/services/crypto/secure_storage");
}

function is_sealed(value: string): boolean {
  try {
    const parsed = JSON.parse(value);

    return (
      parsed !== null &&
      typeof parsed === "object" &&
      !Array.isArray(parsed) &&
      typeof parsed.n === "string" &&
      typeof parsed.c === "string"
    );
  } catch {
    return false;
  }
}

async function reseal_plaintext(key: string, plaintext: string): Promise<void> {
  try {
    const { device_encrypt } = await load_device_cipher();
    const sealed = await device_encrypt(plaintext);

    if ((await read_stored(key)) !== plaintext) return;

    await write_stored(key, sealed);
  } catch {
    return;
  }
}

async function read_raw(key: string): Promise<string | null> {
  const stored = await read_stored(key);

  if (stored === null) return null;

  if (!is_sealed(stored)) {
    await reseal_plaintext(key, stored);

    return stored;
  }

  try {
    const { device_decrypt } = await load_device_cipher();

    return await device_decrypt(stored);
  } catch {
    return stored;
  }
}

async function write_raw(key: string, value: string): Promise<void> {
  const { device_encrypt } = await load_device_cipher();

  await write_stored(key, await device_encrypt(value));
}

async function remove_raw(key: string): Promise<void> {
  if (!is_native_platform()) {
    localStorage.removeItem(key);

    return;
  }

  await Preferences.remove({ key });
}

export async function durable_read(key: string): Promise<string | null> {
  return read_raw(key);
}

export async function durable_write(key: string, value: string): Promise<void> {
  await write_raw(key, value);
}

export async function durable_remove(key: string): Promise<void> {
  await remove_raw(key);
}

async function migrate_legacy_queue(scoped_key: string): Promise<void> {
  if (scoped_key === QUEUE_KEY) return;

  const legacy = await read_raw(QUEUE_KEY);

  if (!legacy) return;

  let legacy_entries: QueuedAction[] = [];

  try {
    const parsed = JSON.parse(legacy) as QueuedAction[];

    if (Array.isArray(parsed)) legacy_entries = parsed;
  } catch {
    await remove_raw(QUEUE_KEY);

    return;
  }

  const stored = await read_raw(scoped_key);
  let current_entries: QueuedAction[] = [];

  if (stored) {
    try {
      const parsed = JSON.parse(stored) as QueuedAction[];

      if (Array.isArray(parsed)) current_entries = parsed;
    } catch {
      current_entries = [];
    }
  }
  const existing_ids = new Set(current_entries.map((a) => a.id));
  const merged = [
    ...current_entries,
    ...legacy_entries.filter((a) => !existing_ids.has(a.id)),
  ];

  await write_raw(scoped_key, JSON.stringify(merged));
  await remove_raw(QUEUE_KEY);
}

function register_web_queue_listeners(): void {
  if (web_listeners_registered) return;
  if (typeof window === "undefined") return;

  web_listeners_registered = true;

  window.addEventListener("online", () => {
    process_offline_queue();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      process_offline_queue();
    }
  });
}

export async function initialize_offline_queue(): Promise<void> {
  if (!is_native_platform()) {
    register_web_queue_listeners();
  }

  const status = await get_network_status();

  if (status.connected) {
    process_offline_queue();
  }
}

export async function enqueue_action(
  type: QueuedAction["type"],
  payload: unknown,
  stable_id?: string,
): Promise<string> {
  const action: QueuedAction = {
    id: stable_id || crypto.randomUUID(),
    type,
    payload,
    created_at: Date.now(),
    retry_count: 0,
  };

  await run_exclusive(async () => {
    const queue = await read_queue_unlocked();

    if (stable_id && queue.some((queued) => queued.id === stable_id)) return;

    queue.push(action);
    await write_queue_unlocked(queue);
  });

  const status = await get_network_status();

  if (status.connected) {
    process_offline_queue();
  }

  return action.id;
}

async function read_queue_unlocked(): Promise<QueuedAction[]> {
  const key = await resolve_queue_key();

  await migrate_legacy_queue(key);

  const stored = await read_raw(key);

  if (!stored) return [];

  try {
    const parsed = JSON.parse(stored) as QueuedAction[];

    if (Array.isArray(parsed)) return parsed;
  } catch {
    await quarantine_unreadable_queue(key, stored);

    return [];
  }

  await quarantine_unreadable_queue(key, stored);

  return [];
}

async function quarantine_unreadable_queue(
  key: string,
  raw: string,
): Promise<void> {
  await write_raw(`${key}:unreadable`, raw);
  await remove_raw(key);
}

async function write_queue_unlocked(queue: QueuedAction[]): Promise<void> {
  const value = JSON.stringify(queue);
  const key = await resolve_queue_key();

  await write_raw(key, value);
}

export async function get_queue(): Promise<QueuedAction[]> {
  return run_exclusive(read_queue_unlocked);
}

async function save_queue(queue: QueuedAction[]): Promise<void> {
  await run_exclusive(() => write_queue_unlocked(queue));
}

export async function remove_from_queue(id: string): Promise<void> {
  await run_exclusive(async () => {
    const queue = await read_queue_unlocked();
    const filtered = queue.filter((action) => action.id !== id);

    await write_queue_unlocked(filtered);
  });
}

async function resolve_failed_key(): Promise<string> {
  const account_id = await resolve_account_scope();

  return account_id ? `${FAILED_KEY}:${account_id}` : FAILED_KEY;
}

async function read_failed_unlocked(): Promise<QueuedAction[]> {
  try {
    const key = await resolve_failed_key();
    const stored = await read_raw(key);
    const parsed = stored ? JSON.parse(stored) : [];

    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function write_failed_unlocked(actions: QueuedAction[]): Promise<void> {
  const key = await resolve_failed_key();

  await write_raw(key, JSON.stringify(actions));
}

async function move_action_to_failed(action: QueuedAction): Promise<void> {
  await run_exclusive(async () => {
    const queue = await read_queue_unlocked();

    await write_queue_unlocked(queue.filter((a) => a.id !== action.id));

    const failed = await read_failed_unlocked();

    if (!failed.some((a) => a.id === action.id)) {
      failed.push(action);
    }
    await write_failed_unlocked(failed);
  });
}

export async function get_failed_actions(): Promise<QueuedAction[]> {
  return run_exclusive(read_failed_unlocked);
}

export async function process_offline_queue(): Promise<void> {
  if (is_processing) return;

  const status = await get_network_status();

  if (!status.connected) return;

  const { is_authenticated } = await import("@/services/api/auth");

  if (!is_authenticated()) return;

  is_processing = true;

  let replayed_count = 0;
  let dropped_count = 0;

  try {
    const queue = await get_queue();

    for (const action of queue) {
      try {
        await process_action(action);
        await remove_from_queue(action.id);
        replayed_count++;
        await haptic_notification("success");
      } catch (error) {
        action.retry_count++;
        action.last_error = user_facing_error(error, "Unknown error");

        if (action.retry_count >= MAX_RETRIES || is_permanent_failure(error)) {
          await move_action_to_failed(action);
          dropped_count++;
          notify_queue_failure(action);
        } else {
          await run_exclusive(async () => {
            const queue = await read_queue_unlocked();
            const index = queue.findIndex((a) => a.id === action.id);

            if (index !== -1) {
              queue[index] = action;
              await write_queue_unlocked(queue);
            }
          });
        }
      }
    }
  } finally {
    is_processing = false;

    if (replayed_count > 0 || dropped_count > 0) {
      emit_window_event(MAIL_EVENTS.MAIL_CHANGED);
    }

    if (replayed_count > 0) {
      emit_window_event(MAIL_EVENTS.MAIL_STATS_STALE);
    }
  }
}

async function process_action(action: QueuedAction): Promise<void> {
  switch (action.type) {
    case "send_email":
      await process_send_email(action.payload as SendEmailPayload, action.id);
      break;
    case "archive":
      await process_archive(action.payload as EmailActionPayload);
      break;
    case "delete":
      await process_delete(action.payload as EmailActionPayload);
      break;
    case "star":
      await process_star(action.payload as StarPayload);
      break;
    case "mark_read":
      await process_mark_read(action.payload as MarkReadPayload);
      break;
    case "move":
      await process_move(action.payload as MovePayload);
      break;
  }
}

export interface SendEmailPayload {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  in_reply_to?: string;
  sender_email?: string;
  sender_alias_hash?: string;
  sender_display_name?: string;
  expires_at?: string;
  expiry_password?: string;
  secure_external?: boolean;
  attachments?: { name: string; data: string; type: string }[];
}

interface EmailActionPayload {
  email_ids: string[];
}

interface StarPayload {
  email_ids: string[];
  starred: boolean;
}

interface MarkReadPayload {
  email_ids: string[];
  read: boolean;
}

interface MovePayload {
  email_ids: string[];
  folder_id: string;
}

const GATE_REJECTED_STATUS = 422;

async function process_send_email(
  payload: SendEmailPayload,
  client_send_id: string,
): Promise<void> {
  const { get_active_translations } = await import("@/lib/i18n/translations");
  const strings = get_active_translations().common;

  if (payload.expiry_password || payload.secure_external) {
    throw new OfflineActionError(
      strings.offline_password_protected_unavailable,
      GATE_REJECTED_STATUS,
    );
  }

  const { classify_recipients, is_internal_recipient } =
    await import("@/services/recipient_classification");
  const recipients = [
    ...payload.to,
    ...(payload.cc || []),
    ...(payload.bcc || []),
  ];

  await classify_recipients(recipients);

  const has_external = recipients.some((r) => !is_internal_recipient(r));
  const has_internal = recipients.some((r) => is_internal_recipient(r));

  const { execute_send } = await import("@/services/send_queue_encryption");
  const { base64_to_array } = await import("@/services/crypto/envelope");

  const attachments = (payload.attachments || []).map((a) => {
    const bytes = base64_to_array(a.data);

    return {
      id: crypto.randomUUID(),
      name: a.name,
      size: String(bytes.byteLength),
      size_bytes: bytes.byteLength,
      mime_type: a.type,
      data: bytes.slice().buffer,
      is_inline: false,
    };
  });

  const email = {
    to: payload.to,
    cc: payload.cc,
    bcc: payload.bcc,
    subject: payload.subject,
    body: payload.body,
    in_reply_to: payload.in_reply_to,
    sender_email: payload.sender_email,
    sender_alias_hash: payload.sender_alias_hash,
    sender_display_name: payload.sender_display_name,
    expires_at: payload.expires_at,
    attachments: attachments.length > 0 ? attachments : undefined,
    client_send_id,
  };

  if (has_external && has_internal) {
    await send_mixed_after_gates(email, recipients, strings);

    return;
  }

  if (has_external) {
    await send_external_after_gates(email, recipients, strings);

    return;
  }

  await execute_send({
    ...email,
    id: crypto.randomUUID(),
    scheduled_time: Date.now(),
    timeout_id: 0,
    callbacks: { on_complete: () => {}, on_cancel: () => {} },
    allow_non_post_quantum: false,
  });
}

interface OfflineGateStrings {
  cannot_send_key_changed_offline: string;
  offline_settings_unavailable: string;
}

async function offline_encryption_options(
  recipients: string[],
  strings: OfflineGateStrings,
): Promise<
  NonNullable<
    import("@/services/send_queue_types").EmailParams["encryption_options"]
  >
> {
  const { get_cached_preferences } = await import("@/services/api/preferences");
  const preferences = get_cached_preferences();

  if (!preferences) {
    throw new OfflineActionError(strings.offline_settings_unavailable);
  }

  const { find_key_fingerprint_changes } =
    await import("@/services/key_trust_consent");

  if ((await find_key_fingerprint_changes(recipients)).length > 0) {
    throw new OfflineActionError(
      strings.cannot_send_key_changed_offline,
      GATE_REJECTED_STATUS,
    );
  }

  const use_pgp = preferences.encrypt_emails === true;
  const require_encryption = preferences.require_encryption === true;

  return {
    auto_discover_keys: use_pgp || require_encryption,
    encrypt_emails: use_pgp,
    require_encryption,
    obscure_subject: preferences.obscure_subject_when_encrypted === true,
  };
}

async function send_external_after_gates(
  email: import("@/services/send_queue_types").EmailParams,
  recipients: string[],
  strings: OfflineGateStrings,
): Promise<void> {
  const encryption_options = await offline_encryption_options(
    recipients,
    strings,
  );
  const { execute_external_send } =
    await import("@/services/send_queue_encryption");

  await execute_external_send({ ...email, encryption_options }, true);
}

export const OFFLINE_MIXED_SEND_DELAY_SECONDS = 1;

async function send_mixed_after_gates(
  email: import("@/services/send_queue_types").EmailParams,
  recipients: string[],
  strings: OfflineGateStrings,
): Promise<void> {
  const encryption_options = await offline_encryption_options(
    recipients,
    strings,
  );
  const { queue_email_to_server } = await import("@/services/send_queue");
  let queue_error: string | null = null;

  const result = await queue_email_to_server(
    { ...email, encryption_options, allow_non_post_quantum: false },
    OFFLINE_MIXED_SEND_DELAY_SECONDS,
    {
      on_error: (message) => {
        queue_error = message;
      },
    },
  );

  if (!result) {
    const { get_active_translations } =
      await import("@/lib/i18n/translations");

    throw new OfflineActionError(
      queue_error || get_active_translations().errors.failed_queue_email,
      GATE_REJECTED_STATUS,
    );
  }
}

async function process_archive(payload: EmailActionPayload): Promise<void> {
  const { get_mail_item } = await import("@/services/api/mail");
  const { update_item_metadata } =
    await import("@/services/crypto/mail_metadata");

  for (const email_id of payload.email_ids) {
    const item_result = await get_mail_item(email_id);

    if (item_result.error || !item_result.data) {
      throw new OfflineActionError(
        `Failed to fetch email ${email_id}`,
        item_result.status,
      );
    }

    const item = item_result.data;
    const result = await update_item_metadata(
      email_id,
      {
        encrypted_metadata: item.encrypted_metadata,
        metadata_nonce: item.metadata_nonce,
        metadata_version: item.metadata_version,
      },
      { is_archived: true, is_trashed: false, is_spam: false },
    );

    if (!result.success) {
      throw new Error(`Failed to archive email ${email_id}`);
    }
  }
}

async function process_delete(payload: EmailActionPayload): Promise<void> {
  const { get_mail_item } = await import("@/services/api/mail");
  const { update_item_metadata } =
    await import("@/services/crypto/mail_metadata");

  for (const email_id of payload.email_ids) {
    const item_result = await get_mail_item(email_id);

    if (item_result.error || !item_result.data) {
      throw new OfflineActionError(
        `Failed to fetch email ${email_id}`,
        item_result.status,
      );
    }

    const item = item_result.data;
    const result = await update_item_metadata(
      email_id,
      {
        encrypted_metadata: item.encrypted_metadata,
        metadata_nonce: item.metadata_nonce,
        metadata_version: item.metadata_version,
      },
      { is_trashed: true },
    );

    if (!result.success) {
      throw new Error(`Failed to delete email ${email_id}`);
    }
  }
}

async function process_star(payload: StarPayload): Promise<void> {
  const { get_mail_item } = await import("@/services/api/mail");
  const { update_item_metadata } =
    await import("@/services/crypto/mail_metadata");

  for (const email_id of payload.email_ids) {
    const item_result = await get_mail_item(email_id);

    if (item_result.error || !item_result.data) {
      throw new OfflineActionError(
        `Failed to fetch email ${email_id}`,
        item_result.status,
      );
    }

    const item = item_result.data;
    const result = await update_item_metadata(
      email_id,
      {
        encrypted_metadata: item.encrypted_metadata,
        metadata_nonce: item.metadata_nonce,
        metadata_version: item.metadata_version,
      },
      { is_starred: payload.starred },
    );

    if (!result.success) {
      throw new Error(`Failed to star email ${email_id}`);
    }
  }
}

async function process_mark_read(payload: MarkReadPayload): Promise<void> {
  const { get_mail_item } = await import("@/services/api/mail");
  const { update_item_metadata } =
    await import("@/services/crypto/mail_metadata");

  for (const email_id of payload.email_ids) {
    const item_result = await get_mail_item(email_id);

    if (item_result.error || !item_result.data) {
      throw new OfflineActionError(
        `Failed to fetch email ${email_id}`,
        item_result.status,
      );
    }

    const item = item_result.data;
    const result = await update_item_metadata(
      email_id,
      {
        encrypted_metadata: item.encrypted_metadata,
        metadata_nonce: item.metadata_nonce,
        metadata_version: item.metadata_version,
      },
      { is_read: payload.read },
    );

    if (!result.success) {
      throw new Error(
        `Failed to mark email ${email_id} as ${payload.read ? "read" : "unread"}`,
      );
    }
  }
}

async function process_move(payload: MovePayload): Promise<void> {
  const { move_mail_item } = await import("@/services/api/mail");

  for (const email_id of payload.email_ids) {
    const result = await move_mail_item(email_id, {
      folder_token: payload.folder_id,
    });

    if (result.error) {
      throw new OfflineActionError(
        `Failed to move email ${email_id}: ${result.error}`,
        result.status,
      );
    }
  }
}

type QueueStatusCallback = (pending_count: number) => void;
const queue_status_listeners: QueueStatusCallback[] = [];

export function add_queue_status_listener(
  callback: QueueStatusCallback,
): () => void {
  queue_status_listeners.push(callback);

  return () => {
    const index = queue_status_listeners.indexOf(callback);

    if (index > -1) {
      queue_status_listeners.splice(index, 1);
    }
  };
}

function notify_queue_failure(action: QueuedAction): void {
  if (typeof window === "undefined") return;

  const event = new CustomEvent("offline-queue-failure", {
    detail: { action },
  });

  window.dispatchEvent(event);
}

export async function get_pending_count(): Promise<number> {
  const queue = await get_queue();

  return queue.length;
}

export async function clear_queue(): Promise<void> {
  await save_queue([]);
}

export async function retry_failed_actions(): Promise<void> {
  await run_exclusive(async () => {
    const queue = await read_queue_unlocked();
    const failed = await read_failed_unlocked();
    const queued_ids = new Set(queue.map((action) => action.id));
    const revived = failed.filter((action) => !queued_ids.has(action.id));
    const updated = [...queue, ...revived].map((action) => ({
      ...action,
      retry_count: 0,
      last_error: undefined,
    }));

    await write_queue_unlocked(updated);
    await write_failed_unlocked([]);
  });
  process_offline_queue();
}
