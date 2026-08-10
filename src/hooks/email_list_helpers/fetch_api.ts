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
  InboxEmail,
  DecryptedEnvelope,
  MailItemMetadata,
} from "@/types/email";

import {
  classify,
  is_locked_to_primary,
} from "@/services/mail_categorizer";
import {
  list_mail_items,
  type ListMailItemsParams,
  type MailItem,
} from "@/services/api/mail";
import {
  decrypt_mail_metadata,
} from "@/services/crypto/mail_metadata";
import {
  type FormatOptions,
} from "@/utils/date_format";
import { decrypt_body_text_with_bundle } from "@/utils/email_crypto";
import { is_reaction_payload_body } from "@/lib/reaction_payload";
import {
  filter_locked_mail_items,
  is_folder_token_locked,
  request_folder_unlock,
} from "@/services/locked_folders";
import {
  resolve_sender_profiles,
} from "@/services/api/sender_profiles";
import { decrypt_envelope } from "./decrypt";
import { should_keep_email_in_view } from "./display";
import { group_emails_by_thread, sort_emails_by_timestamp } from "./grouping";
import { mail_to_email_safe } from "./mapping";
import { build_view_list_params, DEFAULT_PAGE_SIZE, MAX_PAGE_TOP_UP_ROUNDS, UNKNOWN_TOTAL } from "./views";

export async function fetch_mail_from_api(
  view: string,
  signal: AbortSignal,
  format_options: FormatOptions,
  user_email = "",
  limit = DEFAULT_PAGE_SIZE,
  cursor?: string,
  offset?: number,
  conversation_grouping = true,
  sort_order: "newest_first" | "oldest_first" = "newest_first",
): Promise<{
  emails: InboxEmail[];
  total: number;
  has_more: boolean;
  next_cursor?: string;
  raw_consumed: number;
} | null> {
  const should_group =
    conversation_grouping && view !== "scheduled" && view !== "snoozed";
  const order = sort_order === "oldest_first" ? "asc" : "desc";
  const category_index_module =
    view === "inbox" ? await import("@/services/category_index") : null;
  const index_generation = category_index_module?.get_index_generation();

  const params: ListMailItemsParams = {
    ...build_view_list_params(view),
    limit,
    order,
    ...(offset !== undefined ? { offset } : cursor ? { cursor } : {}),
    ...(offset !== undefined ? { group_by_thread: should_group } : {}),
    ...((offset !== undefined && offset > 0) || cursor
      ? { skip_total: true }
      : {}),
  };

  const response = await list_mail_items(params);

  if (
    response.code === "FORBIDDEN" &&
    params.label_token &&
    is_folder_token_locked(params.label_token)
  ) {
    request_folder_unlock(params.label_token);

    return { emails: [], total: 0, has_more: false, raw_consumed: 0 };
  }

  if (signal.aborted || !response.data) return null;

  const returned_items = filter_locked_mail_items(response.data.items);
  const items = returned_items.filter((item) => item.is_reaction !== true);
  const hidden_count = returned_items.length - items.length;
  const raw_total = response.data.total ?? 0;
  const total_is_unknown = raw_total < 0;
  let total = total_is_unknown
    ? UNKNOWN_TOTAL
    : Math.max(0, raw_total - hidden_count);
  let has_more = response.data.has_more;
  let next_cursor = response.data.next_cursor;
  let raw_consumed = returned_items.length;

  const process_items = async (batch: MailItem[]) => {
    const results = await Promise.allSettled(
      batch.map(async (item) => {
        if (signal.aborted) throw new Error("aborted");

        const has_metadata = !!(item.encrypted_metadata && item.metadata_nonce);

        const [envelope, metadata] = await Promise.all([
          decrypt_envelope(item.encrypted_envelope, item.envelope_nonce, item.id),
          has_metadata
            ? decrypt_mail_metadata(
                item.encrypted_metadata!,
                item.metadata_nonce!,
                item.metadata_version,
              )
            : Promise.resolve(null),
        ]);

        if (envelope?.body_text) {
          const bundle = await decrypt_body_text_with_bundle(
            envelope.body_text,
            user_email,
            envelope.from?.email || "",
            item.id,
          );

          envelope.body_text = bundle.body;
          if (bundle.subject !== null && !envelope.subject) {
            envelope.subject = bundle.subject;
          }
        }

        return { item, envelope, metadata };
      }),
    );

    if (signal.aborted) return null;

    const successful = results
      .filter(
        (
          r,
        ): r is PromiseFulfilledResult<{
          item: MailItem;
          envelope: DecryptedEnvelope | null;
          metadata: MailItemMetadata | null;
        }> => r.status === "fulfilled",
      )
      .map((r) => r.value)
      .filter(({ envelope }) => {
        const is_reaction_body =
          is_reaction_payload_body(envelope?.body_text) ||
          is_reaction_payload_body(envelope?.text_body);

        if (is_reaction_body && !total_is_unknown) {
          total = Math.max(0, total - 1);
        }

        return !is_reaction_body;
      });

    const sender_emails = successful
      .map(({ envelope }) => envelope?.from?.email)
      .filter((e): e is string => !!e);

    if (sender_emails.length > 0) {
      await resolve_sender_profiles(sender_emails);
    }

    let emails = successful
      .map(({ item, envelope, metadata }) =>
        mail_to_email_safe(item, envelope, metadata, format_options),
      )
      .filter((email): email is InboxEmail => email !== null);

    if (view === "inbox" && category_index_module) {
      const index_entries = successful
        .filter(({ envelope }) => !!envelope)
        .filter(
          ({ item, metadata }) =>
            !category_index_module.is_item_outside_inbox(item) &&
            !metadata?.is_trashed &&
            !metadata?.is_archived &&
            !metadata?.is_spam,
        )
        .flatMap(({ item, envelope, metadata }) => {
          try {
            return [
              {
                id: item.id,
                thread_token: item.thread_token,
                message_ts: item.message_ts || item.created_at,
                is_read: item.is_read === true || (metadata?.is_read ?? false),
                category: classify(envelope!, metadata, {
                  rule_category: item.rule_category,
                }),
                category_pinned:
                  metadata?.category_pinned === true &&
                  !!metadata?.category &&
                  !is_locked_to_primary(envelope!),
              },
            ];
          } catch {
            return [];
          }
        });

      if (index_entries.length > 0) {
        category_index_module.upsert_entries(
          index_entries,
          index_generation,
          true,
        );
      }
    }

    emails = emails.filter((e) =>
      should_keep_email_in_view(
        {
          is_trashed: e.is_trashed,
          is_spam: e.is_spam,
          is_archived: e.is_archived,
          item_type: e.item_type,
          snoozed_until: e.snoozed_until,
        },
        view,
      ),
    );

    return emails;
  };

  const first_batch = await process_items(items);

  if (first_batch === null) return null;

  const collected: InboxEmail[] = [...first_batch];
  const supports_top_up = offset !== undefined;

  let top_up_rounds = 0;

  while (
    supports_top_up &&
    has_more &&
    collected.length < limit &&
    top_up_rounds < MAX_PAGE_TOP_UP_ROUNDS
  ) {
    top_up_rounds += 1;

    const top_up_response = await list_mail_items({
      ...params,
      limit: limit - collected.length,
      offset: offset + raw_consumed,
      skip_total: true,
    });

    if (signal.aborted) return null;
    if (!top_up_response.data) break;

    const top_up_returned = top_up_response.data.items;

    if (top_up_returned.length === 0) {
      has_more = top_up_response.data.has_more;
      break;
    }

    raw_consumed += top_up_returned.length;
    has_more = top_up_response.data.has_more;
    next_cursor = top_up_response.data.next_cursor;

    const seen_ids = new Set(collected.map((e) => e.id));
    const top_up_batch = await process_items(
      top_up_returned.filter((item) => item.is_reaction !== true),
    );

    if (top_up_batch === null) return null;

    collected.push(...top_up_batch.filter((e) => !seen_ids.has(e.id)));
  }

  const sorted_emails = sort_emails_by_timestamp(collected, order);

  const final_emails = should_group
    ? group_emails_by_thread(sorted_emails)
    : sorted_emails;

  return { emails: final_emails, total, has_more, next_cursor, raw_consumed };
}
