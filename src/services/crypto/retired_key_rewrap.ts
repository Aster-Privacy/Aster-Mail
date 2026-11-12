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
import { get_retired_context_key, set_retired_read_guard } from "./legacy_keks";
import { get_vault_from_memory, get_vault_owner_id } from "./memory_key_store";
import {
  retired_contexts_in,
  retired_kek_values_for,
} from "./retired_identity_keks";
import { write_vault_merged } from "./vault_cas_write";
import { with_vault_write_lock_bounded } from "./vault_write_lock";

import { api_client } from "@/services/api/client";
import { get_current_account_id } from "@/services/account_manager";
import {
  calendar_write_key,
  decrypt_calendar_payload,
  encrypt_calendar_payload,
  type CalendarBinding,
} from "@/services/calendar/calendar_crypto";
import { is_draft_busy } from "@/services/draft_activity";
import { ignore_error } from "@/lib/ignore_error";

const LOCK_NAME = "aster-retired-key-rewrap";
const SCAN_KEY_PREFIX = "aster_retired_key_rewrap_scan_";
const NONCE_LENGTH = 12;
const PAGE_SIZE = 100;
const MAX_PAGES = 200;
const VAULT_LOCK_WAIT_MS = 15000;

export const RETIRED_REWRAP_RESCAN_MS = 6 * 60 * 60 * 1000;
export const RETIRED_REWRAP_RETRY_MS = 5 * 60 * 1000;
export const RETIRED_REWRAP_CONFIRM_MS = 7 * 24 * 60 * 60 * 1000;
export const RETIRED_REWRAP_HELD_MS = 24 * 60 * 60 * 1000;

const ACCOUNT_KEY_WRITERS: ReadonlySet<AccountDataContext> = new Set([
  "astermail-draft-v2",
  "astermail-preferences-v1",
  "astermail-devmode-v1",
  "astermail-scheduled-v1",
]);

const TARGET_CONTEXTS: Partial<Record<AccountDataContext, AccountDataContext>> =
  {
    "astermail-draft-v1": "astermail-draft-v2",
  };

export interface RetiredRewrapSummary {
  checked: number;
  rewrapped: number;
  held: number;
  dropped: AccountDataContext[];
  pending: AccountDataContext[];
  confirming: AccountDataContext[];
  kept: AccountDataContext[];
}

interface PassResult {
  checked: number;
  rewrapped: number;
  held: number;
  parked: number;
  complete: boolean;
}

interface PassEnv {
  retired: CryptoKey;
  write: boolean;
  target: () => Promise<CryptoKey>;
  active: () => Promise<boolean>;
}

interface ContextState {
  next_at: number;
  attempts: number;
  clean_since: number | null;
  uncovered_since?: number;
}

type RewrapState = Partial<Record<AccountDataContext, ContextState>>;

interface ContextOutcome {
  status: "clean" | "parked" | "retry";
  rewrote: boolean;
}

interface Sealed {
  encrypted: string;
  nonce: string;
}

type PassHandler = (env: PassEnv) => Promise<PassResult>;

type PlainShape = "text" | "json";

const running = new Set<string>();
const refused_reads = new Map<string, Set<AccountDataContext>>();
const rescan_requests = new Set<string>();

function empty_pass(complete: boolean): PassResult {
  return { checked: 0, rewrapped: 0, held: 0, parked: 0, complete };
}

function scan_key(account_id: string): string {
  return `${SCAN_KEY_PREFIX}${account_id}`;
}

function finite_number(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function read_state(account_id: string): RewrapState {
  const state: RewrapState = {};

  try {
    const parsed: unknown = JSON.parse(
      localStorage.getItem(scan_key(account_id)) ?? "null",
    );

    if (!parsed || typeof parsed !== "object") return state;

    const stored = parsed as Record<string, unknown>;

    if (stored.contexts && typeof stored.contexts === "object") {
      for (const [context, value] of Object.entries(stored.contexts)) {
        if (!value || typeof value !== "object") continue;

        const entry = value as Record<string, unknown>;

        const restored: ContextState = {
          next_at: finite_number(entry.next_at) ?? 0,
          attempts: Math.max(0, finite_number(entry.attempts) ?? 0),
          clean_since: finite_number(entry.clean_since),
        };

        const uncovered_since = finite_number(entry.uncovered_since);

        if (uncovered_since !== null)
          restored.uncovered_since = uncovered_since;

        state[context as AccountDataContext] = restored;
      }

      return state;
    }
    if (stored.clean && typeof stored.clean === "object") {
      for (const [context, at] of Object.entries(stored.clean)) {
        const since = finite_number(at);

        if (since === null) continue;

        state[context as AccountDataContext] = {
          next_at: 0,
          attempts: 0,
          clean_since: since,
        };
      }
    }
  } catch {
    return {};
  }

  return state;
}

function write_state(account_id: string, state: RewrapState | null): void {
  try {
    if (state === null || Object.keys(state).length === 0) {
      localStorage.removeItem(scan_key(account_id));
    } else {
      localStorage.setItem(
        scan_key(account_id),
        JSON.stringify({ contexts: state }),
      );
    }
  } catch (caught) {
    ignore_error("services/crypto/retired_key_rewrap:write_state", caught);
  }
}

function retry_wait_ms(attempts: number): number {
  const doubled = RETIRED_REWRAP_RETRY_MS * 2 ** Math.max(0, attempts - 1);

  return Math.min(doubled, RETIRED_REWRAP_RESCAN_MS);
}

async function owns_session(
  account_id: string,
  identity_key: string,
): Promise<boolean> {
  if (get_vault_owner_id() !== account_id) return false;
  if (get_vault_from_memory()?.identity_key !== identity_key) return false;

  try {
    return (await get_current_account_id()) === account_id;
  } catch {
    return false;
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

function strict_text(bytes: Uint8Array): string | null {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

function has_shape(bytes: Uint8Array, shape: PlainShape): boolean {
  const text = strict_text(bytes);

  if (text === null) return false;
  if (shape === "text") return true;

  try {
    JSON.parse(text);

    return true;
  } catch {
    return false;
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
  shape: PlainShape,
): Promise<"current" | "held" | "invalid" | Sealed> {
  const plaintext = await open_under(env.retired, encrypted, nonce);

  if (!plaintext) return "current";

  try {
    if (!has_shape(plaintext, shape)) return "invalid";
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
  unchanged?: () => Promise<boolean>,
): Promise<PassResult> {
  const result = empty_pass(true);

  result.checked = 1;

  const sealed = await rewrap_field(env, encrypted, nonce, "json");

  if (sealed === "current") return result;
  if (sealed === "invalid") {
    result.held = 1;
    result.parked = 1;

    return result;
  }
  if (sealed === "held") {
    result.held = 1;

    return result;
  }

  let saved = false;

  try {
    saved =
      (await env.active()) &&
      (!unchanged || (await unchanged())) &&
      (await save(sealed));
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

const ROW_FIELD_NAMES: string[] = ROW_FIELDS.flatMap((field) => [
  field.encrypted,
  field.nonce,
]);

type RawRow = Record<string, unknown>;

function text_field(row: RawRow, name: string): string | null {
  const value = row[name];

  return typeof value === "string" && value ? value : null;
}

function stored_value(row: RawRow, name: string): string | boolean | null {
  const value = row[name];

  if (typeof value === "boolean") return value;

  return typeof value === "string" && value ? value : null;
}

async function stored_unchanged(
  path: string,
  seen: RawRow,
  names: string[],
): Promise<boolean> {
  const response = await api_client.get<RawRow>(path, { skip_cache: true });

  if (response.error || !response.data) return false;

  const stored = response.data;

  return names.every(
    (name) => stored_value(stored, name) === stored_value(seen, name),
  );
}

async function stored_matches(
  path: string,
  expected: Record<string, string>,
): Promise<boolean> {
  const response = await api_client.get<RawRow>(path, { skip_cache: true });

  if (response.error || !response.data) return false;

  const stored = response.data;

  return Object.entries(expected).every(
    ([name, value]) => stored_value(stored, name) === value,
  );
}

async function rewrap_row(
  env: PassEnv,
  row: RawRow,
  path: string,
  result: PassResult,
  confirm_system: boolean,
): Promise<void> {
  result.checked++;

  const body: Record<string, string> = {};
  const is_system = confirm_system && row.is_system === true;
  let held = false;
  let invalid = false;
  let found = false;

  for (const field of ROW_FIELDS) {
    const sealed = await rewrap_field(
      env,
      text_field(row, field.encrypted),
      text_field(row, field.nonce),
      "text",
    );

    if (sealed === "current") continue;

    found = true;

    if (sealed === "invalid") {
      invalid = true;
      continue;
    }
    if (sealed === "held") {
      held = true;
      continue;
    }

    body[field.encrypted] = sealed.encrypted;
    body[field.nonce] = sealed.nonce;
  }

  if (!found) return;

  const id = text_field(row, "id");

  if (invalid || held || !id) {
    result.held++;
    if (invalid || is_system) result.parked++;

    return;
  }

  let saved = false;

  try {
    const row_path = `${path}/${id}`;

    if (
      (await env.active()) &&
      (await stored_unchanged(row_path, row, ROW_FIELD_NAMES))
    ) {
      const response = await api_client.put<unknown>(row_path, body);

      saved =
        !response.error &&
        (!is_system || (await stored_matches(row_path, body)));
    }
  } catch {
    saved = false;
  }

  if (saved) {
    result.rewrapped++;
  } else {
    result.held++;
    if (is_system) result.parked++;
  }
}

async function rewrap_rows(
  env: PassEnv,
  path: string,
  list_key: string,
  extra_query: string,
  confirm_system: boolean,
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
      await rewrap_row(env, row, path, result, confirm_system);
    }

    if (response.data.has_more !== true || rows.length === 0) {
      result.complete = true;

      return result;
    }
  }

  return result;
}

const rewrap_tags: PassHandler = (env) =>
  rewrap_rows(env, "/mail/v1/tags", "tags", "", false);

const rewrap_labels: PassHandler = (env) =>
  rewrap_rows(env, "/mail/v1/labels", "labels", "include_system=true&", true);

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

async function rewrap_setting(
  env: PassEnv,
  path: string,
  encrypted_name: string,
  nonce_name: string,
  carried: string[],
): Promise<PassResult> {
  const response = await api_client.get<RawRow>(path, { skip_cache: true });

  if (response.error || !response.data) return empty_pass(false);

  const row = response.data;

  return rewrap_blob(
    env,
    text_field(row, encrypted_name),
    text_field(row, nonce_name),
    async (sealed) => {
      const fresh = await api_client.get<RawRow>(path, { skip_cache: true });

      if (fresh.error || !fresh.data) return false;

      const stored = fresh.data;

      if (
        text_field(stored, encrypted_name) !== text_field(row, encrypted_name)
      ) {
        return false;
      }
      if (text_field(stored, nonce_name) !== text_field(row, nonce_name)) {
        return false;
      }

      const body: Record<string, string | boolean> = {
        [encrypted_name]: sealed.encrypted,
        [nonce_name]: sealed.nonce,
      };

      for (const name of carried) body[name] = stored[name] === true;

      const saved = await api_client.put<{ success?: boolean }>(path, body);

      return !saved.error && saved.data?.success === true;
    },
  );
}

const rewrap_dev_mode: PassHandler = (env) =>
  rewrap_setting(
    env,
    "/settings/v1/preferences/dev-mode",
    "encrypted_dev_mode",
    "dev_mode_nonce",
    [],
  );

const rewrap_subscriptions: PassHandler = (env) =>
  rewrap_setting(
    env,
    "/settings/v1/preferences/subscriptions",
    "encrypted_subscriptions",
    "subscriptions_nonce",
    [],
  );

const rewrap_onboarding: PassHandler = (env) =>
  rewrap_setting(env, "/core/v1/onboarding", "encrypted_state", "state_nonce", [
    "is_completed",
    "is_skipped",
  ]);

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

async function walk_drafts(
  visit: (draft: DraftRow) => Promise<PassResult>,
): Promise<PassResult> {
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
      const one = await visit(draft);

      result.checked += one.checked;
      result.rewrapped += one.rewrapped;
      result.held += one.held;
      result.parked += one.parked;
    }

    cursor = response.data.next_cursor;

    if (!response.data.has_more || !cursor) {
      result.complete = true;

      return result;
    }
  }

  return result;
}

const rewrap_drafts: PassHandler = (env) =>
  walk_drafts((draft) =>
    rewrap_blob(
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
      async () => !is_draft_busy(draft.id),
    ),
  );

interface ScheduledPage {
  items: { id: string }[];
  total: number;
}

interface ScheduledRow {
  status?: string | null;
  encrypted_envelope: string | null;
  envelope_nonce: string | null;
  encrypted_recipients?: string | null;
  recipients_nonce?: string | null;
}

const SCHEDULED_PATH = "/mail/v1/scheduled";
const SCHEDULED_LISTS: string[] = ["", "&status=sent", "&status=cancelled"];
const SCHEDULED_FINISHED: ReadonlySet<string> = new Set(["sent", "cancelled"]);
const SCHEDULED_EDITABLE: ReadonlySet<string> = new Set(["pending", "failed"]);

async function list_scheduled_ids(filter: string): Promise<string[] | null> {
  const ids: string[] = [];

  for (let page = 0; page < MAX_PAGES; page++) {
    const offset = page * PAGE_SIZE;
    const response = await api_client.get<ScheduledPage>(
      `${SCHEDULED_PATH}?limit=${PAGE_SIZE}&offset=${offset}${filter}`,
      { skip_cache: true },
    );

    if (response.error || !Array.isArray(response.data?.items)) return null;

    for (const item of response.data.items) ids.push(item.id);

    const seen = offset + response.data.items.length;

    if (response.data.items.length === 0 || seen >= response.data.total) {
      return ids;
    }
  }

  return null;
}

async function read_scheduled(id: string): Promise<ScheduledRow | null> {
  const detail = await api_client.get<ScheduledRow>(`${SCHEDULED_PATH}/${id}`, {
    skip_cache: true,
  });

  return detail.error || !detail.data ? null : detail.data;
}

async function remove_finished_scheduled(
  env: PassEnv,
  id: string,
  seen: ScheduledRow,
): Promise<boolean> {
  if (!(await env.active())) return false;

  const stored = await read_scheduled(id);

  if (!stored || !SCHEDULED_FINISHED.has(stored.status ?? "")) return false;
  if (
    stored.envelope_nonce !== seen.envelope_nonce ||
    stored.recipients_nonce !== seen.recipients_nonce
  ) {
    return false;
  }

  const removed = await api_client.delete<{ success?: boolean }>(
    `${SCHEDULED_PATH}/${id}`,
  );

  return !removed.error;
}

async function replace_scheduled(
  env: PassEnv,
  id: string,
  row: ScheduledRow,
  envelope: Uint8Array | null,
  recipients: Uint8Array | null,
): Promise<boolean> {
  if (!row.envelope_nonce) return false;

  const target = await env.target();
  const next_envelope: Sealed | null = envelope
    ? await reseal(target, envelope)
    : row.encrypted_envelope
      ? { encrypted: row.encrypted_envelope, nonce: row.envelope_nonce }
      : null;
  const next_recipients: Sealed | null = recipients
    ? await reseal(target, recipients)
    : row.encrypted_recipients && row.recipients_nonce
      ? { encrypted: row.encrypted_recipients, nonce: row.recipients_nonce }
      : null;

  if (!next_envelope || !next_recipients) return false;
  if (!(await env.active())) return false;

  const saved = await api_client.patch<{ id?: string }>(
    `${SCHEDULED_PATH}/${id}`,
    {
      envelope: {
        encrypted_envelope: next_envelope.encrypted,
        envelope_nonce: next_envelope.nonce,
        encrypted_recipients: next_recipients.encrypted,
        recipients_nonce: next_recipients.nonce,
        expected_envelope_nonce: row.envelope_nonce,
      },
    },
  );

  if (saved.error || saved.data?.id !== id) return false;

  const stored = await read_scheduled(id);

  return (
    stored?.envelope_nonce === next_envelope.nonce &&
    stored.recipients_nonce === next_recipients.nonce
  );
}

async function rewrap_scheduled_row(
  env: PassEnv,
  id: string,
  row: ScheduledRow,
): Promise<"current" | "held" | "invalid" | "rewrapped"> {
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

  try {
    if (!envelope && !recipients) return "current";
    if (!env.write) return "held";

    const status = row.status ?? "";
    let done = false;

    if (SCHEDULED_FINISHED.has(status)) {
      done = await remove_finished_scheduled(env, id, row);
    } else if (SCHEDULED_EDITABLE.has(status)) {
      if (
        (envelope && !has_shape(envelope, "json")) ||
        (recipients && !has_shape(recipients, "json"))
      ) {
        return "invalid";
      }

      done = await replace_scheduled(env, id, row, envelope, recipients);
    }

    return done ? "rewrapped" : "held";
  } catch {
    return "held";
  } finally {
    envelope?.fill(0);
    recipients?.fill(0);
  }
}

const rewrap_scheduled: PassHandler = async (env) => {
  const result = empty_pass(false);
  const ids = new Set<string>();

  for (const filter of SCHEDULED_LISTS) {
    const listed = await list_scheduled_ids(filter);

    if (!listed) return result;

    for (const id of listed) ids.add(id);
  }

  for (const id of ids) {
    const row = await read_scheduled(id);

    if (!row) return result;

    result.checked++;

    const outcome = await rewrap_scheduled_row(env, id, row);

    if (outcome === "rewrapped") result.rewrapped++;
    if (outcome === "held") result.held++;
    if (outcome === "invalid") {
      result.held++;
      result.parked++;
    }
  }

  result.complete = true;

  return result;
};

interface CalendarBlobRow {
  id?: unknown;
  calendar_id?: unknown;
  encrypted_blob?: unknown;
  blob_nonce?: unknown;
  version?: unknown;
}

interface CalendarListPage {
  calendars?: CalendarBlobRow[];
  has_more?: boolean;
  cursor_id?: string;
  server_time?: string;
}

interface CalendarEventPage {
  events?: CalendarBlobRow[];
  has_more?: boolean;
  next_cursor?: string | null;
}

const CALENDARS_PATH = "/calendar/v1/calendars";
const CALENDAR_EVENTS_PATH = "/calendar/v1/events";
const CALENDAR_FRAME_BYTE = 2;
const NOT_FOUND_STATUS = 404;

async function open_with(
  key: CryptoKey,
  iv: Uint8Array,
  data: Uint8Array,
  bound_to?: Uint8Array,
): Promise<Uint8Array | null> {
  try {
    return new Uint8Array(
      await crypto.subtle.decrypt(
        bound_to
          ? { name: "AES-GCM", iv, additionalData: bound_to }
          : { name: "AES-GCM", iv },
        key,
        data,
      ),
    );
  } catch {
    return null;
  }
}

async function open_calendar_blob(
  key: CryptoKey,
  row: CalendarBlobRow,
  is_event: boolean,
): Promise<Uint8Array | null> {
  if (
    typeof row.encrypted_blob !== "string" ||
    typeof row.blob_nonce !== "string"
  ) {
    return null;
  }

  const data = decode(row.encrypted_blob);
  const iv = decode(row.blob_nonce);

  if (!data || !iv || data.length === 0) return null;

  const raw = await open_with(key, iv, data);

  if (raw) return raw;
  if (data[0] !== CALENDAR_FRAME_BYTE) return null;

  const body = data.subarray(1);
  const framed = await open_with(key, iv, body);

  if (framed) return framed;

  const row_id = typeof row.id === "string" ? row.id : "";
  const calendar_id =
    typeof row.calendar_id === "string" ? row.calendar_id : "";
  const binding = new TextEncoder().encode(
    [
      "event_id=" + (is_event ? row_id : ""),
      "calendar_id=" + (is_event ? calendar_id : row_id),
      "version=" + String(CALENDAR_FRAME_BYTE),
    ].join("\n"),
  );

  return open_with(key, iv, body, binding);
}

function calendar_binding(
  row: CalendarBlobRow,
  is_event: boolean,
): CalendarBinding | null {
  const id = typeof row.id === "string" && row.id ? row.id : null;

  if (!id) return null;
  if (!is_event) return { calendar_id: id };

  const calendar_id =
    typeof row.calendar_id === "string" && row.calendar_id
      ? row.calendar_id
      : null;

  return calendar_id ? { calendar_id, event_id: id } : null;
}

function exact_json_object(bytes: Uint8Array): Record<string, unknown> | null {
  const text = strict_text(bytes);

  if (text === null) return null;

  try {
    const parsed: unknown = JSON.parse(text);

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }

    return JSON.stringify(parsed) === text
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

async function rewrap_calendar_row(
  env: PassEnv,
  row: CalendarBlobRow,
  is_event: boolean,
): Promise<"current" | "held" | "invalid" | "rewrapped"> {
  const plaintext = await open_calendar_blob(env.retired, row, is_event);

  if (!plaintext) return "current";

  try {
    const binding = calendar_binding(row, is_event);
    const payload = exact_json_object(plaintext);

    if (!binding || !payload) return "invalid";

    const version = finite_number(row.version);
    const vault = get_vault_from_memory();

    if (!env.write || version === null || !vault) return "held";

    const key = await calendar_write_key(vault);

    if (!key) return "held";

    const record = await encrypt_calendar_payload(payload, vault, binding, key);
    const reopened = await decrypt_calendar_payload<unknown>(
      record,
      vault,
      binding,
    );

    if (
      !reopened.bound ||
      JSON.stringify(reopened.payload) !== JSON.stringify(payload)
    ) {
      return "held";
    }
    if (!(await env.active())) return "held";

    const path = is_event ? CALENDAR_EVENTS_PATH : CALENDARS_PATH;
    const id = binding.event_id ?? binding.calendar_id;
    const saved = await api_client.put<unknown>(
      `${path}/${encodeURIComponent(id)}`,
      {
        encrypted_blob: record.ciphertext,
        blob_nonce: record.nonce,
        expected_version: version,
      },
    );

    return saved.error ? "held" : "rewrapped";
  } catch {
    return "held";
  } finally {
    plaintext.fill(0);
  }
}

async function scan_calendar_rows(
  env: PassEnv,
  rows: CalendarBlobRow[],
  is_event: boolean,
  result: PassResult,
): Promise<void> {
  for (const row of rows) {
    result.checked++;

    const outcome = await rewrap_calendar_row(env, row, is_event);

    if (outcome === "rewrapped") result.rewrapped++;
    if (outcome === "held") result.held++;
    if (outcome === "invalid") {
      result.held++;
      result.parked++;
    }
  }
}

async function scan_calendar_list(
  env: PassEnv,
  result: PassResult,
): Promise<"done" | "absent" | "failed"> {
  let query = "";

  for (let page = 0; page < MAX_PAGES; page++) {
    const response = await api_client.get<CalendarListPage>(
      `${CALENDARS_PATH}${query}`,
      { skip_cache: true },
    );

    if (response.status === NOT_FOUND_STATUS) return "absent";
    if (response.error || !Array.isArray(response.data?.calendars)) {
      return "failed";
    }

    await scan_calendar_rows(env, response.data.calendars, false, result);

    if (!response.data.has_more) return "done";
    if (!response.data.server_time || !response.data.cursor_id) {
      return "failed";
    }

    const params = new URLSearchParams({
      since: response.data.server_time,
      since_id: response.data.cursor_id,
    });

    query = `?${params.toString()}`;
  }

  return "failed";
}

async function scan_calendar_events(
  env: PassEnv,
  result: PassResult,
): Promise<boolean> {
  let cursor: string | null = null;

  for (let page = 0; page < MAX_PAGES; page++) {
    const params = new URLSearchParams({ limit: String(PAGE_SIZE) });

    if (cursor) params.set("cursor", cursor);

    const response = await api_client.get<CalendarEventPage>(
      `${CALENDAR_EVENTS_PATH}?${params.toString()}`,
      { skip_cache: true },
    );

    if (response.error || !Array.isArray(response.data?.events)) return false;

    await scan_calendar_rows(env, response.data.events, true, result);

    if (!response.data.has_more) return true;
    if (!response.data.next_cursor) return false;

    cursor = response.data.next_cursor;
  }

  return false;
}

const rewrap_calendar: PassHandler = async (env) => {
  const result = empty_pass(false);
  const listed = await scan_calendar_list(env, result);

  if (listed === "failed") return result;
  if (listed === "done" && !(await scan_calendar_events(env, result))) {
    return result;
  }

  result.complete = true;

  return result;
};

interface RecoveryEmailRow {
  encrypted_email?: string | null;
  email_nonce?: string | null;
  exists?: boolean;
  step_up_required?: boolean;
}

const RECOVERY_EMAIL_PATH = "/core/v1/recovery/email";

const scan_recovery_email: PassHandler = async (env) => {
  const response = await api_client.get<RecoveryEmailRow>(
    RECOVERY_EMAIL_PATH,
    { skip_cache: true },
  );

  if (response.error || !response.data) return empty_pass(false);

  const row = response.data;
  const result = empty_pass(true);

  if (row.exists === false) return result;
  if (!row.encrypted_email || !row.email_nonce) {
    if (row.exists === true || row.step_up_required === true) {
      result.held = 1;
      result.parked = 1;
    }

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
    result.parked = 1;
  }

  return result;
};

const HANDLERS: Partial<Record<AccountDataContext, PassHandler>> = {
  "astermail-tags-v1": rewrap_tags,
  "astermail-labels-v1": rewrap_labels,
  "astermail-preferences-v1": rewrap_preferences,
  "astermail-devmode-v1": rewrap_dev_mode,
  "astermail-draft-v1": rewrap_drafts,
  "astermail-draft-v2": rewrap_drafts,
  "astermail-scheduled-v1": rewrap_scheduled,
  "astermail-onboarding-v1": rewrap_onboarding,
  "astermail-subscriptions-v1": rewrap_subscriptions,
  "astermail-recovery-email-v1": scan_recovery_email,
  "astermail-calendar-v2": rewrap_calendar,
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

function pass_status(pass: PassResult): ContextOutcome["status"] {
  if (!pass.complete) return "retry";
  if (pass.held === 0) return "clean";

  return pass.held === pass.parked ? "parked" : "retry";
}

async function settle_context(
  handler: PassHandler,
  identity_key: string,
  context: AccountDataContext,
  summary: RetiredRewrapSummary,
  active: () => Promise<boolean>,
): Promise<ContextOutcome> {
  const retired = get_retired_context_key(context);

  if (!retired) return { status: "retry", rewrote: false };

  let target_key: Promise<CryptoKey> | null = null;
  const target = (): Promise<CryptoKey> => {
    target_key ??= current_write_key(
      identity_key,
      TARGET_CONTEXTS[context] ?? context,
    );

    return target_key;
  };

  const first = await run_pass(handler, {
    retired,
    write: true,
    target,
    active,
  });

  summary.checked += first.checked;
  summary.rewrapped += first.rewrapped;

  if (!first.complete || first.held > 0) {
    summary.held += first.held;

    return { status: pass_status(first), rewrote: first.rewrapped > 0 };
  }
  if (first.rewrapped === 0) return { status: "clean", rewrote: false };

  const verify = await run_pass(handler, {
    retired,
    write: false,
    target,
    active,
  });

  summary.held += verify.held;

  return { status: pass_status(verify), rewrote: true };
}

async function drop_settled(
  account_id: string,
  identity_key: string,
  settled: AccountDataContext[],
): Promise<AccountDataContext[]> {
  if (settled.length === 0) return [];

  return with_vault_write_lock_bounded(async () => {
    if (!(await owns_session(account_id, identity_key))) return [];

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

    if (get_vault_owner_id() !== account_id) return [];

    const written = await write_vault_merged({
      next,
      base: vault,
      user_id: account_id,
      drop_legacy_keks: values,
    });

    return written.status === "written" ? settled : [];
  }, VAULT_LOCK_WAIT_MS);
}

function is_due(entry: ContextState | undefined, at: number): boolean {
  if (!entry || at >= entry.next_at) return true;

  return entry.next_at - at > RETIRED_REWRAP_HELD_MS;
}

async function run_locked(
  account_id: string,
  now: () => number,
): Promise<RetiredRewrapSummary | null> {
  if (get_vault_owner_id() !== account_id) return null;

  const vault = get_vault_from_memory();
  const identity_key = vault?.identity_key;

  if (!vault || !identity_key) return null;

  const active = (): Promise<boolean> => owns_session(account_id, identity_key);

  if (!(await active())) return null;

  const contexts = retired_contexts_in(vault.legacy_keks);

  if (contexts.length === 0) {
    write_state(account_id, null);

    return null;
  }

  const scanned = contexts.filter((context) => HANDLERS[context]);

  if (scanned.length === 0) {
    write_state(account_id, null);

    return null;
  }

  const state = read_state(account_id);
  const at = now();

  const forced = new Set(refused_reads.get(account_id));
  const due = scanned.filter(
    (context) => forced.has(context) || is_due(state[context], at),
  );

  if (due.length === 0) return null;

  const summary: RetiredRewrapSummary = {
    checked: 0,
    rewrapped: 0,
    held: 0,
    dropped: [],
    pending: [],
    confirming: [],
    kept: contexts.filter((context) => !HANDLERS[context]),
  };
  const next_state: RewrapState = {};
  const settled: AccountDataContext[] = [];

  for (const context of scanned) {
    const entry = state[context];

    if (entry) next_state[context] = entry;
  }

  for (const context of due) {
    const handler = HANDLERS[context];

    if (!handler) continue;

    const outcome = await settle_context(
      handler,
      identity_key,
      context,
      summary,
      active,
    );

    if (!(await active())) return null;

    const previous = state[context];
    const refused = forced.has(context);

    if (refused) refused_reads.get(account_id)?.delete(context);

    if (outcome.status === "parked") {
      summary.pending.push(context);
      next_state[context] = {
        next_at: at + RETIRED_REWRAP_HELD_MS,
        attempts: 0,
        clean_since: null,
      };
      continue;
    }
    if (outcome.status === "retry") {
      const attempts = (previous?.attempts ?? 0) + 1;

      summary.pending.push(context);
      next_state[context] = {
        next_at: at + retry_wait_ms(attempts),
        attempts,
        clean_since: null,
      };
      continue;
    }

    const marked = refused ? at : (previous?.uncovered_since ?? null);

    if (
      !outcome.rewrote &&
      marked !== null &&
      marked <= at &&
      at - marked < RETIRED_REWRAP_CONFIRM_MS
    ) {
      summary.pending.push(context);
      next_state[context] = {
        next_at: at + RETIRED_REWRAP_HELD_MS,
        attempts: 0,
        clean_since: null,
        uncovered_since: marked,
      };
      continue;
    }

    const since = previous?.clean_since ?? null;
    const restarted = outcome.rewrote || since === null || since > at;
    const clean_since = restarted ? at : since;

    next_state[context] = {
      next_at: at + RETIRED_REWRAP_RESCAN_MS,
      attempts: 0,
      clean_since,
    };

    if (restarted || at - clean_since < RETIRED_REWRAP_CONFIRM_MS) {
      summary.confirming.push(context);
    } else {
      settled.push(context);
    }
  }

  try {
    summary.dropped = await drop_settled(account_id, identity_key, settled);
  } catch (caught) {
    ignore_error("services/crypto/retired_key_rewrap:drop_settled", caught);
  }

  const dropped = new Set(summary.dropped);

  for (const context of settled) {
    if (dropped.has(context)) {
      delete next_state[context];
      continue;
    }

    const attempts = (state[context]?.attempts ?? 0) + 1;

    summary.pending.push(context);
    next_state[context] = {
      next_at: at + retry_wait_ms(attempts),
      attempts,
      clean_since: next_state[context]?.clean_since ?? null,
    };
  }

  write_state(account_id, next_state);

  return summary;
}

function request_rescan(account_id: string): void {
  if (rescan_requests.has(account_id)) return;

  rescan_requests.add(account_id);
  setTimeout(() => {
    rescan_requests.delete(account_id);
    run_retired_key_rewrap(account_id).catch((caught) => {
      ignore_error("services/crypto/retired_key_rewrap:rescan", caught);
    });
  }, 0);
}

export function retired_read_allowed(context: AccountDataContext): boolean {
  const account_id = get_vault_owner_id();

  if (!account_id) return true;

  const entry = read_state(account_id)[context];

  if (!entry || entry.clean_since === null) return true;

  const refused =
    refused_reads.get(account_id) ?? new Set<AccountDataContext>();

  refused.add(context);
  refused_reads.set(account_id, refused);
  request_rescan(account_id);

  return false;
}

set_retired_read_guard(retired_read_allowed);

export async function run_retired_key_rewrap(
  account_id: string,
  now: () => number = Date.now,
): Promise<RetiredRewrapSummary | null> {
  if (!account_id || running.has(account_id)) return null;

  running.add(account_id);

  try {
    const locks =
      typeof navigator !== "undefined" ? navigator.locks : undefined;

    if (!locks?.request) return await run_locked(account_id, now);

    return await locks.request(
      `${LOCK_NAME}:${account_id}`,
      { ifAvailable: true },
      (lock) => (lock ? run_locked(account_id, now) : null),
    );
  } catch (caught) {
    ignore_error("services/crypto/retired_key_rewrap:run", caught);

    return null;
  } finally {
    running.delete(account_id);
  }
}

export function retired_key_rewrap_wait_ms(
  account_id: string,
  now: () => number = Date.now,
): number | null {
  if (get_vault_owner_id() !== account_id) return null;

  const handled = retired_contexts_in(
    get_vault_from_memory()?.legacy_keks,
  ).filter((context) => HANDLERS[context]);

  if (handled.length === 0) return null;
  if (refused_reads.get(account_id)?.size) return RETIRED_REWRAP_RETRY_MS;

  const state = read_state(account_id);
  const at = now();
  let wait = RETIRED_REWRAP_HELD_MS;

  for (const context of handled) {
    const entry = state[context];

    wait = Math.min(wait, entry ? entry.next_at - at : 0);
  }

  return Math.max(wait, RETIRED_REWRAP_RETRY_MS);
}

export interface RetiredRewrapTimers {
  now?: () => number;
  set_timer?: (callback: () => void, wait_ms: number) => unknown;
  clear_timer?: (handle: unknown) => void;
}

export function schedule_retired_key_rewrap(
  account_id: string,
  timers: RetiredRewrapTimers = {},
): () => void {
  const now = timers.now ?? Date.now;
  const set_timer =
    timers.set_timer ??
    ((callback: () => void, wait_ms: number) => setTimeout(callback, wait_ms));
  const clear_timer =
    timers.clear_timer ??
    ((handle: unknown) =>
      clearTimeout(handle as ReturnType<typeof setTimeout>));
  let cancelled = false;
  let handle: unknown = null;

  const attempt = (): void => {
    handle = null;
    run_retired_key_rewrap(account_id, now)
      .catch((caught) => {
        ignore_error("services/crypto/retired_key_rewrap:schedule", caught);
      })
      .then(() => {
        if (cancelled) return;

        const wait = retired_key_rewrap_wait_ms(account_id, now);

        if (wait !== null) handle = set_timer(attempt, wait);
      });
  };

  attempt();

  return () => {
    cancelled = true;
    if (handle !== null) clear_timer(handle);
    handle = null;
  };
}
