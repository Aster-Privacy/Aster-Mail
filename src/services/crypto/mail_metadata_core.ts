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
  encrypt_metadata,
  decrypt_metadata,
  type EncryptedBlob,
} from "./envelope";
import { get_derived_encryption_key } from "./memory_key_store";
import { zero_uint8_array } from "./secure_memory";

const MAIL_METADATA_CONTEXT = "mail-item-metadata";

export const SERVER_FLAG_FIELDS = [
  "is_read",
  "is_starred",
  "is_pinned",
  "is_trashed",
  "is_archived",
  "is_spam",
] as const;

const server_flag_field_set: ReadonlySet<string> = new Set(SERVER_FLAG_FIELDS);

export function blob_only_update_fields(
  updates: Partial<MailItemMetadata>,
): string[] {
  return Object.keys(updates).filter((key) => !server_flag_field_set.has(key));
}

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
  } finally {
    if (master_key instanceof Uint8Array) {
      zero_uint8_array(master_key);
    }
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
  } finally {
    if (master_key instanceof Uint8Array) {
      zero_uint8_array(master_key);
    }
  }
}

export function extract_metadata_from_server(
  decrypted: MailItemMetadata | null,
  server_data: {
    scheduled_at?: string;
    send_status?: string;
    snoozed_until?: string;
    message_ts?: string;
    item_type?: string;
    is_read?: boolean;
    is_starred?: boolean;
    is_pinned?: boolean;
    is_trashed?: boolean;
    is_archived?: boolean;
    is_spam?: boolean;
    has_attachments?: boolean;
    attachment_count?: number;
    size_bytes?: number;
  },
): MailItemMetadata {
  if (!decrypted) {
    const is_sent_type =
      server_data.item_type === "sent" ||
      server_data.item_type === "draft" ||
      server_data.item_type === "scheduled";

    return {
      is_read: is_sent_type ? true : (server_data.is_read ?? false),
      is_starred: server_data.is_starred ?? false,
      is_pinned: server_data.is_pinned ?? false,
      is_trashed: server_data.is_trashed ?? false,
      is_archived: server_data.is_archived ?? false,
      is_spam: server_data.is_spam ?? false,
      size_bytes: server_data.size_bytes ?? 0,
      has_attachments: server_data.has_attachments ?? false,
      attachment_count: server_data.attachment_count ?? 0,
      scheduled_at: server_data.scheduled_at,
      send_status: server_data.send_status,
      snoozed_until: server_data.snoozed_until,
      message_ts: server_data.message_ts ?? new Date().toISOString(),
      item_type: server_data.item_type ?? "received",
    };
  }

  const is_sent_type =
    server_data.item_type === "sent" ||
    server_data.item_type === "draft" ||
    server_data.item_type === "scheduled";

  return {
    ...decrypted,
    is_read: is_sent_type ? true : (server_data.is_read ?? decrypted.is_read),
    is_starred: server_data.is_starred ?? decrypted.is_starred,
    is_pinned: server_data.is_pinned ?? decrypted.is_pinned,
    is_trashed: decrypted.is_trashed || (server_data.is_trashed ?? false),
    is_archived: decrypted.is_archived || (server_data.is_archived ?? false),
    is_spam: decrypted.is_spam || (server_data.is_spam ?? false),
    has_attachments:
      (decrypted.has_attachments ?? false) ||
      (server_data.has_attachments ?? false),
    attachment_count: Math.max(
      decrypted.attachment_count ?? 0,
      server_data.attachment_count ?? 0,
    ),
    size_bytes: Math.max(decrypted.size_bytes ?? 0, server_data.size_bytes ?? 0),
    scheduled_at: server_data.scheduled_at ?? decrypted.scheduled_at,
    send_status: server_data.send_status ?? decrypted.send_status,
    snoozed_until: server_data.snoozed_until ?? decrypted.snoozed_until,
    message_ts: server_data.message_ts ?? decrypted.message_ts,
    item_type: server_data.item_type ?? decrypted.item_type,
  };
}

export interface PlaintextFlagPatch {
  is_read: boolean;
  is_starred: boolean;
  is_pinned: boolean;
  is_trashed: boolean;
  is_archived: boolean;
  is_spam: boolean;
}

export function metadata_flag_patch(
  metadata: MailItemMetadata,
): PlaintextFlagPatch {
  return {
    is_read: metadata.is_read ?? false,
    is_starred: metadata.is_starred ?? false,
    is_pinned: metadata.is_pinned ?? false,
    is_trashed: metadata.is_trashed ?? false,
    is_archived: metadata.is_archived ?? false,
    is_spam: metadata.is_spam ?? false,
  };
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

export interface MetadataWriteResult {
  success: boolean;
  encrypted?: MetadataUpdateResult;
  written_version?: number;
  undecryptable?: boolean;
  unapplied_fields?: string[];
}

