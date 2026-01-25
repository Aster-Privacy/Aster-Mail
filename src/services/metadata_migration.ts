import type { MailItemMetadata } from "@/types/email";

import {
  sync_mail_items,
  get_migration_status,
  start_migration,
  complete_migration,
  bulk_update_metadata,
  type MailItem,
} from "@/services/api/mail";
import { encrypt_mail_metadata } from "@/services/crypto/mail_metadata";

const BATCH_SIZE = 50;

export interface MigrationProgress {
  status: "idle" | "checking" | "migrating" | "completed" | "failed";
  total_items: number;
  processed_items: number;
  error?: string;
}

type ProgressCallback = (progress: MigrationProgress) => void;

function build_metadata_from_item(item: MailItem): MailItemMetadata {
  return {
    is_read: item.is_read ?? false,
    is_starred: item.is_starred ?? false,
    is_pinned: item.is_pinned ?? false,
    is_trashed: item.is_trashed ?? false,
    is_archived: item.is_archived ?? false,
    is_spam: item.is_spam ?? false,
    size_bytes: item.size_bytes ?? 0,
    has_attachments: item.has_attachments ?? false,
    attachment_count: item.attachment_count ?? 0,
    scheduled_at: item.scheduled_at,
    send_status: item.send_status,
    snoozed_until: item.snoozed_until,
    message_ts: item.message_ts ?? new Date().toISOString(),
    item_type: item.item_type,
  };
}

async function encrypt_batch(
  items: MailItem[],
): Promise<
  Array<{ id: string; encrypted_metadata: string; metadata_nonce: string }>
> {
  const results: Array<{
    id: string;
    encrypted_metadata: string;
    metadata_nonce: string;
  }> = [];

  for (const item of items) {
    if (item.encrypted_metadata && item.metadata_nonce) {
      continue;
    }

    const metadata = build_metadata_from_item(item);
    const encrypted = await encrypt_mail_metadata(metadata);

    if (encrypted) {
      results.push({
        id: item.id,
        encrypted_metadata: encrypted.encrypted_metadata,
        metadata_nonce: encrypted.metadata_nonce,
      });
    }
  }

  return results;
}

export async function check_migration_status(): Promise<{
  is_migrated: boolean;
  migration_version: number;
}> {
  const response = await get_migration_status();

  if (response.error || !response.data) {
    return { is_migrated: false, migration_version: 0 };
  }

  return response.data;
}

export async function run_metadata_migration(
  on_progress?: ProgressCallback,
): Promise<{ success: boolean; error?: string }> {
  const report_progress = (progress: MigrationProgress) => {
    on_progress?.(progress);
  };

  report_progress({
    status: "checking",
    total_items: 0,
    processed_items: 0,
  });

  const status = await check_migration_status();

  if (status.is_migrated) {
    report_progress({
      status: "completed",
      total_items: 0,
      processed_items: 0,
    });

    return { success: true };
  }

  const start_response = await start_migration();

  if (start_response.error) {
    report_progress({
      status: "failed",
      total_items: 0,
      processed_items: 0,
      error: "failed to start migration",
    });

    return { success: false, error: "failed to start migration" };
  }

  report_progress({
    status: "migrating",
    total_items: 0,
    processed_items: 0,
  });

  let cursor: string | undefined;
  let total_processed = 0;
  let total_items = 0;

  try {
    while (true) {
      const response = await sync_mail_items({
        limit: BATCH_SIZE,
        cursor,
      });

      if (response.error || !response.data) {
        throw new Error("failed to fetch items");
      }

      const { items, next_cursor, has_more } = response.data;

      if (items.length === 0) {
        break;
      }

      total_items += items.length;

      const items_to_encrypt = items.filter(
        (item) => !item.encrypted_metadata || !item.metadata_nonce,
      );

      if (items_to_encrypt.length > 0) {
        const encrypted_batch = await encrypt_batch(items_to_encrypt);

        if (encrypted_batch.length > 0) {
          const update_response = await bulk_update_metadata({
            items: encrypted_batch,
          });

          if (update_response.error) {
            throw new Error("failed to update metadata");
          }
        }
      }

      total_processed += items.length;

      report_progress({
        status: "migrating",
        total_items,
        processed_items: total_processed,
      });

      if (!has_more || !next_cursor) {
        break;
      }

      cursor = next_cursor;
    }

    const complete_response = await complete_migration();

    if (complete_response.error) {
      throw new Error("failed to complete migration");
    }

    report_progress({
      status: "completed",
      total_items,
      processed_items: total_processed,
    });

    return { success: true };
  } catch (error) {
    const error_message =
      error instanceof Error ? error.message : "unknown error";

    report_progress({
      status: "failed",
      total_items,
      processed_items: total_processed,
      error: error_message,
    });

    return { success: false, error: error_message };
  }
}

export async function migrate_single_item(item: MailItem): Promise<boolean> {
  if (item.encrypted_metadata && item.metadata_nonce) {
    return true;
  }

  const metadata = build_metadata_from_item(item);
  const encrypted = await encrypt_mail_metadata(metadata);

  if (!encrypted) {
    return false;
  }

  const response = await bulk_update_metadata({
    items: [
      {
        id: item.id,
        encrypted_metadata: encrypted.encrypted_metadata,
        metadata_nonce: encrypted.metadata_nonce,
      },
    ],
  });

  return !response.error;
}
