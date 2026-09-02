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
import type { MailItemMetadata } from "@/types/email";

import {
  blob_only_update_fields,
  create_default_metadata,
  decrypt_mail_metadata,
  encrypt_mail_metadata,
  type MetadataUpdateOptions,
  type MetadataUpdateResult,
  type MetadataWriteResult,
} from "./mail_metadata_core";

import { clear_read_intent, note_read_intent } from "@/services/read_intent";

type UpdateResult = MetadataWriteResult;

const in_flight_requests = new Map<string, Promise<UpdateResult>>();
const item_chains = new Map<string, Promise<UpdateResult>>();
const recently_completed = new Map<
  string,
  { result: UpdateResult; timestamp: number }
>();
const last_written_by_item = new Map<
  string,
  { version: number; encrypted: MetadataUpdateResult; timestamp: number }
>();
const DEDUP_WINDOW_MS = 2000;
const LAST_WRITTEN_TTL_MS = 60000;

function create_dedup_key(
  item_id: string,
  updates: Partial<MailItemMetadata>,
): string {
  const sorted_keys = Object.keys(updates).sort();
  const values = sorted_keys.map(
    (k) => `${k}:${updates[k as keyof MailItemMetadata]}`,
  );

  return `${item_id}|${values.join(",")}`;
}

function cleanup_completed_cache(): void {
  const now = Date.now();

  for (const [key, entry] of recently_completed) {
    if (now - entry.timestamp > DEDUP_WINDOW_MS) {
      recently_completed.delete(key);
    }
  }

  for (const [key, entry] of last_written_by_item) {
    if (now - entry.timestamp > LAST_WRITTEN_TTL_MS) {
      last_written_by_item.delete(key);
    }
  }
}

function get_last_written(
  item_id: string,
): { version: number; encrypted: MetadataUpdateResult } | null {
  const entry = last_written_by_item.get(item_id);

  if (!entry) {
    return null;
  }

  if (Date.now() - entry.timestamp > LAST_WRITTEN_TTL_MS) {
    last_written_by_item.delete(item_id);

    return null;
  }

  return entry;
}

export async function update_item_metadata(
  item_id: string,
  current: MetadataUpdateOptions,
  updates: Partial<MailItemMetadata>,
): Promise<UpdateResult> {
  const dedup_key = create_dedup_key(item_id, updates);

  if (updates.is_read !== undefined) {
    note_read_intent([item_id], updates.is_read);
  }

  cleanup_completed_cache();

  const cached = recently_completed.get(dedup_key);

  if (cached && cached.result.success) {
    return cached.result;
  }

  const in_flight = in_flight_requests.get(dedup_key);

  if (in_flight) {
    return in_flight;
  }

  const prev_for_item = item_chains.get(item_id);

  const execute = async (): Promise<UpdateResult> => {
    let base: MetadataUpdateOptions = current;

    if (prev_for_item) {
      try {
        const prev = await prev_for_item;

        if (prev.success && prev.encrypted) {
          base = {
            encrypted_metadata: prev.encrypted.encrypted_metadata,
            metadata_nonce: prev.encrypted.metadata_nonce,
            metadata_version: prev.written_version,
          };
        }
      } catch {
        /* previous write failed; fall back to the caller snapshot */
      }
    }

    const last_written = get_last_written(item_id);

    if (last_written && (base.metadata_version ?? 0) < last_written.version) {
      base = {
        encrypted_metadata: last_written.encrypted.encrypted_metadata,
        metadata_nonce: last_written.encrypted.metadata_nonce,
        metadata_version: last_written.version,
      };
    }

    const { patch_mail_item_metadata, get_mail_item } = await import(
      "@/services/api/mail"
    );

    if (!base.encrypted_metadata || !base.metadata_nonce) {
      const fetched = await get_mail_item(item_id);

      if (!fetched.data) {
        return { success: false };
      }

      if (fetched.data.encrypted_metadata && fetched.data.metadata_nonce) {
        base = {
          encrypted_metadata: fetched.data.encrypted_metadata,
          metadata_nonce: fetched.data.metadata_nonce,
          metadata_version: fetched.data.metadata_version,
        };
      }
    }

    let current_metadata: MailItemMetadata | null = null;

    if (base.encrypted_metadata && base.metadata_nonce) {
      current_metadata = await decrypt_mail_metadata(
        base.encrypted_metadata,
        base.metadata_nonce,
        base.metadata_version,
      );
    }

    const is_undecryptable =
      !current_metadata && !!base.encrypted_metadata && !!base.metadata_nonce;
    const blob_only_fields = blob_only_update_fields(updates);

    if (is_undecryptable && blob_only_fields.length > 0) {
      return {
        success: false,
        undecryptable: true,
        unapplied_fields: blob_only_fields,
        written_version: base.metadata_version,
      };
    }

    if (!current_metadata) {
      current_metadata = create_default_metadata();
    }

    const updated_metadata: MailItemMetadata = {
      ...current_metadata,
      ...updates,
      updated_at: new Date().toISOString(),
    };

    if (updates.is_trashed === true && !updated_metadata.trashed_at) {
      updated_metadata.trashed_at = new Date().toISOString();
    } else if (updates.is_trashed === false) {
      updated_metadata.trashed_at = undefined;
    }

    const encrypted = is_undecryptable
      ? null
      : await encrypt_mail_metadata(updated_metadata);

    if (!encrypted && !is_undecryptable) {
      return { success: false };
    }

    const result = await patch_mail_item_metadata(item_id, {
      ...(encrypted && {
        encrypted_metadata: encrypted.encrypted_metadata,
        metadata_nonce: encrypted.metadata_nonce,
      }),
      ...(updates.is_read !== undefined && {
        is_read: updated_metadata.is_read,
      }),
      ...(updates.is_starred !== undefined && {
        is_starred: updated_metadata.is_starred,
      }),
      ...(updates.is_pinned !== undefined && {
        is_pinned: updated_metadata.is_pinned,
      }),
      ...(updates.is_trashed !== undefined && {
        is_trashed: updated_metadata.is_trashed,
      }),
      ...(updates.is_archived !== undefined && {
        is_archived: updated_metadata.is_archived,
      }),
      ...(updates.is_spam !== undefined && {
        is_spam: updated_metadata.is_spam,
      }),
    });

    return {
      success: !!result.data,
      encrypted: encrypted ?? undefined,
      written_version: encrypted
        ? (base.metadata_version ?? 0) + 1
        : base.metadata_version,
    };
  };

  const promise = execute();
  const chained = promise.catch(() => ({ success: false }) as UpdateResult);

  in_flight_requests.set(dedup_key, promise);
  item_chains.set(item_id, chained);

  try {
    const result = await promise;

    if (!result.success && updates.is_read !== undefined) {
      clear_read_intent([item_id], updates.is_read);
    }

    if (result.success) {
      const item_prefix = `${item_id}|`;

      for (const key of recently_completed.keys()) {
        if (key !== dedup_key && key.startsWith(item_prefix)) {
          recently_completed.delete(key);
        }
      }
      recently_completed.set(dedup_key, { result, timestamp: Date.now() });

      if (result.encrypted) {
        last_written_by_item.set(item_id, {
          version: result.written_version ?? 1,
          encrypted: result.encrypted,
          timestamp: Date.now(),
        });
      }
    }

    return result;
  } catch (caught) {
    if (updates.is_read !== undefined) {
      clear_read_intent([item_id], updates.is_read);
    }
    throw caught;
  } finally {
    in_flight_requests.delete(dedup_key);
    if (item_chains.get(item_id) === chained) {
      item_chains.delete(item_id);
    }
  }
}

export async function bulk_update_items_metadata(
  items: Array<{
    id: string;
    encrypted_metadata?: string;
    metadata_nonce?: string;
    metadata_version?: number;
  }>,
  updates: Partial<MailItemMetadata>,
  options?: {
    signal?: AbortSignal;
    on_progress?: (completed: number, total: number) => void;
  },
): Promise<{
  success: boolean;
  updated_count: number;
  failed_ids: string[];
  undecryptable_ids: string[];
  encrypted_by_id: Map<
    string,
    { encrypted_metadata: string; metadata_nonce: string }
  >;
}> {
  if (updates.is_read !== undefined) {
    note_read_intent(
      items.map((item) => item.id),
      updates.is_read,
    );
  }

  const { batched_bulk_patch_metadata } = await import("@/services/api/mail");

  const bulk_items: Array<{
    id: string;
    encrypted_metadata: string;
    metadata_nonce: string;
    is_read?: boolean;
    is_starred?: boolean;
    is_pinned?: boolean;
    is_trashed?: boolean;
    is_archived?: boolean;
    is_spam?: boolean;
  }> = [];
  const flag_only_items: Array<{
    id: string;
    is_read?: boolean;
    is_starred?: boolean;
    is_pinned?: boolean;
    is_trashed?: boolean;
    is_archived?: boolean;
    is_spam?: boolean;
  }> = [];
  const failed_ids: string[] = [];
  const undecryptable_ids: string[] = [];
  const blob_only_fields = blob_only_update_fields(updates);
  const now = new Date().toISOString();

  for (const item of items) {
    if (options?.signal?.aborted) {
      failed_ids.push(item.id);
      continue;
    }

    let current_metadata: MailItemMetadata | null = null;

    if (item.encrypted_metadata && item.metadata_nonce) {
      current_metadata = await decrypt_mail_metadata(
        item.encrypted_metadata,
        item.metadata_nonce,
        item.metadata_version,
      );
    }

    const is_undecryptable =
      !current_metadata && !!item.encrypted_metadata && !!item.metadata_nonce;

    if (is_undecryptable && blob_only_fields.length > 0) {
      failed_ids.push(item.id);
      undecryptable_ids.push(item.id);
      continue;
    }

    if (!current_metadata) {
      current_metadata = create_default_metadata();
    }

    const updated_metadata: MailItemMetadata = {
      ...current_metadata,
      ...updates,
      updated_at: now,
    };

    if (updates.is_trashed === true && !updated_metadata.trashed_at) {
      updated_metadata.trashed_at = now;
    } else if (updates.is_trashed === false) {
      updated_metadata.trashed_at = undefined;
    }

    const encrypted = is_undecryptable
      ? null
      : await encrypt_mail_metadata(updated_metadata);

    if (is_undecryptable) {
      flag_only_items.push({
        id: item.id,
        ...(updates.is_read !== undefined && {
          is_read: updated_metadata.is_read,
        }),
        ...(updates.is_starred !== undefined && {
          is_starred: updated_metadata.is_starred,
        }),
        ...(updates.is_pinned !== undefined && {
          is_pinned: updated_metadata.is_pinned,
        }),
        ...(updates.is_trashed !== undefined && {
          is_trashed: updated_metadata.is_trashed,
        }),
        ...(updates.is_archived !== undefined && {
          is_archived: updated_metadata.is_archived,
        }),
        ...(updates.is_spam !== undefined && {
          is_spam: updated_metadata.is_spam,
        }),
      });
    } else if (encrypted) {
      bulk_items.push({
        id: item.id,
        encrypted_metadata: encrypted.encrypted_metadata,
        metadata_nonce: encrypted.metadata_nonce,
        ...(updates.is_read !== undefined && {
          is_read: updated_metadata.is_read,
        }),
        ...(updates.is_starred !== undefined && {
          is_starred: updated_metadata.is_starred,
        }),
        ...(updates.is_pinned !== undefined && {
          is_pinned: updated_metadata.is_pinned,
        }),
        ...(updates.is_trashed !== undefined && {
          is_trashed: updated_metadata.is_trashed,
        }),
        ...(updates.is_archived !== undefined && {
          is_archived: updated_metadata.is_archived,
        }),
        ...(updates.is_spam !== undefined && {
          is_spam: updated_metadata.is_spam,
        }),
      });
    } else {
      failed_ids.push(item.id);
    }
  }

  const encrypted_by_id = new Map<
    string,
    { encrypted_metadata: string; metadata_nonce: string }
  >();

  for (const item of bulk_items) {
    encrypted_by_id.set(item.id, {
      encrypted_metadata: item.encrypted_metadata,
      metadata_nonce: item.metadata_nonce,
    });
  }

  if (bulk_items.length === 0 && flag_only_items.length === 0) {
    if (updates.is_read !== undefined) {
      clear_read_intent([...failed_ids, ...undecryptable_ids], updates.is_read);
    }

    return {
      success: false,
      updated_count: 0,
      failed_ids,
      undecryptable_ids,
      encrypted_by_id,
    };
  }

  const result = await batched_bulk_patch_metadata(
    [...bulk_items, ...flag_only_items],
    { signal: options?.signal, on_progress: options?.on_progress },
  );

  failed_ids.push(...result.failed_ids);
  for (const failed_id of result.failed_ids) {
    encrypted_by_id.delete(failed_id);
  }
  if (updates.is_read !== undefined) {
    clear_read_intent([...failed_ids, ...undecryptable_ids], updates.is_read);
  }

  return {
    success: failed_ids.length === 0 && !result.was_cancelled,
    updated_count: result.succeeded_ids.length,
    failed_ids,
    undecryptable_ids,
    encrypted_by_id,
  };
}

export async function bulk_update_metadata_by_ids(
  ids: string[],
  updates: Partial<MailItemMetadata>,
): Promise<{
  success: boolean;
  updated_count: number;
  failed_ids: string[];
  undecryptable_ids: string[];
}> {
  if (ids.length === 0) {
    return {
      success: true,
      updated_count: 0,
      failed_ids: [],
      undecryptable_ids: [],
    };
  }

  if (updates.is_read !== undefined) {
    note_read_intent(ids, updates.is_read);
  }

  const { list_mail_items } = await import("@/services/api/mail");

  const unique_ids = Array.from(new Set(ids));
  const BATCH_FETCH_SIZE = 100;
  const fetched: Array<{
    id: string;
    encrypted_metadata?: string;
    metadata_nonce?: string;
    metadata_version?: number;
  }> = [];
  const failed_fetch: string[] = [];

  for (let i = 0; i < unique_ids.length; i += BATCH_FETCH_SIZE) {
    const slice = unique_ids.slice(i, i + BATCH_FETCH_SIZE);
    const response = await list_mail_items({ ids: slice });

    if (!response.data) {
      failed_fetch.push(...slice);
      continue;
    }
    const got = new Set<string>();

    for (const item of response.data.items) {
      got.add(item.id);
      fetched.push({
        id: item.id,
        encrypted_metadata: item.encrypted_metadata,
        metadata_nonce: item.metadata_nonce,
        metadata_version: item.metadata_version,
      });
    }
    for (const sid of slice) {
      if (!got.has(sid)) failed_fetch.push(sid);
    }
  }

  if (fetched.length === 0) {
    if (updates.is_read !== undefined) {
      clear_read_intent(failed_fetch, updates.is_read);
    }

    return {
      success: false,
      updated_count: 0,
      failed_ids: failed_fetch,
      undecryptable_ids: [],
    };
  }

  const result = await bulk_update_items_metadata(fetched, updates);

  if (updates.is_read !== undefined) {
    clear_read_intent(failed_fetch, updates.is_read);
  }

  return {
    success: result.success && failed_fetch.length === 0,
    updated_count: result.updated_count,
    failed_ids: [...failed_fetch, ...result.failed_ids],
    undecryptable_ids: result.undecryptable_ids,
  };
}
