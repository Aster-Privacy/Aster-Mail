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
import type { EncryptedVault } from "./key_manager_core";
import type { ApiResponse } from "@/services/api/client/helpers";
import type { BatchAttachmentMetaResponse } from "@/services/api/attachments";
import type {
  ListEncryptedMailItemsParams,
  MailItemsListResponse,
  UpdateMailItemRequest,
} from "@/services/api/mail";

import { decrypt_envelope_plaintext_with_bytes } from "./envelope";
import {
  may_be_password_attachment_meta,
  seal_attachment_meta_v2_text,
} from "./attachment_meta_v2";
import {
  ENVELOPE_V2_NONCE,
  encrypt_envelope_v2_bytes,
  envelope_sha256_hex,
  envelope_v2_write_key,
  is_envelope_v1_nonce,
  wipe_envelope_v2_keys,
} from "./envelope_v2";
import {
  is_level2_admitted,
  is_level2_refusal,
  mark_level2_refused,
} from "./vault_level2";
import { zero_uint8_array } from "./secure_memory";

export const ENVELOPE_V2_REKEY_RUN_LIMIT = 200;
export const ENVELOPE_V2_REKEY_PAGE_SIZE = 50;
export const ENVELOPE_V2_REKEY_ITEM_TYPES = ["sent", "draft"] as const;

const CURSOR_KEY_PREFIX = "astermail_envelope_v2_rekey_";
const RESCAN_AFTER_MS = 7 * 24 * 60 * 60 * 1000;
const START_DELAY_MS = 15_000;
const NEXT_RUN_DELAY_MS = 30_000;
const PAUSE_DELAY_MS = 10 * 60 * 1000;
const MAX_PAUSES = 3;

export type EnvelopeV2RekeyResult =
  | "done"
  | "more"
  | "incomplete"
  | "paused"
  | "failed"
  | "unavailable";

export interface EnvelopeV2RekeyState {
  type_index: number;
  cursor?: string;
  done_at?: number;
  incomplete?: boolean;
  failed?: boolean;
}

const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/;
const ENVELOPE_CHANGED = "ENVELOPE_CHANGED";
const PAUSE_STATUSES = new Set([401, 403, 429, 503]);

type KeyValueStore = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export interface EnvelopeV2RekeyDeps {
  list: (
    params: ListEncryptedMailItemsParams,
  ) => Promise<ApiResponse<MailItemsListResponse>>;
  update: (
    item_id: string,
    data: UpdateMailItemRequest,
  ) => Promise<ApiResponse<unknown>>;
  get_vault: () => EncryptedVault | null;
  get_passphrase_bytes: () => Uint8Array | null;
  storage: () => KeyValueStore | null;
  now: () => number;
  is_draft_busy?: (item_id: string) => boolean;
  batch_meta?: (
    mail_ids: string[],
  ) => Promise<ApiResponse<BatchAttachmentMetaResponse>>;
  update_meta?: (
    attachment_id: string,
    data: { encrypted_meta: string; meta_nonce: string },
  ) => Promise<ApiResponse<unknown>>;
}

export interface AttachmentMetaRekeyItem {
  id: string;
  has_attachments?: boolean;
  attachment_count?: number;
}

export type AttachmentMetaRekeyOutcome =
  | "done"
  | "limit"
  | "incomplete"
  | "failed"
  | "paused"
  | "unavailable";

const unconvertible_meta_ids = new Set<string>();

export function reset_attachment_meta_rekey_cache(): void {
  unconvertible_meta_ids.clear();
}

function may_have_attachments(item: AttachmentMetaRekeyItem): boolean {
  return item.has_attachments === true || (item.attachment_count ?? 0) > 0;
}

function cursor_key(user_id: string): string {
  return `${CURSOR_KEY_PREFIX}${user_id}`;
}

export function read_envelope_v2_rekey_state(
  store: KeyValueStore | null,
  user_id: string,
): EnvelopeV2RekeyState {
  try {
    const raw = store?.getItem(cursor_key(user_id));

    if (!raw) return { type_index: 0 };

    const parsed = JSON.parse(raw) as Partial<EnvelopeV2RekeyState>;
    const type_index =
      typeof parsed.type_index === "number" &&
      Number.isInteger(parsed.type_index) &&
      parsed.type_index >= 0
        ? parsed.type_index
        : 0;

    return {
      type_index,
      cursor: typeof parsed.cursor === "string" ? parsed.cursor : undefined,
      done_at: typeof parsed.done_at === "number" ? parsed.done_at : undefined,
      incomplete: parsed.incomplete === true ? true : undefined,
      failed: parsed.failed === true ? true : undefined,
    };
  } catch {
    return { type_index: 0 };
  }
}

function write_state(
  store: KeyValueStore | null,
  user_id: string,
  state: EnvelopeV2RekeyState,
): void {
  try {
    store?.setItem(cursor_key(user_id), JSON.stringify(state));
  } catch {
    return;
  }
}

export type ItemOutcome =
  | "skipped"
  | "written"
  | "changed"
  | "failed"
  | "paused"
  | "unavailable";

async function safe_sha256_hex(b64: string): Promise<string | null> {
  try {
    const hex = await envelope_sha256_hex(b64);

    return SHA256_HEX_PATTERN.test(hex) ? hex : null;
  } catch {
    return null;
  }
}

export function classify_rekey_response(
  response: ApiResponse<unknown>,
): ItemOutcome {
  if (!response.error) return "written";
  if (is_level2_refusal(response)) return "unavailable";
  if (response.status === 426) return "unavailable";
  if (!response.status || PAUSE_STATUSES.has(response.status)) return "paused";
  if (response.status === 404) return "skipped";
  if (response.status === 409 && response.server_code === ENVELOPE_CHANGED) {
    return "changed";
  }

  return "failed";
}

export async function rekey_envelope_item(
  item: { id: string; encrypted_envelope: string },
  passphrase: Uint8Array,
  kek: Uint8Array,
  deps: Pick<EnvelopeV2RekeyDeps, "update">,
): Promise<ItemOutcome> {
  const expected_envelope_sha256 = await safe_sha256_hex(
    item.encrypted_envelope,
  );

  if (!expected_envelope_sha256) return "skipped";

  const plaintext = await decrypt_envelope_plaintext_with_bytes(
    item.encrypted_envelope,
    passphrase,
  );

  if (plaintext === null) return "skipped";

  const bytes = new TextEncoder().encode(plaintext);
  let encrypted: string;

  try {
    encrypted = await encrypt_envelope_v2_bytes(bytes, kek);
  } finally {
    zero_uint8_array(bytes);
  }

  let response: ApiResponse<unknown>;

  try {
    response = await deps.update(item.id, {
      encrypted_envelope: encrypted,
      envelope_nonce: ENVELOPE_V2_NONCE,
      expected_envelope_sha256,
    });
  } catch {
    return "paused";
  }

  const outcome = classify_rekey_response(response);

  if (outcome === "unavailable" && is_level2_refusal(response)) {
    mark_level2_refused();
  }

  return outcome;
}

export async function rekey_attachment_metas(
  items: AttachmentMetaRekeyItem[],
  passphrase: Uint8Array,
  kek: Uint8Array,
  deps: Pick<EnvelopeV2RekeyDeps, "batch_meta" | "update_meta">,
  budget: number,
): Promise<{ outcome: AttachmentMetaRekeyOutcome; attempted: number }> {
  const { batch_meta, update_meta } = deps;

  if (!batch_meta || !update_meta) return { outcome: "done", attempted: 0 };

  const mail_ids = items.filter(may_have_attachments).map((item) => item.id);

  if (mail_ids.length === 0) return { outcome: "done", attempted: 0 };

  let listing: ApiResponse<BatchAttachmentMetaResponse>;

  try {
    listing = await batch_meta(mail_ids);
  } catch {
    return { outcome: "paused", attempted: 0 };
  }

  if (!listing.data) {
    const outcome = classify_rekey_response(listing);

    if (outcome === "paused" || outcome === "unavailable") {
      return { outcome, attempted: 0 };
    }

    return {
      outcome: outcome === "skipped" ? "done" : "incomplete",
      attempted: 0,
    };
  }

  let attempted = 0;
  let incomplete = false;
  let failed = false;

  for (const mail_id of mail_ids) {
    for (const meta of listing.data.items[mail_id] ?? []) {
      if (!meta.id || !meta.encrypted_meta) continue;
      if (!may_be_password_attachment_meta(meta.meta_nonce)) continue;
      if (unconvertible_meta_ids.has(meta.id)) continue;
      if (attempted >= budget) return { outcome: "limit", attempted };

      const plaintext = await decrypt_envelope_plaintext_with_bytes(
        meta.encrypted_meta,
        passphrase,
      );

      if (plaintext === null) {
        unconvertible_meta_ids.add(meta.id);
        continue;
      }

      attempted += 1;

      let response: ApiResponse<unknown>;

      try {
        const sealed = await seal_attachment_meta_v2_text(plaintext, kek);

        response = await update_meta(meta.id, sealed);
      } catch {
        return { outcome: "paused", attempted };
      }

      const outcome = classify_rekey_response(response);

      if (outcome === "unavailable" && is_level2_refusal(response)) {
        mark_level2_refused();
      }
      if (outcome === "paused" || outcome === "unavailable") {
        return { outcome, attempted };
      }
      if (outcome === "changed") incomplete = true;
      if (outcome === "failed") failed = true;
    }
  }

  return {
    outcome: failed ? "failed" : incomplete ? "incomplete" : "done",
    attempted,
  };
}

export async function run_envelope_v2_rekey(
  user_id: string,
  deps: EnvelopeV2RekeyDeps,
): Promise<EnvelopeV2RekeyResult> {
  if (!user_id || !is_level2_admitted()) return "unavailable";

  const store = deps.storage();
  const state = read_envelope_v2_rekey_state(store, user_id);

  if (state.type_index >= ENVELOPE_V2_REKEY_ITEM_TYPES.length) {
    if (state.done_at && deps.now() - state.done_at < RESCAN_AFTER_MS) {
      return "done";
    }
    state.type_index = 0;
    state.cursor = undefined;
    state.done_at = undefined;
  }

  const kek = envelope_v2_write_key(deps.get_vault());

  if (!kek) return "unavailable";

  const passphrase = deps.get_passphrase_bytes();

  if (!passphrase) {
    wipe_envelope_v2_keys([kek]);

    return "unavailable";
  }

  let attempted = 0;

  try {
    while (state.type_index < ENVELOPE_V2_REKEY_ITEM_TYPES.length) {
      const response = await deps.list({
        item_type: ENVELOPE_V2_REKEY_ITEM_TYPES[state.type_index],
        limit: ENVELOPE_V2_REKEY_PAGE_SIZE,
        cursor: state.cursor,
        include_envelope: true,
        include_reactions: true,
      });

      if (!response.data) return "paused";

      const meta_items: AttachmentMetaRekeyItem[] = [];

      for (const item of response.data.items) {
        if (deps.is_draft_busy?.(item.id)) {
          if (
            may_have_attachments(item) ||
            (!!item.encrypted_envelope &&
              is_envelope_v1_nonce(item.envelope_nonce))
          ) {
            state.incomplete = true;
          }
          continue;
        }

        meta_items.push(item);

        if (!item.encrypted_envelope) continue;
        if (!is_envelope_v1_nonce(item.envelope_nonce)) continue;
        if (attempted >= ENVELOPE_V2_REKEY_RUN_LIMIT) return "more";

        attempted += 1;

        const outcome = await rekey_envelope_item(item, passphrase, kek, deps);

        if (outcome === "paused" || outcome === "unavailable") return outcome;
        if (outcome === "changed") state.incomplete = true;
        if (outcome === "failed") {
          state.incomplete = true;
          state.failed = true;
        }
      }

      const metas = await rekey_attachment_metas(
        meta_items,
        passphrase,
        kek,
        deps,
        ENVELOPE_V2_REKEY_RUN_LIMIT - attempted,
      );

      attempted += metas.attempted;

      if (metas.outcome === "limit") return "more";
      if (metas.outcome === "paused" || metas.outcome === "unavailable") {
        return metas.outcome;
      }
      if (metas.outcome === "incomplete") state.incomplete = true;
      if (metas.outcome === "failed") {
        state.incomplete = true;
        state.failed = true;
      }

      if (response.data.has_more && response.data.next_cursor) {
        state.cursor = response.data.next_cursor;
      } else {
        state.type_index += 1;
        state.cursor = undefined;
      }

      if (state.type_index >= ENVELOPE_V2_REKEY_ITEM_TYPES.length) {
        const result: EnvelopeV2RekeyResult = state.failed
          ? "failed"
          : state.incomplete
            ? "incomplete"
            : "done";

        write_state(
          store,
          user_id,
          result === "done"
            ? { type_index: state.type_index, done_at: deps.now() }
            : { type_index: 0 },
        );

        return result;
      }

      write_state(store, user_id, state);

      if (attempted >= ENVELOPE_V2_REKEY_RUN_LIMIT) return "more";
    }

    return "done";
  } catch {
    return "paused";
  } finally {
    zero_uint8_array(passphrase);
    wipe_envelope_v2_keys([kek]);
  }
}

let generation = 0;
let timer: ReturnType<typeof setTimeout> | null = null;
let in_flight = false;

export function stop_envelope_v2_rekey(): void {
  generation += 1;
  if (timer) clearTimeout(timer);
  timer = null;
}

export function start_envelope_v2_rekey(
  user_id: string,
  deps: EnvelopeV2RekeyDeps,
): void {
  stop_envelope_v2_rekey();

  const run_generation = generation;
  let pauses = 0;

  const schedule = (delay: number) => {
    if (run_generation !== generation) return;
    timer = setTimeout(() => {
      void step();
    }, delay);
  };

  const step = async () => {
    if (run_generation !== generation) return;
    if (in_flight) {
      schedule(NEXT_RUN_DELAY_MS);

      return;
    }

    in_flight = true;
    let result: EnvelopeV2RekeyResult;

    try {
      result = await run_envelope_v2_rekey(user_id, deps);
    } catch {
      result = "paused";
    } finally {
      in_flight = false;
    }

    if (result === "more") {
      schedule(NEXT_RUN_DELAY_MS);
    } else if (
      (result === "paused" || result === "incomplete") &&
      pauses < MAX_PAUSES
    ) {
      pauses += 1;
      schedule(PAUSE_DELAY_MS);
    }
  };

  schedule(START_DELAY_MS);
}
