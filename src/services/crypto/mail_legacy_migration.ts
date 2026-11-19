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
import type {
  EncryptedVault,
  MailLegacyRetiredMarker,
} from "./key_manager_core";
import type { ApiResponse } from "@/services/api/client/helpers";
import type {
  AttachmentMetaItem,
  BatchAttachmentMetaResponse,
} from "@/services/api/attachments";
import type {
  ListEncryptedMailItemsParams,
  MailItem,
  MailItemsListResponse,
  RewrapMailItemEnvelopeRequest,
} from "@/services/api/mail";

import { sha256 } from "@noble/hashes/sha256";

import { array_to_base64, base64_to_array } from "./base64";
import { is_attachment_meta_v2_nonce } from "./attachment_meta_v2";
import {
  decrypt_envelope_plaintext_with_bytes,
  decrypt_envelope_with_identity_key,
  decrypt_metadata,
  encrypt_metadata,
  type EncryptedBlob,
  type MailKeyOptions,
} from "./envelope";
import {
  decrypt_envelope_v2_plaintext,
  envelope_sha256_hex,
  envelope_v2_keys_from_vault,
  is_envelope_v1_nonce,
  is_envelope_v2_nonce,
  is_stored_envelope_v2_family_nonce,
  wipe_envelope_v2_keys,
} from "./envelope_v2";
import { MAIL_METADATA_CONTEXT } from "./constants";
import { vault_identity_key_materials } from "./identity_key_materials";
import { decrypt_legacy_ios_mail_envelope } from "./legacy_ios_envelope";
import {
  is_mail_legacy_retired,
  new_mail_legacy_retired_marker,
  vault_marks_mail_legacy_retired,
} from "./mail_legacy_retirement";
import {
  encrypt_envelope_for_storage,
  stored_envelope_write_binding,
} from "./stored_envelope_write";
import { open_vouched_login_salted_envelope } from "./vouched_login_salt_envelope";
import { zero_uint8_array } from "./secure_memory";

export const MAIL_LEGACY_MIGRATION_PAGE_SIZE = 50;

const STATE_KEY_PREFIX = "astermail_mail_legacy_migration_";
const IDENTITY_NONCE_LENGTH = 12;
const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/;
const ENVELOPE_CHANGED = "ENVELOPE_CHANGED";
const NOT_FOUND = "NOT_FOUND";
const PAUSE_STATUSES = new Set([401, 403, 429, 503]);
const STRICT: MailKeyOptions = { allow_legacy_keys: false };
const LENIENT: MailKeyOptions = { allow_legacy_keys: true };
const START_DELAY_MS = 2_000;
const RETRY_DELAY_MS = 60_000;
const MAX_RETRY_DELAY_STEPS = 10;
const ITEM_FAILURE_LIMIT = 3;
const SEAL_FAILURE_LIMIT = 5;
const RECENT_MARGIN_MS = 60 * 60 * 1000;
const UNREADABLE_ID_LIMIT = 500;
const UNREADABLE_DIGEST_LIMIT = 20_000;
const UNREADABLE_DIGEST_BYTES = 9;
const SEAL_PROBE = Object.freeze({ seal_probe: true });

type KeyValueStore = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export type MailLegacyMigrationResult =
  "done" | "deferred" | "incomplete" | "failed" | "paused" | "unavailable";

export type RewrapOutcome =
  | "written"
  | "skipped"
  | "unreadable"
  | "changed"
  | "failed"
  | "paused"
  | "unavailable";

export type StoredRecordState =
  | { kind: "current" }
  | { kind: "unreadable" }
  | { kind: "legacy"; data: object };

export interface MailLegacyMigrationState {
  cursor?: string;
  processed: number;
  rewritten: number;
  started_at?: number;
  scan_done?: boolean;
  verify_cursor?: string;
  verify_done?: boolean;
  retry_ids?: Record<string, number>;
  seal_failure_ids?: Record<string, number>;
  skipped_ids?: string[];
  unreadable_ids?: string[];
  unreadable_digests?: string[];
  unreadable_overflow?: number;
}

export interface MailMetadataWrite {
  encrypted_metadata: string;
  metadata_nonce: string;
}

export interface AttachmentMetaWrite {
  encrypted_meta: string;
  meta_nonce: string;
}

export interface MailLegacyMigrationDeps {
  list: (
    params: ListEncryptedMailItemsParams,
  ) => Promise<ApiResponse<MailItemsListResponse>>;
  get_item?: (item_id: string) => Promise<ApiResponse<MailItem>>;
  rewrap: (
    item_id: string,
    data: RewrapMailItemEnvelopeRequest,
  ) => Promise<ApiResponse<unknown>>;
  update_metadata: (
    item_id: string,
    data: MailMetadataWrite,
  ) => Promise<ApiResponse<unknown>>;
  batch_attachment_meta: (
    mail_ids: string[],
  ) => Promise<ApiResponse<BatchAttachmentMetaResponse>>;
  update_attachment_meta: (
    attachment_id: string,
    data: AttachmentMetaWrite,
  ) => Promise<ApiResponse<unknown>>;
  get_storage_write_crypto_key: () => Promise<CryptoKey | null>;
  protected_folder_tokens: () => Promise<string[] | null>;
  get_vault: () => EncryptedVault | null;
  get_passphrase_bytes: () => Uint8Array | null;
  get_metadata_key: () => Uint8Array | null;
  write_marker: (marker: MailLegacyRetiredMarker) => Promise<boolean>;
  stored_keys_ready: () => Promise<boolean>;
  storage: () => KeyValueStore | null;
  now: () => number;
  is_draft_busy?: (item_id: string) => boolean;
  on_progress?: (state: MailLegacyMigrationState) => void;
}

type EnvelopeFields = Pick<MailItem, "encrypted_envelope" | "envelope_nonce">;
type MetadataFields = Pick<
  MailItem,
  "encrypted_metadata" | "metadata_nonce" | "metadata_version"
>;

function state_key(user_id: string): string {
  return `${STATE_KEY_PREFIX}${user_id}`;
}

function non_negative_integer(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : 0;
}

export function read_mail_legacy_migration_state(
  store: KeyValueStore | null,
  user_id: string,
): MailLegacyMigrationState {
  try {
    const raw = store?.getItem(state_key(user_id));

    if (!raw) return { processed: 0, rewritten: 0 };

    const parsed = JSON.parse(raw) as Partial<MailLegacyMigrationState>;
    const state: MailLegacyMigrationState = {
      cursor: typeof parsed.cursor === "string" ? parsed.cursor : undefined,
      processed: non_negative_integer(parsed.processed),
      rewritten: non_negative_integer(parsed.rewritten),
    };

    if (typeof parsed.started_at === "number" && parsed.started_at > 0) {
      state.started_at = parsed.started_at;
    }
    if (parsed.scan_done === true) state.scan_done = true;
    if (typeof parsed.verify_cursor === "string") {
      state.verify_cursor = parsed.verify_cursor;
    }
    if (parsed.verify_done === true) state.verify_done = true;

    const retry_ids = parse_retry_ids(parsed.retry_ids);
    const seal_failure_ids = parse_retry_ids(parsed.seal_failure_ids);
    const skipped_ids = parse_id_list(parsed.skipped_ids);
    const unreadable_ids = parse_id_list(parsed.unreadable_ids);
    const unreadable_digests = parse_id_list(parsed.unreadable_digests);
    const unreadable_overflow = non_negative_integer(
      parsed.unreadable_overflow,
    );

    if (retry_ids) state.retry_ids = retry_ids;
    if (seal_failure_ids) state.seal_failure_ids = seal_failure_ids;
    if (skipped_ids) state.skipped_ids = skipped_ids;
    if (unreadable_ids) state.unreadable_ids = unreadable_ids;
    if (unreadable_digests) state.unreadable_digests = unreadable_digests;
    if (unreadable_overflow > 0) {
      state.unreadable_overflow = unreadable_overflow;
    }

    return state;
  } catch {
    return { processed: 0, rewritten: 0 };
  }
}

function parse_retry_ids(value: unknown): Record<string, number> | undefined {
  const record = as_record(value);

  if (!record || Array.isArray(record)) return undefined;

  const entries = Object.entries(record).filter(
    ([id, count]) => id.length > 0 && typeof count === "number",
  );

  if (entries.length === 0) return undefined;

  return Object.fromEntries(
    entries.map(([id, count]) => [id, non_negative_integer(count)]),
  );
}

function parse_id_list(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;

  const ids = value.filter(
    (id): id is string => typeof id === "string" && id.length > 0,
  );

  return ids.length > 0 ? Array.from(new Set(ids)) : undefined;
}

function write_state(
  store: KeyValueStore | null,
  user_id: string,
  state: MailLegacyMigrationState | null,
): void {
  try {
    if (state) store?.setItem(state_key(user_id), JSON.stringify(state));
    else store?.removeItem(state_key(user_id));
  } catch {
    return;
  }
}

function as_record(value: unknown): object | null {
  return value && typeof value === "object" ? value : null;
}

function parse_record(text: string | null): object | null {
  if (text === null) return null;

  try {
    return as_record(JSON.parse(text));
  } catch {
    return null;
  }
}

function decode_text(plaintext: ArrayBuffer): string {
  return new TextDecoder("utf-8", { fatal: true }).decode(plaintext);
}

async function open_identity_envelope(
  identity_keys: string[],
  bytes: Uint8Array,
  nonce: Uint8Array,
  options: MailKeyOptions,
): Promise<string | null> {
  for (const identity_key of identity_keys) {
    const text = await decrypt_envelope_with_identity_key(
      identity_key,
      bytes,
      nonce,
      decode_text,
      options,
    );

    if (text !== null) return text;
  }

  const legacy = await decrypt_legacy_ios_mail_envelope(bytes, nonce, options);

  if (!legacy) return null;

  try {
    return decode_text(legacy);
  } catch {
    return null;
  }
}

async function open_envelope_text(
  item: EnvelopeFields,
  vault: EncryptedVault,
  passphrase: Uint8Array,
  options: MailKeyOptions,
): Promise<string | null> {
  if (is_envelope_v1_nonce(item.envelope_nonce)) {
    const opened = await decrypt_envelope_plaintext_with_bytes(
      item.encrypted_envelope,
      passphrase,
      options,
    );

    if (opened !== null || options === STRICT) return opened;

    return open_vouched_login_salted_envelope(
      item.encrypted_envelope,
      passphrase,
      vault,
    );
  }

  return open_identity_envelope(
    vault_identity_key_materials(vault),
    base64_to_array(item.encrypted_envelope),
    base64_to_array(item.envelope_nonce),
    options,
  );
}

function is_keyed_nonce(nonce: string | undefined): boolean {
  if (!nonce || is_stored_envelope_v2_family_nonce(nonce)) return false;
  if (is_envelope_v1_nonce(nonce)) return true;

  try {
    return base64_to_array(nonce).length === IDENTITY_NONCE_LENGTH;
  } catch {
    return false;
  }
}

export async function classify_stored_envelope(
  item: EnvelopeFields,
  vault: EncryptedVault,
  passphrase: Uint8Array,
): Promise<StoredRecordState> {
  if (!item.encrypted_envelope || !is_keyed_nonce(item.envelope_nonce)) {
    return { kind: "current" };
  }

  try {
    if (await open_envelope_text(item, vault, passphrase, STRICT)) {
      return { kind: "current" };
    }

    const data = parse_record(
      await open_envelope_text(item, vault, passphrase, LENIENT),
    );

    return data ? { kind: "legacy", data } : { kind: "unreadable" };
  } catch {
    return { kind: "unreadable" };
  }
}

async function open_resealed_text(
  sealed: { encrypted: string; nonce: string },
  vault: EncryptedVault,
  item_id: string,
): Promise<string | null> {
  if (is_stored_envelope_v2_family_nonce(sealed.nonce)) {
    const keys = envelope_v2_keys_from_vault(vault);
    const binding = is_envelope_v2_nonce(sealed.nonce)
      ? undefined
      : stored_envelope_write_binding(item_id);

    if (!is_envelope_v2_nonce(sealed.nonce) && !binding) return null;

    try {
      return await decrypt_envelope_v2_plaintext(
        sealed.encrypted,
        keys,
        binding,
      );
    } finally {
      wipe_envelope_v2_keys(keys);
    }
  }

  return decrypt_envelope_with_identity_key(
    vault.identity_key,
    base64_to_array(sealed.encrypted),
    base64_to_array(sealed.nonce),
    decode_text,
    STRICT,
  );
}

export async function reseal_stored_envelope(
  data: object,
  vault: EncryptedVault,
  item_id: string,
): Promise<{ encrypted: string; nonce: string } | null> {
  try {
    const sealed = await encrypt_envelope_for_storage(data, vault, item_id);
    const reopened = await open_resealed_text(sealed, vault, item_id);

    return reopened === JSON.stringify(data) ? sealed : null;
  } catch {
    return null;
  }
}

async function safe_sha256_hex(b64: string): Promise<string | null> {
  try {
    const hex = await envelope_sha256_hex(b64);

    return SHA256_HEX_PATTERN.test(hex) ? hex : null;
  } catch {
    return null;
  }
}

export function classify_rewrap_response(
  response: ApiResponse<unknown>,
): RewrapOutcome {
  if (!response.error) return "written";
  if (!response.status || PAUSE_STATUSES.has(response.status)) return "paused";
  if (response.status === 404) {
    return response.server_code === NOT_FOUND ? "skipped" : "unavailable";
  }
  if (response.status === 426) return "unavailable";
  if (response.status === 409 && response.server_code === ENVELOPE_CHANGED) {
    return "changed";
  }

  return "failed";
}

export async function migrate_item_envelope(
  item: Pick<MailItem, "id"> & EnvelopeFields,
  vault: EncryptedVault,
  passphrase: Uint8Array,
  deps: Pick<MailLegacyMigrationDeps, "rewrap">,
): Promise<RewrapOutcome> {
  const state = await classify_stored_envelope(item, vault, passphrase);

  if (state.kind === "unreadable") return "unreadable";
  if (state.kind !== "legacy") return "skipped";

  const expected_envelope_sha256 = await safe_sha256_hex(
    item.encrypted_envelope,
  );

  if (!expected_envelope_sha256) return "failed";

  const sealed = await reseal_stored_envelope(state.data, vault, item.id);

  if (!sealed) return "failed";

  try {
    return classify_rewrap_response(
      await deps.rewrap(item.id, {
        encrypted_envelope: sealed.encrypted,
        envelope_nonce: sealed.nonce,
        expected_envelope_sha256,
      }),
    );
  } catch {
    return "paused";
  }
}

async function open_metadata(
  item: MetadataFields,
  metadata_key: Uint8Array,
  options: MailKeyOptions,
): Promise<object | null> {
  return as_record(
    await decrypt_metadata<unknown>(
      {
        encrypted_data: item.encrypted_metadata ?? "",
        nonce: item.metadata_nonce ?? "",
        version: item.metadata_version ?? 1,
      },
      metadata_key,
      MAIL_METADATA_CONTEXT,
      options,
    ),
  );
}

export function vault_prior_storage_keys(
  vault: Pick<EncryptedVault, "storage_rekey"> | null | undefined,
): Uint8Array[] {
  const keys: Uint8Array[] = [];

  for (const encoded of vault?.storage_rekey?.prior_keys ?? []) {
    try {
      const raw = base64_to_array(encoded);

      if (raw.length > 0) keys.push(raw);
    } catch {
      continue;
    }
  }

  return keys;
}

export async function classify_stored_metadata(
  item: MetadataFields,
  metadata_key: Uint8Array,
  prior_keys: Uint8Array[] = [],
): Promise<StoredRecordState> {
  if (!item.encrypted_metadata || !item.metadata_nonce) {
    return { kind: "current" };
  }
  if (await open_metadata(item, metadata_key, STRICT)) {
    return { kind: "current" };
  }

  for (const prior_key of prior_keys) {
    const opened = await open_metadata(item, prior_key, STRICT);

    if (opened) return { kind: "legacy", data: opened };
  }

  const data = await open_metadata(item, metadata_key, LENIENT);

  return data ? { kind: "legacy", data } : { kind: "unreadable" };
}

type MetadataOutcome = RewrapOutcome | "unsealable";

export async function migrate_item_metadata(
  item: Pick<MailItem, "id"> & MetadataFields,
  metadata_key: Uint8Array,
  deps: Pick<MailLegacyMigrationDeps, "update_metadata">,
  prior_keys: Uint8Array[] = [],
): Promise<RewrapOutcome> {
  const outcome = await migrate_item_metadata_detail(
    item,
    metadata_key,
    deps,
    prior_keys,
  );

  return outcome === "unsealable" ? "failed" : outcome;
}

async function seal_verified_metadata(
  data: object,
  metadata_key: Uint8Array,
): Promise<EncryptedBlob | null> {
  const blob = await encrypt_metadata(
    data,
    metadata_key,
    MAIL_METADATA_CONTEXT,
  );

  if (!blob) return null;

  const reopened = await open_metadata(
    {
      encrypted_metadata: blob.encrypted_data,
      metadata_nonce: blob.nonce,
      metadata_version: blob.version,
    },
    metadata_key,
    STRICT,
  );

  return JSON.stringify(reopened) === JSON.stringify(data) ? blob : null;
}

async function migrate_item_metadata_detail(
  item: Pick<MailItem, "id"> & MetadataFields,
  metadata_key: Uint8Array,
  deps: Pick<MailLegacyMigrationDeps, "update_metadata">,
  prior_keys: Uint8Array[],
): Promise<MetadataOutcome> {
  const state = await classify_stored_metadata(item, metadata_key, prior_keys);

  if (state.kind !== "legacy") return "skipped";

  const blob = await seal_verified_metadata(state.data, metadata_key);

  if (!blob) {
    return (await seal_verified_metadata(SEAL_PROBE, metadata_key))
      ? "unsealable"
      : "paused";
  }

  try {
    return classify_rewrap_response(
      await deps.update_metadata(item.id, {
        encrypted_metadata: blob.encrypted_data,
        metadata_nonce: blob.nonce,
      }),
    );
  } catch {
    return "paused";
  }
}

function is_ios_sealed_meta_nonce(meta_nonce: string | undefined): boolean {
  if (!meta_nonce || is_attachment_meta_v2_nonce(meta_nonce)) return false;

  try {
    const nonce = base64_to_array(meta_nonce);

    return (
      nonce.length === IDENTITY_NONCE_LENGTH && nonce.some((byte) => byte !== 0)
    );
  } catch {
    return false;
  }
}

async function open_ios_meta(
  meta: Pick<AttachmentMetaItem, "encrypted_meta" | "meta_nonce">,
  options: MailKeyOptions,
): Promise<string | null> {
  try {
    const plaintext = await decrypt_legacy_ios_mail_envelope(
      base64_to_array(meta.encrypted_meta),
      base64_to_array(meta.meta_nonce),
      options,
    );

    return plaintext ? decode_text(plaintext) : null;
  } catch {
    return null;
  }
}

async function seal_ios_meta(
  text: string,
  write_key: CryptoKey,
): Promise<AttachmentMetaWrite> {
  const nonce = crypto.getRandomValues(new Uint8Array(IDENTITY_NONCE_LENGTH));
  const sealed = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    write_key,
    new TextEncoder().encode(text),
  );

  return {
    encrypted_meta: array_to_base64(new Uint8Array(sealed)),
    meta_nonce: array_to_base64(nonce),
  };
}

export async function migrate_attachment_meta(
  meta: AttachmentMetaItem,
  deps: Pick<
    MailLegacyMigrationDeps,
    "update_attachment_meta" | "get_storage_write_crypto_key"
  >,
): Promise<RewrapOutcome> {
  if (!meta.encrypted_meta || !is_ios_sealed_meta_nonce(meta.meta_nonce)) {
    return "skipped";
  }
  if (await open_ios_meta(meta, STRICT)) return "skipped";

  const text = await open_ios_meta(meta, LENIENT);

  if (!text || !parse_record(text)) return "skipped";

  const write_key = await deps.get_storage_write_crypto_key().catch(() => null);

  if (!write_key) return "paused";

  let body: AttachmentMetaWrite;

  try {
    body = await seal_ios_meta(text, write_key);
  } catch {
    return "failed";
  }

  if ((await open_ios_meta(body, STRICT)) !== text) return "failed";

  try {
    return classify_rewrap_response(
      await deps.update_attachment_meta(meta.id, body),
    );
  } catch {
    return "paused";
  }
}

function may_hold_ios_attachment_meta(item: MailItem): boolean {
  return (
    (item.item_type === "sent" || item.item_type === "draft") &&
    (item.has_attachments === true || (item.attachment_count ?? 0) > 0)
  );
}

async function migrate_item_attachments(
  item: MailItem,
  deps: MailLegacyMigrationDeps,
): Promise<RewrapOutcome> {
  if (!may_hold_ios_attachment_meta(item)) return "skipped";

  let response: ApiResponse<BatchAttachmentMetaResponse>;

  try {
    response = await deps.batch_attachment_meta([item.id]);
  } catch {
    return "paused";
  }

  if (!response.data) return classify_rewrap_response(response);

  let result: RewrapOutcome = "skipped";

  for (const meta of response.data.items[item.id] ?? []) {
    const outcome = await migrate_attachment_meta(meta, deps);

    if (outcome === "paused" || outcome === "unavailable") return outcome;
    result = more_severe(result, outcome);
  }

  return result;
}

const OUTCOME_SEVERITY: RewrapOutcome[] = [
  "skipped",
  "unreadable",
  "written",
  "changed",
  "failed",
  "unavailable",
  "paused",
];

function more_severe(a: RewrapOutcome, b: RewrapOutcome): RewrapOutcome {
  return OUTCOME_SEVERITY.indexOf(a) >= OUTCOME_SEVERITY.indexOf(b) ? a : b;
}

interface ItemResult {
  outcome: RewrapOutcome;
  unreadable: boolean;
  unsealable?: boolean;
}

async function migrate_item(
  item: MailItem,
  keys: ScanKeys,
  deps: MailLegacyMigrationDeps,
): Promise<ItemResult> {
  const envelope = await migrate_item_envelope(
    item,
    keys.vault,
    keys.passphrase,
    deps,
  );

  if (envelope === "paused" || envelope === "unavailable") {
    return { outcome: envelope, unreadable: false };
  }

  const metadata_detail = await migrate_item_metadata_detail(
    item,
    keys.metadata_key,
    deps,
    keys.prior_keys,
  );
  const metadata =
    metadata_detail === "unsealable" ? "failed" : metadata_detail;
  const attachments = await migrate_item_attachments(item, deps);

  if (attachments === "paused" || attachments === "unavailable") {
    return { outcome: attachments, unreadable: false };
  }

  const envelope_effect = envelope === "unreadable" ? "skipped" : envelope;
  const others = more_severe(envelope_effect, attachments);

  return {
    outcome: more_severe(others, metadata),
    unreadable: envelope === "unreadable" || metadata === "unreadable",
    unsealable:
      metadata_detail === "unsealable" &&
      others !== "failed" &&
      others !== "changed",
  };
}

function item_needs_care(item: MailItem): boolean {
  return (
    is_keyed_nonce(item.envelope_nonce) ||
    (!!item.encrypted_metadata && !!item.metadata_nonce) ||
    may_hold_ios_attachment_meta(item)
  );
}

interface ScanKeys {
  vault: EncryptedVault;
  passphrase: Uint8Array;
  metadata_key: Uint8Array;
  prior_keys: Uint8Array[];
}

function forget_seal_failures(
  state: MailLegacyMigrationState,
  item_id: string,
): void {
  if (!state.seal_failure_ids || !(item_id in state.seal_failure_ids)) return;

  delete state.seal_failure_ids[item_id];
  if (Object.keys(state.seal_failure_ids).length === 0) {
    delete state.seal_failure_ids;
  }
}

function note_seal_failure(
  state: MailLegacyMigrationState,
  item_id: string,
): void {
  const failures = (state.seal_failure_ids?.[item_id] ?? 0) + 1;

  if (failures >= SEAL_FAILURE_LIMIT) {
    forget_seal_failures(state, item_id);
    forget_retry(state, item_id);
    note_unreadable(state, item_id);

    return;
  }

  state.seal_failure_ids = {
    ...(state.seal_failure_ids ?? {}),
    [item_id]: failures,
  };
  note_retry(state, item_id, false);
}

function forget_retry(state: MailLegacyMigrationState, item_id: string): void {
  forget_seal_failures(state, item_id);
  if (!state.retry_ids || !(item_id in state.retry_ids)) return;

  delete state.retry_ids[item_id];
  if (Object.keys(state.retry_ids).length === 0) delete state.retry_ids;
}

function note_retry(
  state: MailLegacyMigrationState,
  item_id: string,
  counts: boolean,
): void {
  const attempts = (state.retry_ids?.[item_id] ?? 0) + (counts ? 1 : 0);

  if (attempts >= ITEM_FAILURE_LIMIT) {
    forget_retry(state, item_id);
    state.skipped_ids = Array.from(
      new Set([...(state.skipped_ids ?? []), item_id]),
    );

    return;
  }

  state.retry_ids = { ...(state.retry_ids ?? {}), [item_id]: attempts };
}

function unreadable_digest(item_id: string): string {
  return array_to_base64(
    sha256(new TextEncoder().encode(item_id)).slice(0, UNREADABLE_DIGEST_BYTES),
  );
}

function note_unreadable(
  state: MailLegacyMigrationState,
  item_id: string,
): void {
  const ids = state.unreadable_ids ?? [];

  if (ids.includes(item_id)) return;
  if (ids.length < UNREADABLE_ID_LIMIT) {
    state.unreadable_ids = [...ids, item_id];

    return;
  }

  const digest = unreadable_digest(item_id);
  const digests = state.unreadable_digests ?? [];

  if (digests.includes(digest)) return;
  if (digests.length < UNREADABLE_DIGEST_LIMIT) {
    state.unreadable_digests = [...digests, digest];

    return;
  }
  state.unreadable_overflow = (state.unreadable_overflow ?? 0) + 1;
}

function forget_unreadable(
  state: MailLegacyMigrationState,
  item_id: string,
): void {
  if (state.unreadable_ids?.includes(item_id)) {
    state.unreadable_ids = state.unreadable_ids.filter((id) => id !== item_id);
    if (state.unreadable_ids.length === 0) delete state.unreadable_ids;

    return;
  }

  const digest = unreadable_digest(item_id);

  if (!state.unreadable_digests?.includes(digest)) return;
  state.unreadable_digests = state.unreadable_digests.filter(
    (entry) => entry !== digest,
  );
  if (state.unreadable_digests.length === 0) delete state.unreadable_digests;
}

export function count_unreadable(state: MailLegacyMigrationState): number {
  return (
    (state.unreadable_ids?.length ?? 0) +
    (state.unreadable_digests?.length ?? 0) +
    (state.unreadable_overflow ?? 0)
  );
}

function unreadable_fields(
  state: MailLegacyMigrationState,
): Partial<MailLegacyMigrationState> {
  return {
    ...(state.unreadable_ids ? { unreadable_ids: state.unreadable_ids } : {}),
    ...(state.unreadable_digests
      ? { unreadable_digests: state.unreadable_digests }
      : {}),
    ...(state.unreadable_overflow
      ? { unreadable_overflow: state.unreadable_overflow }
      : {}),
  };
}

function has_retries(state: MailLegacyMigrationState): boolean {
  return Object.keys(state.retry_ids ?? {}).length > 0;
}

function has_skipped(state: MailLegacyMigrationState): boolean {
  return (state.skipped_ids?.length ?? 0) > 0;
}

async function process_item(
  item: MailItem,
  keys: ScanKeys,
  deps: MailLegacyMigrationDeps,
  state: MailLegacyMigrationState,
): Promise<"paused" | "unavailable" | null> {
  if (!item_needs_care(item)) {
    forget_unreadable(state, item.id);
    forget_retry(state, item.id);

    return null;
  }
  if (deps.is_draft_busy?.(item.id)) {
    note_retry(state, item.id, false);

    return null;
  }

  const { outcome, unreadable, unsealable } = await migrate_item(
    item,
    keys,
    deps,
  );

  if (outcome === "paused" || outcome === "unavailable") return outcome;
  if (unreadable) note_unreadable(state, item.id);
  if (unsealable && outcome === "failed") {
    note_seal_failure(state, item.id);

    return null;
  }
  if (outcome === "changed" || outcome === "failed") {
    note_retry(state, item.id, true);

    return null;
  }
  if (outcome === "written") state.rewritten += 1;
  if (!unreadable) forget_unreadable(state, item.id);
  forget_retry(state, item.id);

  return null;
}

async function retry_noted_items(
  keys: ScanKeys,
  deps: MailLegacyMigrationDeps,
  state: MailLegacyMigrationState,
  persist: () => void,
): Promise<"paused" | "unavailable" | null> {
  const get_item = deps.get_item;

  if (!get_item) {
    if (has_retries(state) && state.scan_done) {
      state.scan_done = false;
      state.cursor = undefined;
      state.processed = 0;
      persist();
    }

    return null;
  }

  for (const item_id of Object.keys(state.retry_ids ?? {})) {
    let response: ApiResponse<MailItem>;

    try {
      response = await get_item(item_id);
    } catch {
      return "paused";
    }

    if (!response.data) {
      if (response.status === 404) {
        forget_retry(state, item_id);
      } else {
        const outcome = classify_rewrap_response(response);

        if (outcome === "paused" || outcome === "unavailable") return outcome;
        note_retry(state, item_id, true);
      }
      persist();
      continue;
    }

    const stopped = await process_item(response.data, keys, deps, state);

    if (stopped) return stopped;
    persist();
  }

  return null;
}

function item_time(value: string | undefined): number {
  if (!value) return Number.NaN;

  return Date.parse(value);
}

function is_recent(item: MailItem, cutoff: number): boolean {
  return (
    item_time(item.created_at) >= cutoff || item_time(item.message_ts) >= cutoff
  );
}

async function verify_all_items(
  keys: ScanKeys,
  deps: MailLegacyMigrationDeps,
  state: MailLegacyMigrationState,
  persist: () => void,
  seen: Set<string>,
): Promise<"paused" | "unavailable" | null> {
  while (!state.verify_done) {
    const response = await deps.list({
      limit: MAIL_LEGACY_MIGRATION_PAGE_SIZE,
      cursor: state.verify_cursor,
      include_envelope: true,
      include_reactions: true,
    });

    if (!response.data) {
      return classify_rewrap_response(response) === "unavailable"
        ? "unavailable"
        : "paused";
    }

    for (const item of response.data.items) {
      if (seen.has(item.id)) continue;

      const stopped = await process_item(item, keys, deps, state);

      if (stopped) return stopped;
      seen.add(item.id);
    }

    if (!response.data.has_more || !response.data.next_cursor) {
      state.verify_done = true;
      state.verify_cursor = undefined;
    } else {
      state.verify_cursor = response.data.next_cursor;
    }
    persist();
  }

  return null;
}

async function rescan_recent_items(
  keys: ScanKeys,
  deps: MailLegacyMigrationDeps,
  state: MailLegacyMigrationState,
  seen: Set<string>,
): Promise<"paused" | "unavailable" | null> {
  const cutoff = (state.started_at ?? deps.now()) - RECENT_MARGIN_MS;
  let cursor: string | undefined;

  for (;;) {
    const response = await deps.list({
      limit: MAIL_LEGACY_MIGRATION_PAGE_SIZE,
      cursor,
      include_envelope: true,
      include_reactions: true,
    });

    if (!response.data) {
      return classify_rewrap_response(response) === "unavailable"
        ? "unavailable"
        : "paused";
    }

    const items = response.data.items;

    for (const item of items) {
      if (!is_recent(item, cutoff) || seen.has(item.id)) continue;

      const stopped = await process_item(item, keys, deps, state);

      if (stopped) return stopped;
    }

    const last = items[items.length - 1];
    const reached_older =
      !last || !(item_time(last.message_ts ?? last.created_at) >= cutoff);

    if (
      reached_older ||
      !response.data.has_more ||
      !response.data.next_cursor
    ) {
      return null;
    }

    cursor = response.data.next_cursor;
  }
}

const MAIN_PASS_DONE_PREFIX = "astermail_mail_legacy_main_done_";
const FOLDER_PASS_DONE_PREFIX = "astermail_mail_legacy_folder_done_";

function read_flag(store: KeyValueStore | null, key: string): boolean {
  try {
    return store?.getItem(key) === "1";
  } catch {
    return false;
  }
}

function write_flag(store: KeyValueStore | null, key: string): void {
  try {
    store?.setItem(key, "1");
  } catch {
    return;
  }
}

function folder_pass_key(user_id: string, folder_token: string): string {
  return `${FOLDER_PASS_DONE_PREFIX}${user_id}_${folder_token}`;
}

const FOLDER_PASS_BACKOFF_PREFIX = "astermail_mail_legacy_folder_backoff_";

interface FolderPassBackoff {
  attempts: number;
  next_at: number;
}

function folder_backoff_key(user_id: string, folder_token: string): string {
  return `${FOLDER_PASS_BACKOFF_PREFIX}${user_id}_${folder_token}`;
}

export function read_mail_legacy_folder_backoff(
  store: KeyValueStore | null,
  user_id: string,
  folder_token: string,
): FolderPassBackoff | null {
  try {
    const raw = store?.getItem(folder_backoff_key(user_id, folder_token));

    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<FolderPassBackoff>;
    const attempts = non_negative_integer(parsed.attempts);

    if (attempts === 0 || typeof parsed.next_at !== "number") return null;

    return { attempts, next_at: parsed.next_at };
  } catch {
    return null;
  }
}

function note_folder_failure(
  store: KeyValueStore | null,
  user_id: string,
  folder_token: string,
  now: number,
): void {
  const attempts =
    (read_mail_legacy_folder_backoff(store, user_id, folder_token)?.attempts ??
      0) + 1;
  const next_at = now + mail_legacy_retry_delay_ms(2 ** (attempts - 1) - 1);

  try {
    store?.setItem(
      folder_backoff_key(user_id, folder_token),
      JSON.stringify({ attempts, next_at }),
    );
  } catch {
    return;
  }
}

function clear_folder_failure(
  store: KeyValueStore | null,
  user_id: string,
  folder_token: string,
): void {
  try {
    store?.removeItem(folder_backoff_key(user_id, folder_token));
  } catch {
    return;
  }
}

export function is_mail_legacy_folder_pass_done(
  store: KeyValueStore | null,
  user_id: string,
  folder_token: string,
): boolean {
  return read_flag(store, folder_pass_key(user_id, folder_token));
}

function outstanding_result(
  state: MailLegacyMigrationState,
): MailLegacyMigrationResult | null {
  if (has_skipped(state)) return "failed";
  if (has_retries(state)) return "incomplete";

  return null;
}

async function complete_retirement(
  user_id: string,
  keys: ScanKeys,
  deps: MailLegacyMigrationDeps,
  store: KeyValueStore | null,
  seen: Set<string> = new Set(),
): Promise<MailLegacyMigrationResult> {
  const folder_tokens = await deps.protected_folder_tokens();

  if (folder_tokens === null) return "paused";
  if (
    folder_tokens.some(
      (token) => !is_mail_legacy_folder_pass_done(store, user_id, token),
    )
  ) {
    return "deferred";
  }

  const ready = await deps.stored_keys_ready().catch(() => false);

  if (!ready) return "deferred";

  const state = read_mail_legacy_migration_state(store, user_id);
  const verified = await verify_all_items(
    keys,
    deps,
    state,
    () => write_state(store, user_id, state),
    seen,
  );

  if (verified) {
    write_state(store, user_id, state);

    return verified;
  }

  const stopped = await rescan_recent_items(keys, deps, state, seen);

  write_state(store, user_id, state);
  if (stopped) return stopped;

  const outstanding = outstanding_result(state);

  if (outstanding) return outstanding;

  const still_ready = await deps.stored_keys_ready().catch(() => false);

  if (!still_ready) return "deferred";

  let written: boolean;

  try {
    written = await deps.write_marker(
      new_mail_legacy_retired_marker(deps.now()),
    );
  } catch {
    written = false;
  }

  if (!written) return "paused";

  write_state(
    store,
    user_id,
    count_unreadable(state) > 0
      ? { processed: 0, rewritten: 0, ...unreadable_fields(state) }
      : null,
  );

  return "done";
}

function scan_keys(
  vault: EncryptedVault,
  deps: MailLegacyMigrationDeps,
): { keys: ScanKeys | null; wipe: () => void } {
  const passphrase = deps.get_passphrase_bytes();
  const metadata_key = deps.get_metadata_key();
  const prior_keys = vault_prior_storage_keys(vault);
  const wipe = () => {
    if (passphrase) zero_uint8_array(passphrase);
    if (metadata_key) zero_uint8_array(metadata_key);
    prior_keys.forEach((raw) => zero_uint8_array(raw));
  };

  if (!passphrase || !metadata_key) return { keys: null, wipe };

  return { keys: { vault, passphrase, metadata_key, prior_keys }, wipe };
}

export async function run_mail_legacy_migration(
  user_id: string,
  deps: MailLegacyMigrationDeps,
): Promise<MailLegacyMigrationResult> {
  const vault = deps.get_vault();

  if (!vault) return "paused";
  if (vault_marks_mail_legacy_retired(vault) || is_mail_legacy_retired()) {
    return "done";
  }

  const store = deps.storage();
  const state = read_mail_legacy_migration_state(store, user_id);
  const { keys, wipe } = scan_keys(vault, deps);
  const persist = () => write_state(store, user_id, state);

  try {
    if (!keys) return "paused";

    if (state.started_at === undefined) {
      state.started_at = deps.now();
      persist();
    }

    const retried = await retry_noted_items(keys, deps, state, persist);

    if (retried) return retried;

    const scanned = new Set<string>();

    while (!state.scan_done) {
      const response = await deps.list({
        limit: MAIL_LEGACY_MIGRATION_PAGE_SIZE,
        cursor: state.cursor,
        include_envelope: true,
        include_reactions: true,
      });

      if (!response.data) {
        return classify_rewrap_response(response) === "unavailable"
          ? "unavailable"
          : "paused";
      }

      for (const item of response.data.items) {
        state.processed += 1;

        const stopped = await process_item(item, keys, deps, state);

        if (stopped) return stopped;
        scanned.add(item.id);
      }

      deps.on_progress?.({ ...state });

      if (!response.data.has_more || !response.data.next_cursor) {
        state.scan_done = true;
        state.cursor = undefined;
      } else {
        state.cursor = response.data.next_cursor;
      }
      persist();
    }

    const outstanding = outstanding_result(state);

    if (outstanding) return outstanding;

    write_flag(store, `${MAIN_PASS_DONE_PREFIX}${user_id}`);

    return await complete_retirement(user_id, keys, deps, store, scanned);
  } catch {
    return "paused";
  } finally {
    wipe();
  }
}

export function requeue_mail_legacy_skipped_items(
  store: KeyValueStore | null,
  user_id: string,
): void {
  const state = read_mail_legacy_migration_state(store, user_id);

  if (!has_skipped(state)) return;

  const retry_ids = { ...(state.retry_ids ?? {}) };

  for (const item_id of state.skipped_ids ?? []) retry_ids[item_id] = 0;

  state.retry_ids = retry_ids;
  delete state.skipped_ids;
  write_state(store, user_id, state);
}

export interface MailLegacyFolderPassDeps extends MailLegacyMigrationDeps {
  list_page: (
    folder_token: string,
    offset: number,
    limit: number,
    trashed: boolean,
  ) => Promise<ApiResponse<{ items: MailItem[]; has_more?: boolean }>>;
  is_unlocked: (folder_token: string) => boolean;
}

export async function run_mail_legacy_folder_pass(
  user_id: string,
  folder_token: string,
  deps: MailLegacyFolderPassDeps,
): Promise<MailLegacyMigrationResult> {
  const vault = deps.get_vault();

  if (!vault) return "paused";
  if (vault_marks_mail_legacy_retired(vault) || is_mail_legacy_retired()) {
    return "done";
  }

  const store = deps.storage();
  const main_done = read_flag(store, `${MAIN_PASS_DONE_PREFIX}${user_id}`);
  const { keys, wipe } = scan_keys(vault, deps);

  try {
    if (!keys) return "paused";

    if (is_mail_legacy_folder_pass_done(store, user_id, folder_token)) {
      return main_done
        ? await complete_retirement(user_id, keys, deps, store)
        : "deferred";
    }

    const backoff = read_mail_legacy_folder_backoff(
      store,
      user_id,
      folder_token,
    );

    if (backoff && backoff.next_at > deps.now()) return "deferred";

    const folder_state: MailLegacyMigrationState = {
      processed: 0,
      rewritten: 0,
    };

    for (const trashed of [false, true]) {
      let offset = 0;

      for (;;) {
        if (!deps.is_unlocked(folder_token)) return "paused";

        const response = await deps.list_page(
          folder_token,
          offset,
          MAIL_LEGACY_MIGRATION_PAGE_SIZE,
          trashed,
        );

        if (!response.data) {
          return classify_rewrap_response(response) === "unavailable"
            ? "unavailable"
            : "paused";
        }

        const items = response.data.items ?? [];

        for (const item of items) {
          const stopped = await process_item(item, keys, deps, folder_state);

          if (stopped) return stopped;
        }

        if (
          items.length === 0 ||
          (items.length < MAIL_LEGACY_MIGRATION_PAGE_SIZE &&
            !response.data.has_more)
        ) {
          break;
        }

        offset += items.length;
      }
    }

    if (has_skipped(folder_state) || has_retries(folder_state)) {
      note_folder_failure(store, user_id, folder_token, deps.now());

      return has_skipped(folder_state) ? "failed" : "incomplete";
    }

    clear_folder_failure(store, user_id, folder_token);
    write_flag(store, folder_pass_key(user_id, folder_token));

    return main_done
      ? await complete_retirement(user_id, keys, deps, store)
      : "deferred";
  } catch {
    return "paused";
  } finally {
    wipe();
  }
}

export type MailLegacyMigrationPhase = "idle" | "running" | "failed" | "done";

export interface MailLegacyMigrationProgress {
  phase: MailLegacyMigrationPhase;
  processed: number;
  rewritten: number;
  skipped: number;
  unreadable: number;
  forced: boolean;
}

const IDLE_PROGRESS: MailLegacyMigrationProgress = {
  phase: "idle",
  processed: 0,
  rewritten: 0,
  skipped: 0,
  unreadable: 0,
  forced: false,
};

let progress: MailLegacyMigrationProgress = IDLE_PROGRESS;
const listeners = new Set<(next: MailLegacyMigrationProgress) => void>();

function set_progress(next: MailLegacyMigrationProgress): void {
  progress = next;
  listeners.forEach((listener) => listener(progress));
}

export function get_mail_legacy_migration_progress(): MailLegacyMigrationProgress {
  return progress;
}

export function subscribe_mail_legacy_migration(
  listener: (next: MailLegacyMigrationProgress) => void,
): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

let generation = 0;
let timer: ReturnType<typeof setTimeout> | null = null;
let active: { user_id: string; deps: MailLegacyMigrationDeps } | null = null;

export function stop_mail_legacy_migration(): void {
  generation += 1;
  if (timer) clearTimeout(timer);
  timer = null;
  active = null;
  set_progress(IDLE_PROGRESS);
}

function schedule(delay: number, forced: boolean, attempts: number): void {
  const run_generation = generation;

  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void step(run_generation, forced, attempts);
  }, delay);
}

export function mail_legacy_retry_delay_ms(attempts: number): number {
  return RETRY_DELAY_MS * Math.min(attempts + 1, MAX_RETRY_DELAY_STEPS);
}

async function step(
  run_generation: number,
  forced: boolean,
  attempts: number,
): Promise<void> {
  const current = active;

  if (!current || run_generation !== generation) return;

  set_progress({ ...IDLE_PROGRESS, phase: "running", forced });

  const result = await run_mail_legacy_migration(current.user_id, {
    ...current.deps,
    on_progress: (state) => {
      if (run_generation !== generation) return;
      set_progress({
        ...progress,
        phase: "running",
        processed: state.processed,
        rewritten: state.rewritten,
      });
    },
  }).catch((): MailLegacyMigrationResult => "paused");

  if (run_generation !== generation) return;

  const saved = read_mail_legacy_migration_state(
    current.deps.storage(),
    current.user_id,
  );
  const counts = {
    processed: progress.processed,
    rewritten: progress.rewritten,
    skipped: saved.skipped_ids?.length ?? 0,
    unreadable: count_unreadable(saved),
  };

  if (result === "done") {
    set_progress({ phase: "done", ...counts, forced: counts.unreadable > 0 });

    return;
  }
  if (result === "deferred" || result === "unavailable") {
    set_progress(IDLE_PROGRESS);

    return;
  }
  if (result === "failed") {
    set_progress({ phase: "failed", ...counts, forced: true });

    return;
  }

  set_progress(IDLE_PROGRESS);
  schedule(mail_legacy_retry_delay_ms(attempts), false, attempts + 1);
}

export function start_mail_legacy_migration(
  user_id: string,
  deps: MailLegacyMigrationDeps,
): void {
  if (active?.user_id === user_id) return;

  stop_mail_legacy_migration();
  if (is_mail_legacy_retired()) return;

  active = { user_id, deps };
  schedule(START_DELAY_MS, false, 0);
}

export function retry_mail_legacy_migration(): void {
  if (!active || progress.phase === "running") return;

  requeue_mail_legacy_skipped_items(active.deps.storage(), active.user_id);
  schedule(0, true, 0);
}

export function dismiss_mail_legacy_migration(): void {
  if (progress.phase === "running") {
    set_progress({ ...progress, forced: false });

    return;
  }
  if (progress.phase === "done" && active) {
    write_state(active.deps.storage(), active.user_id, null);
  }

  set_progress(IDLE_PROGRESS);
}
