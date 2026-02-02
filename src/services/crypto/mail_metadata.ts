import type { MailItemMetadata } from "@/types/email";

import {
  encrypt_metadata,
  decrypt_metadata,
  type EncryptedBlob,
} from "./envelope";
import { get_derived_encryption_key } from "./memory_key_store";

const MAIL_METADATA_CONTEXT = "mail-item-metadata";

export const ENCRYPTED_METADATA_FIELDS = [
  "is_read",
  "is_starred",
  "is_trashed",
  "is_archived",
  "is_spam",
  "is_pinned",
  "item_type",
  "message_ts",
  "created_at",
  "updated_at",
  "trashed_at",
  "size_bytes",
  "has_attachments",
  "attachment_count",
  "scheduled_at",
  "send_status",
  "snoozed_until",
  "email_category",
  "category_confidence",
  "category_user_override",
  "category_classified_at",
] as const;

export interface EncryptedMailMetadataResult {
  encrypted_metadata: string;
  metadata_nonce: string;
}

export function create_default_metadata(
  item_type: string = "received",
): MailItemMetadata {
  const now = new Date().toISOString();

  return {
    is_read: false,
    is_starred: false,
    is_pinned: false,
    is_trashed: false,
    is_archived: false,
    is_spam: false,
    size_bytes: 0,
    has_attachments: false,
    attachment_count: 0,
    message_ts: now,
    created_at: now,
    updated_at: now,
    item_type,
  };
}

export async function encrypt_mail_metadata(
  metadata: MailItemMetadata,
): Promise<EncryptedMailMetadataResult | null> {
  const master_key = get_derived_encryption_key();

  if (!master_key) {
    return null;
  }

  try {
    const blob = await encrypt_metadata(
      metadata,
      master_key,
      MAIL_METADATA_CONTEXT,
    );

    if (!blob) {
      return null;
    }

    return {
      encrypted_metadata: blob.encrypted_data,
      metadata_nonce: blob.nonce,
    };
  } catch {
    return null;
  }
}

export async function decrypt_mail_metadata(
  encrypted_metadata: string,
  metadata_nonce: string,
  metadata_version?: number,
): Promise<MailItemMetadata | null> {
  const master_key = get_derived_encryption_key();

  if (!master_key) {
    return null;
  }

  try {
    const blob: EncryptedBlob = {
      encrypted_data: encrypted_metadata,
      nonce: metadata_nonce,
      version: metadata_version ?? 1,
    };

    return await decrypt_metadata<MailItemMetadata>(
      blob,
      master_key,
      MAIL_METADATA_CONTEXT,
    );
  } catch {
    return null;
  }
}

export async function encrypt_mail_metadata_batch(
  items: Array<{ id: string; metadata: MailItemMetadata }>,
): Promise<
  Array<{ id: string; encrypted_metadata: string; metadata_nonce: string }>
> {
  const master_key = get_derived_encryption_key();

  if (!master_key) {
    return [];
  }

  const results: Array<{
    id: string;
    encrypted_metadata: string;
    metadata_nonce: string;
  }> = [];

  for (const item of items) {
    const blob = await encrypt_metadata(
      item.metadata,
      master_key,
      MAIL_METADATA_CONTEXT,
    );

    if (blob) {
      results.push({
        id: item.id,
        encrypted_metadata: blob.encrypted_data,
        metadata_nonce: blob.nonce,
      });
    }
  }

  return results;
}

export async function decrypt_mail_metadata_batch<
  T extends {
    id: string;
    encrypted_metadata?: string;
    metadata_nonce?: string;
    metadata_version?: number;
  },
>(items: T[]): Promise<Map<string, MailItemMetadata>> {
  const master_key = get_derived_encryption_key();
  const results = new Map<string, MailItemMetadata>();

  if (!master_key) {
    return results;
  }

  for (const item of items) {
    if (item.encrypted_metadata && item.metadata_nonce) {
      const blob: EncryptedBlob = {
        encrypted_data: item.encrypted_metadata,
        nonce: item.metadata_nonce,
        version: item.metadata_version ?? 1,
      };

      const decrypted = await decrypt_metadata<MailItemMetadata>(
        blob,
        master_key,
        MAIL_METADATA_CONTEXT,
      );

      if (decrypted) {
        results.set(item.id, decrypted);
      }
    }
  }

  return results;
}

export function extract_metadata_from_server(
  decrypted: MailItemMetadata | null,
  server_data: {
    scheduled_at?: string;
    send_status?: string;
    snoozed_until?: string;
    message_ts?: string;
    item_type?: string;
  },
): MailItemMetadata {
  if (!decrypted) {
    return {
      is_read: false,
      is_starred: false,
      is_pinned: false,
      is_trashed: false,
      is_archived: false,
      is_spam: false,
      size_bytes: 0,
      has_attachments: false,
      attachment_count: 0,
      scheduled_at: server_data.scheduled_at,
      send_status: server_data.send_status,
      snoozed_until: server_data.snoozed_until,
      message_ts: server_data.message_ts ?? new Date().toISOString(),
      item_type: server_data.item_type ?? "received",
    };
  }

  return {
    ...decrypted,
    scheduled_at: server_data.scheduled_at ?? decrypted.scheduled_at,
    send_status: server_data.send_status ?? decrypted.send_status,
    snoozed_until: server_data.snoozed_until ?? decrypted.snoozed_until,
    message_ts: server_data.message_ts ?? decrypted.message_ts,
    item_type: server_data.item_type ?? decrypted.item_type,
  };
}

export function has_encryption_key(): boolean {
  return get_derived_encryption_key() !== null;
}

export interface MetadataUpdateOptions {
  encrypted_metadata?: string;
  metadata_nonce?: string;
  metadata_version?: number;
}

export interface MetadataUpdateResult {
  encrypted_metadata: string;
  metadata_nonce: string;
}

type UpdateResult = { success: boolean; encrypted?: MetadataUpdateResult };

const in_flight_requests = new Map<string, Promise<UpdateResult>>();
const recently_completed = new Map<string, { result: UpdateResult; timestamp: number }>();
const DEDUP_WINDOW_MS = 2000;

function create_dedup_key(item_id: string, updates: Partial<MailItemMetadata>): string {
  const sorted_keys = Object.keys(updates).sort();
  const values = sorted_keys.map((k) => `${k}:${updates[k as keyof MailItemMetadata]}`);
  return `${item_id}|${values.join(",")}`;
}

function cleanup_completed_cache(): void {
  const now = Date.now();
  for (const [key, entry] of recently_completed) {
    if (now - entry.timestamp > DEDUP_WINDOW_MS) {
      recently_completed.delete(key);
    }
  }
}

export async function update_item_metadata(
  item_id: string,
  current: MetadataUpdateOptions,
  updates: Partial<MailItemMetadata>,
): Promise<UpdateResult> {
  const dedup_key = create_dedup_key(item_id, updates);

  cleanup_completed_cache();

  const cached = recently_completed.get(dedup_key);
  if (cached && cached.result.success) {
    return cached.result;
  }

  const in_flight = in_flight_requests.get(dedup_key);
  if (in_flight) {
    return in_flight;
  }

  const execute = async (): Promise<UpdateResult> => {
    const { patch_mail_item_metadata } = await import("@/services/api/mail");

    let current_metadata: MailItemMetadata | null = null;

    if (current.encrypted_metadata && current.metadata_nonce) {
      current_metadata = await decrypt_mail_metadata(
        current.encrypted_metadata,
        current.metadata_nonce,
        current.metadata_version,
      );
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

    const encrypted = await encrypt_mail_metadata(updated_metadata);

    if (!encrypted) {
      return { success: false };
    }

    const result = await patch_mail_item_metadata(item_id, {
      encrypted_metadata: encrypted.encrypted_metadata,
      metadata_nonce: encrypted.metadata_nonce,
    });

    return { success: !!result.data, encrypted };
  };

  const promise = execute();
  in_flight_requests.set(dedup_key, promise);

  try {
    const result = await promise;
    if (result.success) {
      recently_completed.set(dedup_key, { result, timestamp: Date.now() });
    }
    return result;
  } finally {
    in_flight_requests.delete(dedup_key);
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
): Promise<{
  success: boolean;
  updated_count: number;
  failed_ids: string[];
}> {
  const { bulk_patch_metadata } = await import("@/services/api/mail");

  const bulk_items: Array<{
    id: string;
    encrypted_metadata: string;
    metadata_nonce: string;
  }> = [];
  const failed_ids: string[] = [];
  const now = new Date().toISOString();

  for (const item of items) {
    let current_metadata: MailItemMetadata | null = null;

    if (item.encrypted_metadata && item.metadata_nonce) {
      current_metadata = await decrypt_mail_metadata(
        item.encrypted_metadata,
        item.metadata_nonce,
        item.metadata_version,
      );
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

    const encrypted = await encrypt_mail_metadata(updated_metadata);

    if (encrypted) {
      bulk_items.push({
        id: item.id,
        encrypted_metadata: encrypted.encrypted_metadata,
        metadata_nonce: encrypted.metadata_nonce,
      });
    } else {
      failed_ids.push(item.id);
    }
  }

  if (bulk_items.length === 0) {
    return { success: false, updated_count: 0, failed_ids };
  }

  const result = await bulk_patch_metadata({ items: bulk_items });

  if (result.error) {
    return {
      success: false,
      updated_count: 0,
      failed_ids: items.map((i) => i.id),
    };
  }

  return {
    success: failed_ids.length === 0,
    updated_count: result.data?.updated_count ?? 0,
    failed_ids,
  };
}
