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
  ENVELOPE_FETCH_CHUNK,
  ENVELOPE_PAGE_LIMIT,
  INDEX_PAGE_LIMIT,
  MAX_RAM_INDEX_ITEMS,
} from "./constants";
import {
  decrypt_envelope_for_search,
  reset_legacy_migration_state,
} from "./envelope";
import { build_generation } from "./index_cache";
import { searchable_body_source } from "./matching";
import { emit_indexing } from "./progress";
import { CachedIndex, DecryptedIndexEntry } from "./types";

import {
  list_encrypted_mail_items,
  list_mail_items,
  type MailItem,
} from "@/services/api/mail";
import {
  decrypt_mail_metadata,
  extract_metadata_from_server,
} from "@/services/crypto/mail_metadata";
import { filter_locked_mail_items } from "@/services/locked_folders";
import { strip_html_tags } from "@/lib/html_sanitizer";
import { decrypt_body_text_with_bundle } from "@/utils/email_crypto";
import {
  bound_index_body,
  metadata_fingerprint,
  slim_envelope_for_index,
  trim_item_for_index,
  type SnapshotWriter,
} from "@/services/search_index_store";
import {
  is_index_download_paused,
  record_index_download_checkpoint,
} from "@/services/search/index_download_control";
import { add_vocabulary_entry } from "@/services/search/vocabulary";

export interface PipelineOptions {
  user_email: string;
  include_body: boolean;
  prior?: Map<string, DecryptedIndexEntry>;
  my_gen: number;
  start_cursor?: string;
  stop_at_id?: string;
  max_items: number;
  hot: CachedIndex | null;
  writer: SnapshotWriter | null;
  report_progress: boolean;
  pausable?: boolean;
  checkpoint?: boolean;
  progress_base?: number;
}

export interface PipelineResult {
  processed: number;
  next_cursor?: string;
  reached_boundary: boolean;
  fresh_count: number;
  paused: boolean;
}

export async function run_index_pipeline(
  options: PipelineOptions,
): Promise<PipelineResult> {
  const { user_email, include_body, prior, my_gen, hot, writer } = options;
  const incremental = !!prior && prior.size > 0;
  const batch_size = include_body ? 40 : 250;
  const page_limit = incremental ? INDEX_PAGE_LIMIT : ENVELOPE_PAGE_LIMIT;
  let cursor = options.start_cursor;
  let processed = 0;
  let fresh_count = 0;
  let known_total = 0;
  let reached_boundary = false;

  if (!incremental) reset_legacy_migration_state();

  const cancel = (): never => {
    throw new Error("search_index_cancelled");
  };

  const fail = (error: string): never => {
    throw new Error(`search_fetch_failed:${error}`);
  };

  const base = options.progress_base ?? 0;
  let display_total = base;
  let pause_hit = false;

  const pause_requested = (): boolean =>
    !!options.pausable && is_index_download_paused();

  const report = (): void => {
    if (options.report_progress) {
      emit_indexing({ current: base + processed, total: display_total });
    }
    if (options.checkpoint) {
      record_index_download_checkpoint(base + processed, display_total);
    }
  };

  const is_reusable = (item: MailItem): boolean => {
    const prior_entry = prior?.get(item.id);
    const immutable =
      item.item_type === "received" || item.item_type === "sent";

    return (
      !!prior_entry &&
      !!prior_entry.envelope &&
      immutable &&
      (prior_entry.has_body || !include_body)
    );
  };

  const fetch_envelopes = async (
    ids: string[],
  ): Promise<Map<string, MailItem>> => {
    const by_id = new Map<string, MailItem>();

    for (let i = 0; i < ids.length; i += ENVELOPE_FETCH_CHUNK) {
      const response = await list_mail_items({
        ids: ids.slice(i, i + ENVELOPE_FETCH_CHUNK),
      });

      if (my_gen !== build_generation) cancel();
      if (response.error) fail(response.error);

      for (const full of response.data?.items ?? []) {
        by_id.set(full.id, full);
      }
    }

    return by_id;
  };

  const index_metadata = async (item: MailItem): Promise<MailItemMetadata> => {
    let decrypted: MailItemMetadata | null = null;

    if (item.encrypted_metadata && item.metadata_nonce) {
      decrypted = await decrypt_mail_metadata(
        item.encrypted_metadata,
        item.metadata_nonce,
        item.metadata_version,
      );
    }

    return extract_metadata_from_server(decrypted, {
      scheduled_at: item.scheduled_at,
      send_status: item.send_status,
      snoozed_until: item.snoozed_until,
      message_ts: item.message_ts,
      item_type: item.item_type,
      is_read: item.is_read,
      is_starred: item.is_starred,
      is_pinned: item.is_pinned,
      is_trashed: item.is_trashed,
      is_archived: item.is_archived,
      is_spam: item.is_spam,
      has_attachments: item.has_attachments,
      attachment_count: item.attachment_count,
      size_bytes: item.size_bytes,
    });
  };

  const decrypt_item = async (
    item: MailItem,
    envelope_by_id: Map<string, MailItem> | null,
  ): Promise<{ id: string; entry: DecryptedIndexEntry; fresh: boolean }> => {
    const meta_fp = metadata_fingerprint(item);
    const prior_entry = prior?.get(item.id);
    const immutable =
      item.item_type === "received" || item.item_type === "sent";

    if (
      prior_entry &&
      prior_entry.envelope &&
      immutable &&
      (prior_entry.has_body || !include_body)
    ) {
      if (prior_entry.meta_fp === meta_fp) {
        return { id: item.id, entry: prior_entry, fresh: false };
      }

      const refreshed_metadata = await index_metadata(item);

      return {
        id: item.id,
        entry: { ...prior_entry, metadata: refreshed_metadata, meta_fp },
        fresh: true,
      };
    }

    const source = envelope_by_id
      ? (envelope_by_id.get(item.id) ?? null)
      : item;

    if (!source?.encrypted_envelope) {
      return {
        id: item.id,
        entry: prior_entry ?? {
          envelope: null,
          metadata: null,
          search_body_text: "",
          meta_fp,
          has_body: include_body,
        },
        fresh: false,
      };
    }

    const envelope = await decrypt_envelope_for_search(
      source.encrypted_envelope,
      source.envelope_nonce,
      item.id,
      item.item_type,
    );

    if (envelope?.body_text) {
      if (include_body || !envelope.subject) {
        const sender_email = envelope.from?.email || "";

        const bundle = await decrypt_body_text_with_bundle(
          envelope.body_text,
          user_email,
          sender_email,
          item.id,
        );

        if (bundle.subject !== null && !envelope.subject) {
          envelope.subject = bundle.subject;
        }
        envelope.body_text = include_body ? bundle.body : "";
      } else {
        envelope.body_text = "";
      }
    }
    if (envelope && !include_body) {
      envelope.body_html = "";
      envelope.html_body = "";
    }

    const metadata = await index_metadata(item);

    const bounded_body = bound_index_body(
      envelope ? strip_html_tags(searchable_body_source(envelope)) : "",
    );

    if (envelope) {
      envelope.body_text = bounded_body.preview_text;
    }

    return {
      id: item.id,
      entry: {
        envelope: envelope ? slim_envelope_for_index(envelope) : null,
        metadata,
        search_body_text: bounded_body.search_text,
        meta_fp,
        has_body: include_body,
      },
      fresh: envelope !== null,
    };
  };

  const decrypt_page = async (
    page_items: MailItem[],
    envelope_by_id: Map<string, MailItem> | null,
  ): Promise<Map<string, DecryptedIndexEntry>> => {
    const page_entries = new Map<string, DecryptedIndexEntry>();

    for (let i = 0; i < page_items.length; i += batch_size) {
      const batch = page_items.slice(i, i + batch_size);

      const results = await Promise.allSettled(
        batch.map((item) => decrypt_item(item, envelope_by_id)),
      );

      for (const result of results) {
        if (result.status === "fulfilled") {
          if (result.value.fresh) fresh_count++;
          page_entries.set(result.value.id, result.value.entry);
          add_vocabulary_entry(
            result.value.entry.envelope,
            result.value.entry.search_body_text,
          );
        }
      }

      if (my_gen !== build_generation) cancel();

      processed += batch.length;
      report();

      if (pause_requested()) {
        pause_hit = true;
        break;
      }

      await new Promise<void>((r) => setTimeout(r, 0));
    }

    return page_entries;
  };

  do {
    if (pause_requested()) {
      return {
        processed,
        next_cursor: cursor,
        reached_boundary,
        fresh_count,
        paused: true,
      };
    }

    const page_start_cursor = cursor;
    const page_start_processed = processed;
    const response = await list_encrypted_mail_items({
      cursor,
      limit: page_limit,
      include_envelope: incremental ? false : undefined,
    });

    if (my_gen !== build_generation) cancel();
    if (response.error) fail(response.error);
    if (!response.data?.items?.length) {
      cursor = undefined;
      break;
    }

    cursor = response.data.next_cursor;

    if (typeof response.data.total === "number" && response.data.total > 0) {
      known_total =
        base > 0
          ? response.data.total
          : Math.min(response.data.total, options.max_items);
    }

    let page_items = response.data.items;

    if (options.stop_at_id) {
      const boundary = page_items.findIndex(
        (item) => item.id === options.stop_at_id,
      );

      if (boundary >= 0) {
        page_items = page_items.slice(0, boundary);
        reached_boundary = true;
      }
    }

    const room = options.max_items - processed;

    if (page_items.length > room) {
      page_items = page_items.slice(0, room);
    }

    page_items = filter_locked_mail_items(page_items);

    display_total = Math.max(
      display_total,
      known_total,
      base + processed + page_items.length,
    );

    if (options.report_progress) {
      emit_indexing({ total: display_total });
    }

    const envelope_by_id = incremental
      ? await fetch_envelopes(
          page_items.filter((item) => !is_reusable(item)).map((it) => it.id),
        )
      : null;

    const page_entries = await decrypt_page(page_items, envelope_by_id);

    if (pause_hit) {
      return {
        processed: page_start_processed,
        next_cursor: page_start_cursor,
        reached_boundary,
        fresh_count,
        paused: true,
      };
    }

    if (hot) {
      for (const item of page_items) {
        if (hot.items.length >= MAX_RAM_INDEX_ITEMS) break;

        const entry = page_entries.get(item.id);

        if (!entry) continue;

        hot.items.push(trim_item_for_index(item));
        hot.decrypted.set(item.id, entry);
      }
    }

    if (writer) {
      await writer.add_page(page_items, page_entries);
    }

    page_entries.clear();

    if (!hot && writer?.storage_exhausted()) break;
  } while (cursor && !reached_boundary && processed < options.max_items);

  if (my_gen !== build_generation) cancel();

  return {
    processed,
    next_cursor: reached_boundary ? undefined : cursor,
    reached_boundary,
    fresh_count,
    paused: false,
  };
}
