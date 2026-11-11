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
import type { AccountDataContext } from "./account_data_key";
import type { EncryptedVault } from "./key_manager";

import { account_data_write_key } from "./account_data_writer";
import { array_to_base64, base64_to_array } from "./base64";
import { HASH_ALG } from "./constants";
import { get_retired_context_key } from "./legacy_keks";
import { get_vault_from_memory } from "./memory_key_store";
import {
  retired_contexts_in,
  retired_kek_values_for,
} from "./retired_identity_keks";
import { write_vault_merged } from "./vault_cas_write";
import { with_vault_write_lock_bounded } from "./vault_write_lock";

import { api_client } from "@/services/api/client";
import { ignore_error } from "@/lib/ignore_error";

const LOCK_NAME = "aster-retired-key-rewrap";
const SCAN_KEY_PREFIX = "aster_retired_key_rewrap_scan_";
const NONCE_LENGTH = 12;
const PAGE_SIZE = 100;
const MAX_PAGES = 200;
const VAULT_LOCK_WAIT_MS = 15000;

export const RETIRED_REWRAP_RESCAN_MS = 6 * 60 * 60 * 1000;

const ACCOUNT_KEY_WRITERS: ReadonlySet<AccountDataContext> = new Set([
  "astermail-draft-v2",
  "astermail-preferences-v1",
  "astermail-devmode-v1",
]);

const UNREAD_CONTEXTS: ReadonlySet<AccountDataContext> = new Set([
  "astermail-draft-v1",
  "astermail-calendar-v2",
]);

export interface RetiredRewrapSummary {
  checked: number;
  rewrapped: number;
  held: number;
  dropped: AccountDataContext[];
  pending: AccountDataContext[];
}

interface PassResult {
  checked: number;
  rewrapped: number;
  held: number;
  complete: boolean;
}

interface PassEnv {
  retired: CryptoKey;
  write: boolean;
  target: () => Promise<CryptoKey>;
}

interface Sealed {
  encrypted: string;
  nonce: string;
}

type PassHandler = (env: PassEnv) => Promise<PassResult>;

let running = false;

function empty_pass(complete: boolean): PassResult {
  return { checked: 0, rewrapped: 0, held: 0, complete };
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

function write_last_scan(account_id: string, at: number | null): void {
  try {
    if (at === null) {
      localStorage.removeItem(scan_key(account_id));
    } else {
      localStorage.setItem(scan_key(account_id), String(at));
    }
  } catch (caught) {
    ignore_error("services/crypto/retired_key_rewrap:write_last_scan", caught);
  }
}

function equal_bytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;

  let diff = 0;

  for (let i = 0; i < left.length; i++) diff |= left[i] ^ right[i];

  return diff === 0;
}

function decode(value: string): Uint8Array | null {
  try {
    return base64_to_array(value);
  } catch {
    return null;
  }
}

async function open_under(
  key: CryptoKey,
  encrypted: string | null | undefined,
  nonce: string | null | undefined,
): Promise<Uint8Array | null> {
  if (!encrypted || !nonce) return null;

  const data = decode(encrypted);
  const iv = decode(nonce);

  if (!data || !iv) return null;

  try {
    return new Uint8Array(
      await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data),
    );
  } catch {
    return null;
  }
}

async function reseal(
  target: CryptoKey,
  plaintext: Uint8Array,
): Promise<Sealed | null> {
  try {
    const iv = crypto.getRandomValues(new Uint8Array(NONCE_LENGTH));
    const sealed: Sealed = {
      encrypted: array_to_base64(
        new Uint8Array(
          await crypto.subtle.encrypt(
            { name: "AES-GCM", iv },
            target,
            plaintext,
          ),
        ),
      ),
      nonce: array_to_base64(iv),
    };
    const reopened = await open_under(target, sealed.encrypted, sealed.nonce);

    if (!reopened) return null;

    const same = equal_bytes(reopened, plaintext);

    reopened.fill(0);

    return same ? sealed : null;
  } catch {
    return null;
  }
}

async function derive_identity_context_key(
  identity_key: string,
  context: AccountDataContext,
): Promise<CryptoKey> {
  const material = new TextEncoder().encode(identity_key + context);

  try {
    return await crypto.subtle.importKey(
      "raw",
      await crypto.subtle.digest(HASH_ALG, material),
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
  } finally {
    material.fill(0);
  }
}

async function current_write_key(
  identity_key: string,
  context: AccountDataContext,
): Promise<CryptoKey> {
  if (ACCOUNT_KEY_WRITERS.has(context)) {
    const account_key = await account_data_write_key(context);

    if (account_key) return account_key;
  }

  return derive_identity_context_key(identity_key, context);
}

async function rewrap_field(
  env: PassEnv,
  encrypted: string | null | undefined,
  nonce: string | null | undefined,
): Promise<"current" | "held" | Sealed> {
  const plaintext = await open_under(env.retired, encrypted, nonce);

  if (!plaintext) return "current";

  try {
    if (!env.write) return "held";

    return (await reseal(await env.target(), plaintext)) ?? "held";
  } catch {
    return "held";
  } finally {
    plaintext.fill(0);
  }
}

async function rewrap_blob(
  env: PassEnv,
  encrypted: string | null | undefined,
  nonce: string | null | undefined,
  save: (sealed: Sealed) => Promise<boolean>,
): Promise<PassResult> {
  const result = empty_pass(true);

  result.checked = 1;

  const sealed = await rewrap_field(env, encrypted, nonce);

  if (sealed === "current") return result;
  if (sealed === "held") {
    result.held = 1;

    return result;
  }

  let saved = false;

  try {
    saved = await save(sealed);
  } catch {
    saved = false;
  }

  if (saved) {
    result.rewrapped = 1;
  } else {
    result.held = 1;
  }

  return result;
}

interface FieldNames {
  encrypted: string;
  nonce: string;
}

const ROW_FIELDS: FieldNames[] = [
  { encrypted: "encrypted_name", nonce: "name_nonce" },
  { encrypted: "encrypted_color", nonce: "color_nonce" },
  { encrypted: "encrypted_icon", nonce: "icon_nonce" },
];

type RawRow = Record<string, unknown>;

function text_field(row: RawRow, name: string): string | null {
  const value = row[name];

  return typeof value === "string" && value ? value : null;
}

async function rewrap_row(
  env: PassEnv,
  row: RawRow,
  path: string,
  result: PassResult,
): Promise<void> {
  result.checked++;

  const body: Record<string, string> = {};
  let held = false;
  let found = false;

  for (const field of ROW_FIELDS) {
    const sealed = await rewrap_field(
      env,
      text_field(row, field.encrypted),
      text_field(row, field.nonce),
    );

    if (sealed === "current") continue;

    found = true;

    if (sealed === "held") {
      held = true;
      continue;
    }

    body[field.encrypted] = sealed.encrypted;
    body[field.nonce] = sealed.nonce;
  }

  if (!found) return;

  const id = text_field(row, "id");

  if (held || !id) {
    result.held++;

    return;
  }

  let saved = false;

  try {
    const response = await api_client.put<unknown>(`${path}/${id}`, body);

    saved = !response.error;
  } catch {
    saved = false;
  }

  if (saved) {
    result.rewrapped++;
  } else {
    result.held++;
  }
}

async function rewrap_rows(
  env: PassEnv,
  path: string,
  list_key: string,
  extra_query: string,
): Promise<PassResult> {
  const result = empty_pass(false);

  for (let page = 0; page < MAX_PAGES; page++) {
    const response = await api_client.get<Record<string, unknown>>(
      `${path}?${extra_query}limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`,
      { skip_cache: true },
    );

    if (response.error || !response.data) return result;

    const rows = response.data[list_key];

    if (!Array.isArray(rows)) return result;

    for (const row of rows as RawRow[]) {
      await rewrap_row(env, row, path, result);
    }

    if (response.data.has_more !== true || rows.length === 0) {
      result.complete = true;

      return result;
    }
  }

  return result;
}

const rewrap_tags: PassHandler = (env) =>
  rewrap_rows(env, "/mail/v1/tags", "tags", "");

const rewrap_labels: PassHandler = (env) =>
  rewrap_rows(env, "/mail/v1/labels", "labels", "include_system=true&");

interface PreferencesRow {
  encrypted_preferences: string | null;
  preferences_nonce: string | null;
  preferences_version?: number;
}

const rewrap_preferences: PassHandler = async (env) => {
  const path = "/settings/v1/preferences";
  const response = await api_client.get<PreferencesRow>(path, {
    skip_cache: true,
  });

  if (response.error || !response.data) return empty_pass(false);

  const version = response.data.preferences_version;

  return rewrap_blob(
    env,
    response.data.encrypted_preferences,
    response.data.preferences_nonce,
    async (sealed) => {
      if (typeof version !== "number") return false;

      const saved = await api_client.put<{ success?: boolean }>(path, {
        encrypted_preferences: sealed.encrypted,
        preferences_nonce: sealed.nonce,
        expected_version: version,
      });

      return !saved.error && saved.data?.success === true;
    },
  );
};

interface DevModeRow {
  encrypted_dev_mode: string | null;
  dev_mode_nonce: string | null;
}

const rewrap_dev_mode: PassHandler = async (env) => {
  const path = "/settings/v1/preferences/dev-mode";
  const response = await api_client.get<DevModeRow>(path, {
    skip_cache: true,
  });

  if (response.error || !response.data) return empty_pass(false);

  return rewrap_blob(
    env,
    response.data.encrypted_dev_mode,
    response.data.dev_mode_nonce,
    async (sealed) => {
      const saved = await api_client.put<{ success?: boolean }>(path, {
        encrypted_dev_mode: sealed.encrypted,
        dev_mode_nonce: sealed.nonce,
      });

      return !saved.error && saved.data?.success === true;
    },
  );
};

interface SubscriptionsRow {
  encrypted_subscriptions: string | null;
  subscriptions_nonce: string | null;
}

const rewrap_subscriptions: PassHandler = async (env) => {
  const path = "/settings/v1/preferences/subscriptions";
  const response = await api_client.get<SubscriptionsRow>(path, {
    skip_cache: true,
  });

  if (response.error || !response.data) return empty_pass(false);

  return rewrap_blob(
    env,
    response.data.encrypted_subscriptions,
    response.data.subscriptions_nonce,
    async (sealed) => {
      const saved = await api_client.put<{ success?: boolean }>(path, {
        encrypted_subscriptions: sealed.encrypted,
        subscriptions_nonce: sealed.nonce,
      });

      return !saved.error && saved.data?.success === true;
    },
  );
};

interface OnboardingRow {
  encrypted_state: string | null;
  state_nonce: string | null;
  is_completed: boolean;
  is_skipped: boolean;
}

const rewrap_onboarding: PassHandler = async (env) => {
  const path = "/core/v1/onboarding";
  const response = await api_client.get<OnboardingRow>(path, {
    skip_cache: true,
  });

  if (response.error || !response.data) return empty_pass(false);

  const row = response.data;

  return rewrap_blob(
    env,
    row.encrypted_state,
    row.state_nonce,
    async (sealed) => {
      const saved = await api_client.put<{ success?: boolean }>(path, {
        encrypted_state: sealed.encrypted,
        state_nonce: sealed.nonce,
        is_completed: row.is_completed === true,
        is_skipped: row.is_skipped === true,
      });

      return !saved.error && saved.data?.success === true;
    },
  );
};

interface DraftRow {
  id: string;
  encrypted_content: string;
  content_nonce: string;
  version: number;
  has_attachments?: boolean;
  attachment_count?: number;
}

interface DraftPage {
  items: DraftRow[];
  next_cursor?: string;
  has_more: boolean;
}

async function content_hash(encrypted: string): Promise<string> {
  return array_to_base64(
    new Uint8Array(
      await crypto.subtle.digest(HASH_ALG, new TextEncoder().encode(encrypted)),
    ),
  );
}

const rewrap_drafts: PassHandler = async (env) => {
  const result = empty_pass(false);
  let cursor: string | undefined;

  for (let page = 0; page < MAX_PAGES; page++) {
    const query = cursor ? `&cursor=${encodeURIComponent(cursor)}` : "";
    const response = await api_client.get<DraftPage>(
      `/mail/v1/drafts?limit=${PAGE_SIZE}${query}`,
      { skip_cache: true },
    );

    if (response.error || !Array.isArray(response.data?.items)) return result;

    for (const draft of response.data.items) {
      const one = await rewrap_blob(
        env,
        draft.encrypted_content,
        draft.content_nonce,
        async (sealed) => {
          const saved = await api_client.put<{ success?: boolean }>(
            `/mail/v1/drafts/${draft.id}`,
            {
              encrypted_content: sealed.encrypted,
              content_nonce: sealed.nonce,
              content_hash: await content_hash(sealed.encrypted),
              version: draft.version,
              size_bytes: sealed.encrypted.length,
              has_attachments: draft.has_attachments === true,
              attachment_count: draft.attachment_count ?? 0,
            },
          );

          return !saved.error && saved.data?.success === true;
        },
      );

      result.checked += one.checked;
      result.rewrapped += one.rewrapped;
      result.held += one.held;
    }

    cursor = response.data.next_cursor;

    if (!response.data.has_more || !cursor) {
      result.complete = true;

      return result;
    }
  }

  return result;
};

interface ScheduledPage {
  items: { id: string }[];
  total: number;
}

interface ScheduledRow {
  encrypted_envelope: string | null;
  envelope_nonce: string | null;
  encrypted_recipients?: string | null;
  recipients_nonce?: string | null;
}

const scan_scheduled: PassHandler = async (env) => {
  const result = empty_pass(false);

  for (let page = 0; page < MAX_PAGES; page++) {
    const offset = page * PAGE_SIZE;
    const response = await api_client.get<ScheduledPage>(
      `/mail/v1/scheduled?limit=${PAGE_SIZE}&offset=${offset}`,
      { skip_cache: true },
    );

    if (response.error || !Array.isArray(response.data?.items)) return result;

    for (const item of response.data.items) {
      const detail = await api_client.get<ScheduledRow>(
        `/mail/v1/scheduled/${item.id}`,
        { skip_cache: true },
      );

      if (detail.error || !detail.data) return result;

      result.checked++;

      const row = detail.data;
      const envelope = await open_under(
        env.retired,
        row.encrypted_envelope,
        row.envelope_nonce,
      );
      const recipients = await open_under(
        env.retired,
        row.encrypted_recipients,
        row.recipients_nonce,
      );

      if (envelope || recipients) result.held++;
      envelope?.fill(0);
      recipients?.fill(0);
    }

    const seen = offset + response.data.items.length;

    if (response.data.items.length === 0 || seen >= response.data.total) {
      result.complete = true;

      return result;
    }
  }

  return result;
};

interface RecoveryEmailRow {
  encrypted_email?: string | null;
  email_nonce?: string | null;
  exists?: boolean;
  step_up_required?: boolean;
}

const scan_recovery_email: PassHandler = async (env) => {
  const response = await api_client.get<RecoveryEmailRow>(
    "/core/v1/recovery/email",
    { skip_cache: true },
  );

  if (response.error || !response.data) return empty_pass(false);

  const row = response.data;
  const result = empty_pass(true);

  if (row.exists === false) return result;
  if (!row.encrypted_email || !row.email_nonce) {
    result.complete = row.exists !== true && row.step_up_required !== true;

    return result;
  }

  result.checked = 1;

  const opened = await open_under(
    env.retired,
    row.encrypted_email,
    row.email_nonce,
  );

  if (opened) {
    opened.fill(0);
    result.held = 1;
  }

  return result;
};

const HANDLERS: Partial<Record<AccountDataContext, PassHandler>> = {
  "astermail-tags-v1": rewrap_tags,
  "astermail-labels-v1": rewrap_labels,
  "astermail-preferences-v1": rewrap_preferences,
  "astermail-devmode-v1": rewrap_dev_mode,
  "astermail-draft-v2": rewrap_drafts,
  "astermail-scheduled-v1": scan_scheduled,
  "astermail-onboarding-v1": rewrap_onboarding,
  "astermail-subscriptions-v1": rewrap_subscriptions,
  "astermail-recovery-email-v1": scan_recovery_email,
};

async function run_pass(
  handler: PassHandler,
  env: PassEnv,
): Promise<PassResult> {
  try {
    return await handler(env);
  } catch (caught) {
    ignore_error("services/crypto/retired_key_rewrap:run_pass", caught);

    return empty_pass(false);
  }
}

async function settle_context(
  identity_key: string,
  context: AccountDataContext,
  summary: RetiredRewrapSummary,
): Promise<boolean> {
  if (UNREAD_CONTEXTS.has(context)) return true;

  const handler = HANDLERS[context];
  const retired = get_retired_context_key(context);

  if (!handler || !retired) return false;

  let target_key: Promise<CryptoKey> | null = null;
  const target = (): Promise<CryptoKey> => {
    target_key ??= current_write_key(identity_key, context);

    return target_key;
  };

  const first = await run_pass(handler, { retired, write: true, target });

  summary.checked += first.checked;
  summary.rewrapped += first.rewrapped;

  if (!first.complete || first.held > 0) {
    summary.held += first.held;

    return false;
  }
  if (first.rewrapped === 0) return true;

  const verify = await run_pass(handler, { retired, write: false, target });

  summary.held += verify.held;

  return verify.complete && verify.held === 0;
}

async function drop_settled(
  account_id: string,
  identity_key: string,
  settled: AccountDataContext[],
): Promise<AccountDataContext[]> {
  if (settled.length === 0) return [];

  return with_vault_write_lock_bounded(async () => {
    const vault = get_vault_from_memory();

    if (!vault || vault.identity_key !== identity_key) return [];

    const values = retired_kek_values_for(vault.legacy_keks, new Set(settled));

    if (values.length === 0) return [];

    const removed = new Set(values);
    const kept = (vault.legacy_keks ?? []).filter(
      (entry) => !removed.has(entry.k),
    );
    const next: EncryptedVault = { ...vault };

    if (kept.length) {
      next.legacy_keks = kept;
    } else {
      delete next.legacy_keks;
    }

    const written = await write_vault_merged({
      next,
      base: vault,
      user_id: account_id,
      drop_legacy_keks: values,
    });

    return written.status === "written" ? settled : [];
  }, VAULT_LOCK_WAIT_MS);
}

async function run_locked(
  account_id: string,
  now: () => number,
): Promise<RetiredRewrapSummary | null> {
  const vault = get_vault_from_memory();
  const identity_key = vault?.identity_key;

  if (!vault || !identity_key) return null;

  const contexts = retired_contexts_in(vault.legacy_keks);

  if (contexts.length === 0) return null;
  if (now() - read_last_scan(account_id) < RETIRED_REWRAP_RESCAN_MS) {
    return null;
  }

  const summary: RetiredRewrapSummary = {
    checked: 0,
    rewrapped: 0,
    held: 0,
    dropped: [],
    pending: [],
  };
  const settled: AccountDataContext[] = [];

  for (const context of contexts) {
    if (await settle_context(identity_key, context, summary)) {
      settled.push(context);
    } else {
      summary.pending.push(context);
    }
  }

  try {
    summary.dropped = await drop_settled(account_id, identity_key, settled);
  } catch (caught) {
    ignore_error("services/crypto/retired_key_rewrap:drop_settled", caught);
  }

  const dropped = new Set(summary.dropped);

  for (const context of settled) {
    if (!dropped.has(context)) summary.pending.push(context);
  }

  write_last_scan(account_id, summary.pending.length ? now() : null);

  return summary;
}

export async function run_retired_key_rewrap(
  account_id: string,
  now: () => number = Date.now,
): Promise<RetiredRewrapSummary | null> {
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
    ignore_error("services/crypto/retired_key_rewrap:run", caught);

    return null;
  } finally {
    running = false;
  }
}
