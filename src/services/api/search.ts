import type { SearchToken, SearchFilters } from "../crypto/search_crypto";
import type {
  SearchRequest,
  SearchResponse,
  UpdateSearchIndexRequest,
  BulkIndexRequest,
  IndexEntry,
  DeleteSearchTokensRequest,
  DeleteFromIndexRequest,
  SearchResult,
  SearchableFields,
} from "../search/types";

import {
  generate_search_tokens,
  generate_cache_key,
  get_search_crypto,
} from "../crypto/search_crypto";
import {
  generate_tokens_with_worker,
  index_message_with_worker,
  bulk_index_with_worker,
  search_with_worker,
  type IndexedMessageResult,
} from "../crypto/search_worker_client";
import { get_cached_results, set_cached_results } from "../search/cache";
import { schedule_index_sync } from "../search/index_manager";

import { api_client, type ApiResponse } from "./client";

export type {
  SearchRequest,
  SearchFiltersRequest,
  SearchResultEntry,
  SearchResponse,
  UpdateSearchIndexRequest,
  BulkIndexRequest,
  IndexEntry,
  DeleteSearchTokensRequest,
  DeleteFromIndexRequest,
  SearchResult,
  EncryptedIndexPayload,
  IndexSyncRequest,
  IndexSyncResponse,
  FetchIndexResponse,
  SearchToken,
  SearchFilters,
  SearchableFields,
} from "../search/types";

export {
  sync_encrypted_index,
  schedule_index_sync,
  force_sync_index,
  load_index_from_server,
  build_full_index,
  get_local_index_stats,
  get_local_index,
  clear_local_index,
  remove_from_local_index,
  build_global_search_index,
  is_global_index_ready,
  reset_global_index,
} from "../search/index_manager";

export { clear_search_cache } from "../search/cache";

export async function search_mail(
  tokens: string[],
): Promise<ApiResponse<SearchResponse>> {
  const request: SearchRequest = { search_tokens: tokens };

  return api_client.post<SearchResponse>("/mail/v1/search", request);
}

export async function encrypted_search(
  query: string,
  options: {
    fields?: ("subject" | "body" | "sender" | "recipient" | "all")[];
    filters?: SearchFilters;
    limit?: number;
    offset?: number;
    use_worker?: boolean;
    skip_cache?: boolean;
    use_local_index?: boolean;
  } = {},
): Promise<SearchResult> {
  const {
    fields = ["all"],
    filters,
    limit = 50,
    offset = 0,
    use_worker = true,
    skip_cache = false,
    use_local_index = true,
  } = options;

  if (!query.trim()) {
    return { mail_ids: [], total: 0, cached: false };
  }

  let tokens: SearchToken[];

  if (use_worker && typeof Worker !== "undefined") {
    tokens = await generate_tokens_with_worker(query, fields);
  } else {
    tokens = await generate_search_tokens(query, fields);
  }

  if (tokens.length === 0) {
    return { mail_ids: [], total: 0, cached: false };
  }

  if (!skip_cache) {
    const cache_key = await generate_cache_key(tokens, filters);
    const cached_results = get_cached_results(cache_key);

    if (cached_results) {
      const paginated = cached_results.slice(offset, offset + limit);

      return {
        mail_ids: paginated,
        total: cached_results.length,
        cached: true,
      };
    }
  }

  if (use_local_index && use_worker && typeof Worker !== "undefined") {
    try {
      const worker_result = await search_with_worker(query, {
        fields,
        filters: filters
          ? {
              date_from: filters.date_from
                ? new Date(filters.date_from).getTime()
                : undefined,
              date_to: filters.date_to
                ? new Date(filters.date_to).getTime()
                : undefined,
              has_attachments: filters.has_attachments,
              is_read: filters.is_read,
              is_starred: filters.is_starred,
              folder: filters.folder,
            }
          : undefined,
        limit,
        offset,
      });

      if (worker_result.total > 0) {
        const mail_ids = worker_result.results.map((r) => r.message_id);

        if (!skip_cache && mail_ids.length > 0) {
          const cache_key = await generate_cache_key(tokens, filters);

          set_cached_results(cache_key, mail_ids);
        }

        return {
          mail_ids,
          total: worker_result.total,
          cached: false,
        };
      }
    } catch {
      return { mail_ids: [], total: 0, cached: false };
    }
  }

  return { mail_ids: [], total: 0, cached: false };
}

export async function local_search(
  query: string,
  options: {
    fields?: ("subject" | "body" | "sender" | "recipient" | "all")[];
    filters?: SearchFilters;
    limit?: number;
    offset?: number;
  } = {},
): Promise<
  Array<{ message_id: string; score: number; matched_fields: string[] }>
> {
  const { fields = ["all"], filters, limit = 50, offset = 0 } = options;

  const search_crypto = get_search_crypto();

  return search_crypto.search(query, { fields, filters, limit, offset });
}

export async function update_search_index(
  token: string,
  encrypted_mail_ids: string[],
): Promise<ApiResponse<{ status: string }>> {
  const request: UpdateSearchIndexRequest = { token, encrypted_mail_ids };

  return api_client.put<{ status: string }>("/mail/v1/search/index", request);
}

export async function bulk_update_search_index(
  entries: IndexEntry[],
): Promise<ApiResponse<{ status: string; indexed_count: number }>> {
  const request: BulkIndexRequest = { entries };

  return api_client.post<{ status: string; indexed_count: number }>(
    "/mail/v1/search/index/bulk",
    request,
  );
}

export async function delete_search_tokens(
  tokens: string[],
): Promise<ApiResponse<{ status: string }>> {
  const request: DeleteSearchTokensRequest = { tokens };

  return api_client.post<{ status: string }>("/mail/v1/search/delete", request);
}

export async function delete_from_index(
  message_ids: string[],
): Promise<ApiResponse<{ status: string }>> {
  const request: DeleteFromIndexRequest = { message_ids };

  return api_client.post<{ status: string }>("/mail/v1/search/index/delete", request);
}

export async function index_message(
  message_id: string,
  fields: SearchableFields,
  options: { use_worker?: boolean; sync_to_server?: boolean } = {},
): Promise<{ success: boolean; tokens_indexed: number }> {
  const { use_worker = true, sync_to_server = false } = options;

  let indexed: IndexedMessageResult;

  if (use_worker && typeof Worker !== "undefined") {
    indexed = await index_message_with_worker(message_id, fields);
  } else {
    const { index_message_fields, serialize_bloom_filter } = await import(
      "../crypto/search_crypto"
    );
    const result = await index_message_fields(message_id, fields);

    indexed = {
      message_id: result.message_id,
      tokens: result.tokens,
      bloom_filter: serialize_bloom_filter(result.bloom_filter),
    };
  }

  const search_crypto = get_search_crypto();

  await search_crypto.update_index([
    {
      id: message_id,
      subject: fields.subject,
      body: fields.body,
      sender_email: fields.sender_email,
      sender_name: fields.sender_name,
      recipient_emails: fields.recipient_emails,
      recipient_names: fields.recipient_names,
    },
  ]);

  if (sync_to_server) {
    schedule_index_sync();
  }

  const entries: IndexEntry[] = indexed.tokens.map((t) => ({
    token: t.token,
    message_id: indexed.message_id,
    bloom_filter: indexed.bloom_filter,
  }));

  const unique_entries = entries.filter(
    (entry, index, self) =>
      index === self.findIndex((e) => e.token === entry.token),
  );

  const response = await bulk_update_search_index(unique_entries);

  return {
    success: !response.error,
    tokens_indexed: response.data?.indexed_count || 0,
  };
}

export async function bulk_index_messages(
  messages: Array<{ id: string; fields: SearchableFields }>,
  options: {
    use_worker?: boolean;
    batch_size?: number;
    sync_to_server?: boolean;
  } = {},
): Promise<{ success: boolean; total_indexed: number; failed: string[] }> {
  const { use_worker = true, batch_size = 50, sync_to_server = true } = options;

  let all_indexed: IndexedMessageResult[] = [];
  const failed: string[] = [];

  if (use_worker && typeof Worker !== "undefined") {
    all_indexed = await bulk_index_with_worker(messages);
  } else {
    const { index_message_fields, serialize_bloom_filter } = await import(
      "../crypto/search_crypto"
    );

    for (const msg of messages) {
      try {
        const result = await index_message_fields(msg.id, msg.fields);

        all_indexed.push({
          message_id: result.message_id,
          tokens: result.tokens,
          bloom_filter: serialize_bloom_filter(result.bloom_filter),
        });
      } catch {
        failed.push(msg.id);
      }
    }
  }

  const search_crypto = get_search_crypto();

  await search_crypto.update_index(
    messages.map((m) => ({
      id: m.id,
      subject: m.fields.subject,
      body: m.fields.body,
      sender_email: m.fields.sender_email,
      sender_name: m.fields.sender_name,
      recipient_emails: m.fields.recipient_emails,
      recipient_names: m.fields.recipient_names,
    })),
  );

  if (sync_to_server) {
    schedule_index_sync();
  }

  let total_indexed = 0;

  for (let i = 0; i < all_indexed.length; i += batch_size) {
    const batch = all_indexed.slice(i, i + batch_size);
    const entries: IndexEntry[] = [];

    for (const indexed of batch) {
      for (const token of indexed.tokens) {
        entries.push({
          token: token.token,
          message_id: indexed.message_id,
          bloom_filter: indexed.bloom_filter,
        });
      }
    }

    const unique_entries = entries.filter(
      (entry, index, self) =>
        index ===
        self.findIndex(
          (e) => e.token === entry.token && e.message_id === entry.message_id,
        ),
    );

    const response = await bulk_update_search_index(unique_entries);

    if (response.data) {
      total_indexed += response.data.indexed_count;
    }
  }

  return {
    success: failed.length === 0,
    total_indexed,
    failed,
  };
}
