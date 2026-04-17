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
import type { InboxEmail } from "@/types/email";

import { useCallback } from "react";

import {
  update_item_metadata,
  bulk_update_items_metadata,
} from "@/services/crypto/mail_metadata";
import { use_i18n } from "@/lib/i18n/context";

export type MetadataFields = Partial<{
  is_read: boolean;
  is_starred: boolean;
  is_pinned: boolean;
  is_trashed: boolean;
  is_archived: boolean;
  is_spam: boolean;
}>;

export interface MetadataHelpers {
  update_with_metadata: (
    email: InboxEmail,
    updates: MetadataFields,
  ) => Promise<{
    data?: { encrypted_metadata?: string; metadata_nonce?: string };
    error?: string;
  }>;
  bulk_update_with_metadata: (
    emails: InboxEmail[],
    updates: MetadataFields,
    options?: {
      signal?: AbortSignal;
      on_progress?: (completed: number, total: number) => void;
    },
  ) => Promise<{ success: boolean; failed_ids: string[] }>;
}

export function use_metadata_helpers(): MetadataHelpers {
  const { t } = use_i18n();

  const update_with_metadata = useCallback(
    async (
      email: InboxEmail,
      updates: MetadataFields,
    ): Promise<{
      data?: { encrypted_metadata?: string; metadata_nonce?: string };
      error?: string;
    }> => {
      const result = await update_item_metadata(
        email.id,
        {
          encrypted_metadata: email.encrypted_metadata,
          metadata_nonce: email.metadata_nonce,
          metadata_version: email.metadata_version,
        },
        updates,
      );

      return result.success
        ? {
            data: {
              encrypted_metadata: result.encrypted?.encrypted_metadata,
              metadata_nonce: result.encrypted?.metadata_nonce,
            },
          }
        : { error: t("common.failed_to_update") };
    },
    [t],
  );

  const bulk_update_with_metadata = useCallback(
    async (
      emails: InboxEmail[],
      updates: MetadataFields,
      options?: {
        signal?: AbortSignal;
        on_progress?: (completed: number, total: number) => void;
      },
    ): Promise<{ success: boolean; failed_ids: string[] }> => {
      if (options?.signal?.aborted) {
        return { success: false, failed_ids: emails.map((e) => e.id) };
      }

      const items = emails.map((email) => ({
        id: email.id,
        encrypted_metadata: email.encrypted_metadata,
        metadata_nonce: email.metadata_nonce,
        metadata_version: email.metadata_version,
      }));

      options?.on_progress?.(0, emails.length);

      const result = await bulk_update_items_metadata(items, updates);

      options?.on_progress?.(emails.length, emails.length);

      return { success: result.success, failed_ids: result.failed_ids };
    },
    [],
  );

  return { update_with_metadata, bulk_update_with_metadata };
}
