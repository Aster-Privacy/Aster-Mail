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
import {
  list_mail_items,
  list_encrypted_mail_items,
  type MailItem,
} from "@/services/api/mail";
import {
  decrypt_mail_metadata,
  create_default_metadata,
} from "@/services/crypto/mail_metadata";
import { yield_to_browser } from "@/lib/scheduling";

export const SCAN_PAGE_SIZE = 150;
export const SCAN_ITEM_CAP = 5000;
export const DECRYPT_YIELD_CHUNK = 25;

export interface ScanReceivedResult {
  items: MailItem[];
  reached_cap: boolean;
}

export async function decrypt_items_metadata_for_action(
  items: MailItem[],
  signal?: AbortSignal,
): Promise<void> {
  let processed = 0;

  for (const item of items) {
    if (signal?.aborted) return;

    processed += 1;
    if (processed % DECRYPT_YIELD_CHUNK === 0) await yield_to_browser();

    if (item.metadata) continue;

    if (!item.encrypted_metadata || !item.metadata_nonce) {
      const is_sent =
        item.item_type === "sent" ||
        item.item_type === "draft" ||
        item.item_type === "scheduled";
      const defaults = create_default_metadata(item.item_type);

      defaults.is_read = is_sent;
      if (item.message_ts) defaults.message_ts = item.message_ts;
      item.metadata = defaults;
      continue;
    }

    try {
      const meta = await decrypt_mail_metadata(
        item.encrypted_metadata,
        item.metadata_nonce,
        item.metadata_version,
      );

      item.metadata = meta ?? create_default_metadata(item.item_type);
    } catch {
      item.metadata = create_default_metadata(item.item_type);
    }
  }
}

interface PageResponse {
  data?: { items?: MailItem[]; next_cursor?: string };
}

export type ScanProgress = (page_count: number, has_more: boolean) => void;

async function scan_pages(
  fetch_page: (cursor?: string) => Promise<PageResponse>,
  signal?: AbortSignal,
  on_progress?: ScanProgress,
): Promise<ScanReceivedResult> {
  const items: MailItem[] = [];
  let cursor: string | undefined;
  let reached_cap = false;
  let page_count = 0;

  do {
    if (signal?.aborted) break;

    const response = await fetch_page(cursor);

    if (!response.data?.items) break;

    items.push(...response.data.items);
    cursor = response.data.next_cursor;
    page_count += 1;

    if (items.length >= SCAN_ITEM_CAP) {
      items.length = SCAN_ITEM_CAP;
      reached_cap = true;
      cursor = undefined;
    }

    on_progress?.(page_count, Boolean(cursor));

    if (!cursor) break;

    await yield_to_browser();
  } while (cursor);

  return { items, reached_cap };
}

export function scan_received_items(
  signal?: AbortSignal,
  on_progress?: ScanProgress,
): Promise<ScanReceivedResult> {
  return scan_pages(
    (cursor) =>
      list_mail_items({
        item_type: "received",
        limit: SCAN_PAGE_SIZE,
        ...(cursor ? { cursor } : {}),
      }),
    signal,
    on_progress,
  );
}

export function scan_encrypted_items(
  signal?: AbortSignal,
  on_progress?: ScanProgress,
): Promise<ScanReceivedResult> {
  return scan_pages(
    (cursor) =>
      list_encrypted_mail_items({
        limit: SCAN_PAGE_SIZE,
        ...(cursor ? { cursor } : {}),
      }),
    signal,
    on_progress,
  );
}
