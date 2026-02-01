import type { MailItemMetadata } from "@/types/email";

import {
  encrypt_metadata,
  decrypt_metadata,
  type EncryptedBlob,
} from "./envelope";
import { get_derived_encryption_key } from "./memory_key_store";

const MAIL_METADATA_CONTEXT = "mail-item-metadata";

export interface EncryptedMailMetadataResult {
  encrypted_metadata: string;
  metadata_nonce: string;
}

export function create_default_metadata(
  item_type: string = "received",
): MailItemMetadata {
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
    message_ts: new Date().toISOString(),
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

export async function update_item_metadata(
  item_id: string,
  current: MetadataUpdateOptions,
  updates: Partial<MailItemMetadata>,
): Promise<{ success: boolean; encrypted?: MetadataUpdateResult }> {
  const { update_mail_item_metadata } = await import("@/services/api/mail");

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
  };

  const encrypted = await encrypt_mail_metadata(updated_metadata);

  if (!encrypted) {
    return { success: false };
  }

  const request_body = {
    encrypted_metadata: encrypted.encrypted_metadata,
    metadata_nonce: encrypted.metadata_nonce,
    is_read: updates.is_read,
    is_starred: updates.is_starred,
    is_trashed: updates.is_trashed,
    is_archived: updates.is_archived,
    is_spam: updates.is_spam,
  };

  const result = await update_mail_item_metadata(item_id, request_body);

  return { success: !!result.data, encrypted };
}
