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
import type { AccountDataConversionStatus } from "./api/account_key";

import { list_attachments } from "./api/attachments";
import { list_encrypted_mail_items } from "./api/mail";
import {
  convert_attachment_meta,
  convert_sent_envelope,
  get_account_data_conversion,
  get_account_key_capabilities,
  record_account_data_conversion,
  type ConversionWriteResult,
} from "./api/account_key";
import { convert_preferences_to_account_key } from "./api/preferences";
import {
  base64_to_array,
  decrypt_envelope_plaintext_with_bytes,
} from "./crypto/envelope";
import { decrypt_message_with_any_key } from "./crypto/key_manager";
import {
  get_passphrase_bytes,
  get_passphrase_from_memory,
  get_vault_from_memory,
} from "./crypto/memory_key_store";
import { zero_uint8_array } from "./crypto/secure_memory";
import { seal_sent_plaintext } from "./crypto/sent_copy_seal";
import { write_locked_sent_mail } from "./locked_sent_mail_store";

import { ignore_error } from "@/lib/ignore_error";

export interface ConversionSummary {
  checked: number;
  converted: number;
  skipped: number;
  unreadable: number;
  failed: number;
}

export type ItemOutcome = "converted" | "skipped" | "unreadable" | "failed";

export interface ConversionKeys {
  identity_key: string;
  previous_keys: string[];
  passphrase: string;
  passphrase_bytes: Uint8Array;
  fallback_passphrase_bytes?: Uint8Array[];
}

interface ListedSentItem {
  id: string;
  encrypted_envelope?: string | null;
  envelope_nonce?: string | null;
  has_attachments?: boolean;
  attachment_count?: number;
}

interface StoredAttachmentMeta {
  id: string;
  encrypted_meta?: string | null;
  meta_nonce?: string | null;
}

const PAGE_SIZE = 50;
const LISTING_ATTEMPTS = 3;
const META_NONCE_LENGTH = 12;
const LOCK_NAME = "aster-account-data-conversion";
const SCAN_KEY_PREFIX = "aster_account_data_conversion_scan_";
const PGP_MESSAGE_HEADER = "-----BEGIN PGP MESSAGE-----";

export const RESCAN_INTERVAL_MS = 6 * 60 * 60 * 1000;
export const PASSWORD_CHANGE_BUDGET_MS = 30 * 1000;

export type PasswordChangeConversion =
  "complete" | "incomplete" | "unavailable";

export interface PasswordChangeConversionOptions {
  identity_key: string;
  passphrase: string;
  budget_ms?: number;
  now?: () => number;
}

interface ConversionDeadline {
  at: number;
  now: () => number;
}

let running = false;

function empty_summary(): ConversionSummary {
  return { checked: 0, converted: 0, skipped: 0, unreadable: 0, failed: 0 };
}

function scan_key(account_id: string): string {
  return `${SCAN_KEY_PREFIX}${account_id}`;
}

function read_last_scan(account_id: string): number {
  try {
    const raw = Number(localStorage.getItem(scan_key(account_id)) ?? 0);

    return Number.isFinite(raw) ? raw : 0;
  } catch {
    return 0;
  }
}

function write_last_scan(account_id: string, at: number): void {
  try {
    localStorage.setItem(scan_key(account_id), String(at));
  } catch (caught) {
    ignore_error("services/account_data_conversion:write_last_scan", caught);
  }
}

function decode_base64(value: string): Uint8Array | null {
  try {
    return base64_to_array(value);
  } catch {
    return null;
  }
}

export function is_inline_sentinel(nonce_b64: string | null | undefined) {
  if (!nonce_b64) return false;

  const nonce = decode_base64(nonce_b64);

  return !!nonce && nonce.length === 1 && nonce[0] === 1;
}

export function is_legacy_meta_nonce(nonce_b64: string | null | undefined) {
  if (!nonce_b64) return false;

  const nonce = decode_base64(nonce_b64);

  return (
    !!nonce &&
    nonce.length === META_NONCE_LENGTH &&
    nonce.some((byte) => byte !== 0)
  );
}

export async function sha256_hex(bytes: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));

  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

function parse_object(text: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(text);

    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function is_attachment_meta_text(text: string): boolean {
  const parsed = parse_object(text);

  return (
    !!parsed &&
    typeof parsed.filename === "string" &&
    typeof parsed.session_key === "string"
  );
}

async function open_legacy_envelope(
  encrypted_b64: string,
  keys: ConversionKeys,
): Promise<string | null> {
  for (const passphrase_bytes of [
    keys.passphrase_bytes,
    ...(keys.fallback_passphrase_bytes ?? []),
  ]) {
    const plaintext = await decrypt_envelope_plaintext_with_bytes(
      encrypted_b64,
      passphrase_bytes,
    );

    if (plaintext !== null) return plaintext;
  }

  return null;
}

function keys_still_current(keys: ConversionKeys): boolean {
  return get_vault_from_memory()?.identity_key === keys.identity_key;
}

function outcome_of(result: ConversionWriteResult): ItemOutcome {
  if (result === "converted") return "converted";
  if (result === "failed") return "failed";

  return "skipped";
}

async function seal_and_write(
  plaintext: string,
  stored: Uint8Array,
  keys: ConversionKeys,
  write: (
    sealed: string,
    expected_sha256: string,
  ) => Promise<ConversionWriteResult>,
): Promise<ItemOutcome> {
  const sealed = await seal_sent_plaintext(
    plaintext,
    keys.identity_key,
    keys.passphrase,
  ).catch(() => null);

  if (!sealed) return "failed";

  try {
    return outcome_of(
      await write(sealed.encrypted_envelope, await sha256_hex(stored)),
    );
  } catch {
    return "failed";
  }
}

export async function convert_envelope_item(
  item: ListedSentItem,
  keys: ConversionKeys,
): Promise<ItemOutcome> {
  if (!item.encrypted_envelope || !is_inline_sentinel(item.envelope_nonce)) {
    return "skipped";
  }

  const stored = decode_base64(item.encrypted_envelope);

  if (!stored) return "unreadable";

  const plaintext = await open_legacy_envelope(item.encrypted_envelope, keys);

  if (plaintext === null || !parse_object(plaintext)) return "unreadable";

  return seal_and_write(plaintext, stored, keys, (sealed, expected) =>
    convert_sent_envelope(item.id, sealed, expected),
  );
}

async function open_attachment_meta(
  encrypted_meta: string,
  stored: Uint8Array,
  keys: ConversionKeys,
): Promise<string | null> {
  let text = "";

  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(stored);
  } catch {
    text = "";
  }

  if (text.startsWith(PGP_MESSAGE_HEADER)) {
    try {
      return await decrypt_message_with_any_key(
        text,
        [keys.identity_key, ...keys.previous_keys],
        keys.passphrase,
      );
    } catch {
      return null;
    }
  }

  if (text && is_attachment_meta_text(text)) return text;

  return open_legacy_envelope(encrypted_meta, keys);
}

export async function convert_attachment_row(
  attachment: StoredAttachmentMeta,
  keys: ConversionKeys,
): Promise<ItemOutcome> {
  if (
    !attachment.encrypted_meta ||
    !is_legacy_meta_nonce(attachment.meta_nonce)
  ) {
    return "skipped";
  }

  const stored = decode_base64(attachment.encrypted_meta);

  if (!stored || stored.length === 0) return "unreadable";

  const plaintext = await open_attachment_meta(
    attachment.encrypted_meta,
    stored,
    keys,
  );

  if (plaintext === null || !is_attachment_meta_text(plaintext)) {
    return "unreadable";
  }

  return seal_and_write(plaintext, stored, keys, (sealed, expected) =>
    convert_attachment_meta(attachment.id, sealed, expected),
  );
}

async function list_sent_page(cursor: string | undefined) {
  let last_error: unknown = null;

  for (let attempt = 0; attempt < LISTING_ATTEMPTS; attempt += 1) {
    try {
      const response = await list_encrypted_mail_items({
        item_type: "sent",
        limit: PAGE_SIZE,
        cursor,
        include_reactions: true,
      });

      if (response.data) return response.data;

      last_error = new Error("sent mail listing failed");
    } catch (caught) {
      last_error = caught;
    }
  }

  throw last_error ?? new Error("sent mail listing failed");
}

function tally(summary: ConversionSummary, outcome: ItemOutcome): void {
  summary[outcome] += 1;
}

async function convert_item_attachments(
  item: ListedSentItem,
  keys: ConversionKeys,
  summary: ConversionSummary,
): Promise<number> {
  const response = await list_attachments(item.id).catch(() => null);
  const attachments = response?.data?.attachments;

  if (!attachments) {
    tally(summary, "failed");

    return 0;
  }

  let converted = 0;

  for (const attachment of attachments) {
    if (!attachment.encrypted_meta) continue;
    if (!is_legacy_meta_nonce(attachment.meta_nonce)) continue;
    if (!keys_still_current(keys)) return converted;

    const outcome = await convert_attachment_row(attachment, keys);

    tally(summary, outcome);
    if (outcome === "converted") converted += 1;
  }

  return converted;
}

function yield_to_ui(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function convert_sent_mail(
  status: AccountDataConversionStatus,
  keys: ConversionKeys,
  deadline?: ConversionDeadline,
): Promise<{ summary: ConversionSummary; complete: boolean }> {
  const summary = empty_summary();
  let reported = empty_summary();
  let converted_envelopes = 0;
  let converted_attachments = 0;
  let cursor: string | undefined;

  const not_converted = (counts: ConversionSummary) =>
    counts.skipped + counts.unreadable + counts.failed;

  const report = async () => {
    const converted = summary.converted - reported.converted;
    const skipped = not_converted(summary) - not_converted(reported);

    if (converted === 0 && skipped === 0) return;

    if (await record_account_data_conversion({ converted, skipped })) {
      reported = { ...summary };
    }
  };

  const reached_target = () =>
    converted_envelopes >= status.remaining_sent &&
    converted_attachments >= status.remaining_attachments;

  for (;;) {
    const page = await list_sent_page(cursor);
    const items = (page.items ?? []) as ListedSentItem[];

    for (const item of items) {
      if (
        !keys_still_current(keys) ||
        (deadline && deadline.now() >= deadline.at)
      ) {
        await report();

        return { summary, complete: false };
      }

      summary.checked += 1;

      if (converted_envelopes < status.remaining_sent) {
        const outcome = await convert_envelope_item(item, keys);

        if (outcome !== "skipped" || is_inline_sentinel(item.envelope_nonce)) {
          tally(summary, outcome);
        }
        if (outcome === "converted") converted_envelopes += 1;
      }

      const may_have_attachments =
        item.has_attachments === true || (item.attachment_count ?? 0) > 0;

      if (
        may_have_attachments &&
        converted_attachments < status.remaining_attachments
      ) {
        converted_attachments += await convert_item_attachments(
          item,
          keys,
          summary,
        );
      }

      await yield_to_ui();

      if (reached_target()) {
        await report();

        return { summary, complete: true };
      }
    }

    await report();

    cursor = page.next_cursor ?? undefined;

    if (!page.has_more || !cursor || items.length === 0) break;
  }

  return { summary, complete: true };
}

function capture_keys(): ConversionKeys | null {
  const vault = get_vault_from_memory();
  const passphrase = get_passphrase_from_memory();
  const passphrase_bytes = get_passphrase_bytes();

  if (!vault?.identity_key || !passphrase || !passphrase_bytes) {
    if (passphrase_bytes) zero_uint8_array(passphrase_bytes);

    return null;
  }

  return {
    identity_key: vault.identity_key,
    previous_keys: (vault.previous_keys ?? []).filter(
      (key): key is string => typeof key === "string" && key.length > 0,
    ),
    passphrase,
    passphrase_bytes,
  };
}

async function convert_preferences(): Promise<void> {
  const vault = get_vault_from_memory();

  if (!vault) return;

  const result = await convert_preferences_to_account_key(vault);

  if (
    result === "converted" ||
    result === "already_converted" ||
    result === "not_found"
  ) {
    await record_account_data_conversion({ preferences_done: true });
  }
}

async function run_locked(
  account_id: string,
  now: () => number,
): Promise<ConversionSummary | null> {
  const capabilities = await get_account_key_capabilities();

  if (!capabilities.data_conversion) return null;

  const status = await get_account_data_conversion();

  if (!status) return null;

  const keys = capture_keys();

  if (!keys) return null;

  try {
    if (!status.preferences_done_at) await convert_preferences();

    if (status.remaining_sent === 0 && status.remaining_attachments === 0) {
      if (!status.sent_mail_done_at) {
        await record_account_data_conversion({ sent_mail_done: true });
      }

      write_locked_sent_mail(account_id, 0);

      return empty_summary();
    }

    if (now() - read_last_scan(account_id) < RESCAN_INTERVAL_MS) return null;

    const { summary, complete } = await convert_sent_mail(status, keys);

    if (!complete) return summary;

    write_last_scan(account_id, now());
    write_locked_sent_mail(account_id, summary.unreadable);

    if (summary.failed === 0 && summary.unreadable === 0) {
      await record_account_data_conversion({ sent_mail_done: true });
    }

    return summary;
  } finally {
    zero_uint8_array(keys.passphrase_bytes);
  }
}

export async function run_account_data_conversion(
  account_id: string,
  now: () => number = Date.now,
): Promise<ConversionSummary | null> {
  if (!account_id || running) return null;

  running = true;

  try {
    const locks =
      typeof navigator !== "undefined" ? navigator.locks : undefined;

    if (!locks?.request) return await run_locked(account_id, now);

    return await locks.request(LOCK_NAME, { ifAvailable: true }, (lock) =>
      lock ? run_locked(account_id, now) : null,
    );
  } catch (caught) {
    ignore_error("services/account_data_conversion:run", caught);

    return null;
  } finally {
    running = false;
  }
}

function has_remaining(status: AccountDataConversionStatus): boolean {
  return status.remaining_sent > 0 || status.remaining_attachments > 0;
}

async function convert_for_password_change(
  options: PasswordChangeConversionOptions,
  deadline: ConversionDeadline,
): Promise<PasswordChangeConversion> {
  const capabilities = await get_account_key_capabilities();

  if (!capabilities.data_conversion) return "unavailable";

  const vault = get_vault_from_memory();

  if (!vault?.identity_key || vault.identity_key !== options.identity_key) {
    return "unavailable";
  }

  const status = await get_account_data_conversion();

  if (!status) return "unavailable";
  if (!has_remaining(status)) return "complete";

  const keys: ConversionKeys = {
    identity_key: options.identity_key,
    previous_keys: (vault.previous_keys ?? []).filter(
      (key): key is string => typeof key === "string" && key.length > 0,
    ),
    passphrase: options.passphrase,
    passphrase_bytes: new TextEncoder().encode(options.passphrase),
  };

  try {
    const { complete } = await convert_sent_mail(status, keys, deadline);

    if (!complete) return "incomplete";

    const after = await get_account_data_conversion();

    if (!after || has_remaining(after)) return "incomplete";

    if (!after.sent_mail_done_at) {
      await record_account_data_conversion({ sent_mail_done: true });
    }

    return "complete";
  } finally {
    zero_uint8_array(keys.passphrase_bytes);
  }
}

export async function convert_before_password_change(
  options: PasswordChangeConversionOptions,
): Promise<PasswordChangeConversion> {
  if (!options.identity_key || !options.passphrase) return "unavailable";

  const now = options.now ?? Date.now;
  const deadline: ConversionDeadline = {
    at: now() + (options.budget_ms ?? PASSWORD_CHANGE_BUDGET_MS),
    now,
  };
  const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;

  try {
    if (!locks?.request) {
      return await convert_for_password_change(options, deadline);
    }

    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      Math.max(0, deadline.at - now()),
    );

    try {
      return await locks.request(
        LOCK_NAME,
        { signal: controller.signal },
        () => {
          clearTimeout(timer);

          return convert_for_password_change(options, deadline);
        },
      );
    } finally {
      clearTimeout(timer);
    }
  } catch (caught) {
    ignore_error("services/account_data_conversion:password_change", caught);

    return "incomplete";
  }
}

export async function sent_mail_needs_password_reseal(
  before: PasswordChangeConversion,
): Promise<boolean> {
  if (before !== "complete") return true;

  try {
    const status = await get_account_data_conversion();

    return !status || has_remaining(status);
  } catch {
    return true;
  }
}

async function recover_locked(
  account_id: string,
  password: string,
): Promise<ConversionSummary | null> {
  const capabilities = await get_account_key_capabilities();

  if (!capabilities.data_conversion) return null;

  const status = await get_account_data_conversion();

  if (!status) return null;

  if (!has_remaining(status)) {
    write_locked_sent_mail(account_id, 0);

    return empty_summary();
  }

  const keys = capture_keys();

  if (!keys) return null;

  const password_bytes = new TextEncoder().encode(password);

  keys.fallback_passphrase_bytes = [password_bytes];

  try {
    const { summary, complete } = await convert_sent_mail(status, keys);

    if (!complete) return summary;

    write_locked_sent_mail(account_id, summary.unreadable);

    if (summary.failed === 0 && summary.unreadable === 0) {
      await record_account_data_conversion({ sent_mail_done: true });
    }

    return summary;
  } finally {
    zero_uint8_array(password_bytes);
    zero_uint8_array(keys.passphrase_bytes);
  }
}

export async function recover_sent_mail_with_password(
  account_id: string,
  password: string,
): Promise<ConversionSummary | null> {
  if (!account_id || !password) return null;

  const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;

  if (!locks?.request) return recover_locked(account_id, password);

  return locks.request(LOCK_NAME, () => recover_locked(account_id, password));
}
