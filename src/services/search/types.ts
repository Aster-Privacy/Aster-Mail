import type {
  SearchToken,
  SearchFilters,
  SearchableFields,
} from "../crypto/search_crypto";

export interface SearchRequest {
  search_tokens: string[];
  include_bloom?: boolean;
}

export interface SearchFiltersRequest {
  date_from?: string;
  date_to?: string;
  has_attachments?: boolean;
  is_read?: boolean;
  is_starred?: boolean;
  folder?: string;
}

export interface SearchResultEntry {
  token: string;
  encrypted_mail_ids: string;
  ids_nonce?: string;
  bloom_filter?: string;
  message_count: number;
}

export interface SearchResponse {
  results: SearchResultEntry[];
}

export interface UpdateSearchIndexRequest {
  token: string;
  encrypted_mail_ids: string[];
}

export interface BulkIndexRequest {
  entries: IndexEntry[];
}

export interface IndexEntry {
  token: string;
  message_id: string;
  bloom_filter?: string;
}

export interface DeleteSearchTokensRequest {
  tokens: string[];
}

export interface DeleteFromIndexRequest {
  message_ids: string[];
}

export interface SearchResult {
  mail_ids: string[];
  total: number;
  cached: boolean;
}

export interface EncryptedIndexPayload {
  nonce: string;
  ciphertext: string;
  version: number;
  checksum: string;
  updated_at: number;
}

export interface IndexSyncRequest {
  encrypted_index: EncryptedIndexPayload;
  version: number;
  force?: boolean;
}

export interface IndexSyncResponse {
  success: boolean;
  version: number;
  conflict?: boolean;
  server_version?: number;
}

export interface FetchIndexResponse {
  encrypted_index: EncryptedIndexPayload | null;
  version: number;
  updated_at: number;
}

export type { SearchToken, SearchFilters, SearchableFields };
