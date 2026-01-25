import { get_derived_encryption_key } from "./memory_key_store";
import { zero_uint8_array } from "./secure_memory";

const SEARCH_KEY_INFO = "aster-search-key-v1";
const INDEX_KEY_INFO = "aster-search-index-key-v1";
const TOKEN_SALT = new Uint8Array([
  0x41, 0x73, 0x74, 0x65, 0x72, 0x53, 0x65, 0x61, 0x72, 0x63, 0x68, 0x54, 0x6f,
  0x6b, 0x65, 0x6e,
]);
const INDEX_SALT = new Uint8Array([
  0x41, 0x73, 0x74, 0x65, 0x72, 0x49, 0x6e, 0x64, 0x65, 0x78, 0x45, 0x6e, 0x63,
  0x72, 0x79, 0x70,
]);

const BLOOM_SIZE = 256;
const BLOOM_HASH_COUNT = 7;
const INDEX_VERSION = 2;
const COMPRESSION_THRESHOLD = 1024;

export interface SearchToken {
  token: string;
  field: SearchField;
}

export interface BloomFilter {
  bits: Uint8Array;
  hash_count: number;
}

export interface IndexedMessage {
  message_id: string;
  tokens: SearchToken[];
  bloom_filter: BloomFilter;
}

export interface SearchableFields {
  subject?: string;
  body?: string;
  sender_email?: string;
  sender_name?: string;
  recipient_emails?: string[];
  recipient_names?: string[];
}

export type SearchField = "subject" | "body" | "sender" | "recipient" | "all";

export interface SearchFilters {
  date_from?: string;
  date_to?: string;
  has_attachments?: boolean;
  is_read?: boolean;
  is_starred?: boolean;
  folder?: string;
}

export interface InvertedIndexEntry {
  message_ids: string[];
  positions: Map<string, number[]>;
  last_updated: number;
}

export interface SearchIndex {
  version: number;
  created_at: number;
  updated_at: number;
  token_map: Map<string, InvertedIndexEntry>;
  message_tokens: Map<string, Set<string>>;
  message_metadata: Map<string, MessageMetadata>;
  bloom_filters: Map<string, BloomFilter>;
  total_documents: number;
  total_tokens: number;
}

export interface MessageMetadata {
  message_id: string;
  indexed_at: number;
  field_lengths: Record<SearchField, number>;
  has_attachments: boolean;
  timestamp: string;
  folder: string;
}

export interface CompressedIndex {
  version: number;
  created_at: number;
  updated_at: number;
  data: Uint8Array;
  checksum: string;
  compressed: boolean;
  total_documents: number;
}

export interface EncryptedIndex {
  nonce: Uint8Array;
  ciphertext: Uint8Array;
  version: number;
  checksum: string;
}

export interface SearchResult {
  message_id: string;
  score: number;
  matched_fields: SearchField[];
  positions: number[];
}

export interface ParsedQuery {
  terms: string[];
  required: string[];
  excluded: string[];
  phrases: string[][];
  field_specific: Map<SearchField, string[]>;
}

let cached_search_key: CryptoKey | null = null;
let cached_index_key: CryptoKey | null = null;
let cached_key_fingerprint: string | null = null;

function array_to_hex(arr: Uint8Array): string {
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function array_to_base64(arr: Uint8Array): string {
  let binary = "";

  arr.forEach((b) => (binary += String.fromCharCode(b)));

  return btoa(binary);
}

function base64_to_array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

async function fingerprint_key(key_bytes: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", key_bytes);

  return array_to_hex(new Uint8Array(hash).slice(0, 8));
}

async function derive_search_key(): Promise<CryptoKey> {
  const encryption_key = get_derived_encryption_key();

  if (!encryption_key) {
    throw new Error("No encryption key available. Please log in.");
  }

  const current_fingerprint = await fingerprint_key(encryption_key);

  if (cached_search_key && cached_key_fingerprint === current_fingerprint) {
    zero_uint8_array(encryption_key);

    return cached_search_key;
  }

  const key_material = await crypto.subtle.importKey(
    "raw",
    encryption_key,
    "HKDF",
    false,
    ["deriveKey"],
  );

  zero_uint8_array(encryption_key);

  const search_key = await crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: TOKEN_SALT,
      info: new TextEncoder().encode(SEARCH_KEY_INFO),
    },
    key_material,
    { name: "HMAC", hash: "SHA-256", length: 256 },
    false,
    ["sign"],
  );

  cached_search_key = search_key;
  cached_key_fingerprint = current_fingerprint;

  return search_key;
}

async function derive_index_encryption_key(): Promise<CryptoKey> {
  const encryption_key = get_derived_encryption_key();

  if (!encryption_key) {
    throw new Error("No encryption key available. Please log in.");
  }

  const current_fingerprint = await fingerprint_key(encryption_key);

  if (cached_index_key && cached_key_fingerprint === current_fingerprint) {
    zero_uint8_array(encryption_key);

    return cached_index_key;
  }

  const key_material = await crypto.subtle.importKey(
    "raw",
    encryption_key,
    "HKDF",
    false,
    ["deriveKey"],
  );

  zero_uint8_array(encryption_key);

  const index_key = await crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: INDEX_SALT,
      info: new TextEncoder().encode(INDEX_KEY_INFO),
    },
    key_material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );

  cached_index_key = index_key;

  return index_key;
}

export function clear_search_key_cache(): void {
  cached_search_key = null;
  cached_index_key = null;
  cached_key_fingerprint = null;
}

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "has",
  "he",
  "in",
  "is",
  "it",
  "its",
  "of",
  "on",
  "or",
  "that",
  "the",
  "to",
  "was",
  "were",
  "will",
  "with",
  "you",
  "your",
]);

const STEMMING_RULES: [RegExp, string][] = [
  [/ing$/, ""],
  [/tion$/, "t"],
  [/sion$/, "s"],
  [/ness$/, ""],
  [/ment$/, ""],
  [/able$/, ""],
  [/ible$/, ""],
  [/ful$/, ""],
  [/less$/, ""],
  [/ous$/, ""],
  [/ive$/, ""],
  [/ies$/, "y"],
  [/es$/, ""],
  [/s$/, ""],
  [/ed$/, ""],
  [/er$/, ""],
  [/est$/, ""],
  [/ly$/, ""],
];

function stem_word(word: string): string {
  if (word.length < 4) return word;

  let result = word;

  for (const [pattern, replacement] of STEMMING_RULES) {
    if (
      pattern.test(result) &&
      result.replace(pattern, replacement).length >= 3
    ) {
      result = result.replace(pattern, replacement);
      break;
    }
  }

  return result;
}

function normalize_text(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s@.-]/g, " ")
    .trim();
}

function tokenize(text: string, apply_stemming: boolean = true): string[] {
  const normalized = normalize_text(text);
  const words = normalized.split(/\s+/).filter((w) => w.length >= 2);

  const tokens = new Set<string>();

  for (const word of words) {
    if (STOP_WORDS.has(word) && word.length < 4) continue;

    tokens.add(word);

    if (apply_stemming && word.length >= 4) {
      const stemmed = stem_word(word);

      if (stemmed !== word) {
        tokens.add(stemmed);
      }
    }

    if (word.length >= 3) {
      for (let len = 3; len <= Math.min(word.length - 1, 6); len++) {
        tokens.add(word.substring(0, len));
      }
    }
  }

  return Array.from(tokens);
}

function tokenize_with_positions(text: string): Map<string, number[]> {
  const normalized = normalize_text(text);
  const words = normalized.split(/\s+/);
  const positions = new Map<string, number[]>();

  for (let i = 0; i < words.length; i++) {
    const word = words[i];

    if (word.length < 2) continue;
    if (STOP_WORDS.has(word) && word.length < 4) continue;

    const existing = positions.get(word) || [];

    existing.push(i);
    positions.set(word, existing);

    if (word.length >= 4) {
      const stemmed = stem_word(word);

      if (stemmed !== word) {
        const stemmed_positions = positions.get(stemmed) || [];

        stemmed_positions.push(i);
        positions.set(stemmed, stemmed_positions);
      }
    }
  }

  return positions;
}

export function parse_query(query: string): ParsedQuery {
  const result: ParsedQuery = {
    terms: [],
    required: [],
    excluded: [],
    phrases: [],
    field_specific: new Map(),
  };

  const phrase_regex = /"([^"]+)"/g;
  let match;

  while ((match = phrase_regex.exec(query)) !== null) {
    const phrase_words = tokenize(match[1], false);

    if (phrase_words.length > 1) {
      result.phrases.push(phrase_words);
    } else if (phrase_words.length === 1) {
      result.required.push(phrase_words[0]);
    }
  }

  const without_phrases = query.replace(phrase_regex, " ");
  const field_regex = /(\w+):(\S+)/g;

  while ((match = field_regex.exec(without_phrases)) !== null) {
    const field = match[1].toLowerCase() as SearchField;
    const term = match[2];

    if (["subject", "body", "sender", "recipient", "all"].includes(field)) {
      const existing = result.field_specific.get(field) || [];

      existing.push(...tokenize(term));
      result.field_specific.set(field, existing);
    }
  }

  const without_fields = without_phrases.replace(field_regex, " ");
  const tokens = without_fields.split(/\s+/).filter((t) => t.length > 0);

  for (const token of tokens) {
    if (token.startsWith("+")) {
      result.required.push(...tokenize(token.slice(1)));
    } else if (token.startsWith("-")) {
      result.excluded.push(...tokenize(token.slice(1)));
    } else {
      result.terms.push(...tokenize(token));
    }
  }

  return result;
}

export async function generate_search_token(
  term: string,
  field: SearchField,
  search_key?: CryptoKey,
): Promise<SearchToken> {
  const key = search_key || (await derive_search_key());
  const normalized = normalize_text(term);
  const data = new TextEncoder().encode(`${field}:${normalized}`);

  const signature = await crypto.subtle.sign("HMAC", key, data);
  const token = array_to_base64(new Uint8Array(signature));

  return { token, field };
}

export async function generate_search_tokens(
  query: string,
  fields: SearchField[] = ["all"],
  search_key?: CryptoKey,
): Promise<SearchToken[]> {
  const key = search_key || (await derive_search_key());
  const terms = tokenize(query);
  const tokens: SearchToken[] = [];

  for (const term of terms) {
    for (const field of fields) {
      const token = await generate_search_token(term, field, key);

      tokens.push(token);
    }
  }

  return tokens;
}

function bloom_hash(data: Uint8Array, seed: number): number {
  let hash = seed;

  for (let i = 0; i < data.length; i++) {
    hash = ((hash << 5) - hash + data[i]) | 0;
  }

  return Math.abs(hash) % (BLOOM_SIZE * 8);
}

function set_bloom_bit(bits: Uint8Array, position: number): void {
  const byte_index = Math.floor(position / 8);
  const bit_index = position % 8;

  bits[byte_index] |= 1 << bit_index;
}

function check_bloom_bit(bits: Uint8Array, position: number): boolean {
  const byte_index = Math.floor(position / 8);
  const bit_index = position % 8;

  return (bits[byte_index] & (1 << bit_index)) !== 0;
}

export function create_bloom_filter(): BloomFilter {
  return {
    bits: new Uint8Array(BLOOM_SIZE),
    hash_count: BLOOM_HASH_COUNT,
  };
}

export async function add_to_bloom_filter(
  filter: BloomFilter,
  token: string,
): Promise<void> {
  const data = new TextEncoder().encode(token);
  const base_hash = await crypto.subtle.digest("SHA-256", data);
  const hash_bytes = new Uint8Array(base_hash);

  for (let i = 0; i < filter.hash_count; i++) {
    const position = bloom_hash(hash_bytes, i);

    set_bloom_bit(filter.bits, position);
  }
}

export async function check_bloom_filter(
  filter: BloomFilter,
  token: string,
): Promise<boolean> {
  const data = new TextEncoder().encode(token);
  const base_hash = await crypto.subtle.digest("SHA-256", data);
  const hash_bytes = new Uint8Array(base_hash);

  for (let i = 0; i < filter.hash_count; i++) {
    const position = bloom_hash(hash_bytes, i);

    if (!check_bloom_bit(filter.bits, position)) {
      return false;
    }
  }

  return true;
}

export function merge_bloom_filters(filters: BloomFilter[]): BloomFilter {
  const merged = create_bloom_filter();

  for (const filter of filters) {
    for (let i = 0; i < BLOOM_SIZE; i++) {
      merged.bits[i] |= filter.bits[i];
    }
  }

  return merged;
}

export function serialize_bloom_filter(filter: BloomFilter): string {
  return array_to_base64(filter.bits);
}

export function deserialize_bloom_filter(serialized: string): BloomFilter {
  return {
    bits: base64_to_array(serialized),
    hash_count: BLOOM_HASH_COUNT,
  };
}

export function create_empty_index(): SearchIndex {
  return {
    version: INDEX_VERSION,
    created_at: Date.now(),
    updated_at: Date.now(),
    token_map: new Map(),
    message_tokens: new Map(),
    message_metadata: new Map(),
    bloom_filters: new Map(),
    total_documents: 0,
    total_tokens: 0,
  };
}

export async function index_message_fields(
  message_id: string,
  fields: SearchableFields,
): Promise<IndexedMessage> {
  const search_key = await derive_search_key();
  const tokens: SearchToken[] = [];
  const bloom = create_bloom_filter();

  if (fields.subject) {
    const subject_terms = tokenize(fields.subject);

    for (const term of subject_terms) {
      const token = await generate_search_token(term, "subject", search_key);

      tokens.push(token);
      await add_to_bloom_filter(bloom, token.token);

      const all_token = await generate_search_token(term, "all", search_key);

      tokens.push(all_token);
      await add_to_bloom_filter(bloom, all_token.token);
    }
  }

  if (fields.body) {
    const body_terms = tokenize(fields.body);

    for (const term of body_terms) {
      const token = await generate_search_token(term, "body", search_key);

      tokens.push(token);
      await add_to_bloom_filter(bloom, token.token);

      const all_token = await generate_search_token(term, "all", search_key);

      tokens.push(all_token);
      await add_to_bloom_filter(bloom, all_token.token);
    }
  }

  if (fields.sender_email) {
    const sender_terms = tokenize(fields.sender_email);

    for (const term of sender_terms) {
      const token = await generate_search_token(term, "sender", search_key);

      tokens.push(token);
      await add_to_bloom_filter(bloom, token.token);

      const all_token = await generate_search_token(term, "all", search_key);

      tokens.push(all_token);
      await add_to_bloom_filter(bloom, all_token.token);
    }
  }

  if (fields.sender_name) {
    const name_terms = tokenize(fields.sender_name);

    for (const term of name_terms) {
      const token = await generate_search_token(term, "sender", search_key);

      tokens.push(token);
      await add_to_bloom_filter(bloom, token.token);

      const all_token = await generate_search_token(term, "all", search_key);

      tokens.push(all_token);
      await add_to_bloom_filter(bloom, all_token.token);
    }
  }

  if (fields.recipient_emails) {
    for (const email of fields.recipient_emails) {
      const recipient_terms = tokenize(email);

      for (const term of recipient_terms) {
        const token = await generate_search_token(
          term,
          "recipient",
          search_key,
        );

        tokens.push(token);
        await add_to_bloom_filter(bloom, token.token);

        const all_token = await generate_search_token(term, "all", search_key);

        tokens.push(all_token);
        await add_to_bloom_filter(bloom, all_token.token);
      }
    }
  }

  if (fields.recipient_names) {
    for (const name of fields.recipient_names) {
      const name_terms = tokenize(name);

      for (const term of name_terms) {
        const token = await generate_search_token(
          term,
          "recipient",
          search_key,
        );

        tokens.push(token);
        await add_to_bloom_filter(bloom, token.token);

        const all_token = await generate_search_token(term, "all", search_key);

        tokens.push(all_token);
        await add_to_bloom_filter(bloom, all_token.token);
      }
    }
  }

  const unique_tokens = tokens.filter(
    (token, index, self) =>
      index ===
      self.findIndex((t) => t.token === token.token && t.field === token.field),
  );

  return {
    message_id,
    tokens: unique_tokens,
    bloom_filter: bloom,
  };
}

export async function filter_results_by_bloom(
  results: string[],
  bloom_filters: Map<string, BloomFilter>,
  search_tokens: SearchToken[],
): Promise<string[]> {
  const filtered: string[] = [];

  for (const message_id of results) {
    const bloom = bloom_filters.get(message_id);

    if (!bloom) {
      filtered.push(message_id);
      continue;
    }

    let matches = true;

    for (const search_token of search_tokens) {
      const in_bloom = await check_bloom_filter(bloom, search_token.token);

      if (!in_bloom) {
        matches = false;
        break;
      }
    }

    if (matches) {
      filtered.push(message_id);
    }
  }

  return filtered;
}

export interface EncryptedSearchCache {
  get(key: string): string[] | null;
  set(key: string, value: string[]): void;
  clear(): void;
}

export function create_search_cache(
  max_size: number = 100,
): EncryptedSearchCache {
  const cache = new Map<string, { value: string[]; timestamp: number }>();

  function evict_oldest(): void {
    if (cache.size <= max_size) return;

    let oldest_key: string | null = null;
    let oldest_time = Infinity;

    for (const [key, entry] of cache.entries()) {
      if (entry.timestamp < oldest_time) {
        oldest_time = entry.timestamp;
        oldest_key = key;
      }
    }

    if (oldest_key) {
      cache.delete(oldest_key);
    }
  }

  return {
    get(key: string): string[] | null {
      const entry = cache.get(key);

      if (!entry) return null;
      entry.timestamp = Date.now();

      return entry.value;
    },

    set(key: string, value: string[]): void {
      cache.set(key, { value, timestamp: Date.now() });
      evict_oldest();
    },

    clear(): void {
      cache.clear();
    },
  };
}

export async function generate_cache_key(
  tokens: SearchToken[],
  filters?: SearchFilters,
): Promise<string> {
  const data = JSON.stringify({
    tokens: tokens.map((t) => t.token).sort(),
    filters,
  });

  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(data),
  );

  return array_to_hex(new Uint8Array(hash).slice(0, 16));
}

export async function validate_search_key(): Promise<boolean> {
  try {
    await derive_search_key();

    return true;
  } catch {
    return false;
  }
}

async function compute_checksum(data: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", data);

  return array_to_hex(new Uint8Array(hash));
}

function compress_data(data: Uint8Array): Uint8Array {
  if (data.length < COMPRESSION_THRESHOLD) {
    const result = new Uint8Array(data.length + 1);

    result[0] = 0;
    result.set(data, 1);

    return result;
  }

  const output: number[] = [1];
  let i = 0;

  while (i < data.length) {
    let best_length = 0;
    let best_offset = 0;

    const search_start = Math.max(0, i - 255);

    for (let j = search_start; j < i; j++) {
      let length = 0;

      while (
        i + length < data.length &&
        length < 255 &&
        data[j + length] === data[i + length]
      ) {
        length++;
      }

      if (length >= 3 && length > best_length) {
        best_length = length;
        best_offset = i - j;
      }
    }

    if (best_length >= 3) {
      output.push(0xff);
      output.push(best_offset);
      output.push(best_length);
      i += best_length;
    } else {
      if (data[i] === 0xff) {
        output.push(0xff);
        output.push(0);
        output.push(1);
      } else {
        output.push(data[i]);
      }
      i++;
    }
  }

  const compressed = new Uint8Array(output);

  if (compressed.length >= data.length) {
    const result = new Uint8Array(data.length + 1);

    result[0] = 0;
    result.set(data, 1);

    return result;
  }

  return compressed;
}

function decompress_data(compressed: Uint8Array): Uint8Array {
  if (compressed[0] === 0) {
    return compressed.slice(1);
  }

  const output: number[] = [];
  let i = 1;

  while (i < compressed.length) {
    if (compressed[i] === 0xff) {
      const offset = compressed[i + 1];
      const length = compressed[i + 2];

      if (offset === 0 && length === 1) {
        output.push(0xff);
      } else {
        const start = output.length - offset;

        for (let j = 0; j < length; j++) {
          output.push(output[start + j]);
        }
      }
      i += 3;
    } else {
      output.push(compressed[i]);
      i++;
    }
  }

  return new Uint8Array(output);
}

function serialize_index(index: SearchIndex): Uint8Array {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];

  const header = {
    version: index.version,
    created_at: index.created_at,
    updated_at: index.updated_at,
    total_documents: index.total_documents,
    total_tokens: index.total_tokens,
    token_count: index.token_map.size,
    message_count: index.message_tokens.size,
  };

  const header_bytes = encoder.encode(JSON.stringify(header) + "\n");

  chunks.push(header_bytes);

  for (const [token, entry] of index.token_map) {
    const entry_data = {
      t: token,
      m: entry.message_ids,
      p: Object.fromEntries(entry.positions),
      u: entry.last_updated,
    };

    chunks.push(encoder.encode(JSON.stringify(entry_data) + "\n"));
  }

  chunks.push(encoder.encode("---TOKENS---\n"));

  for (const [message_id, tokens] of index.message_tokens) {
    const token_data = { i: message_id, t: Array.from(tokens) };

    chunks.push(encoder.encode(JSON.stringify(token_data) + "\n"));
  }

  chunks.push(encoder.encode("---META---\n"));

  for (const [message_id, metadata] of index.message_metadata) {
    const meta_data = { i: message_id, ...metadata };

    chunks.push(encoder.encode(JSON.stringify(meta_data) + "\n"));
  }

  chunks.push(encoder.encode("---BLOOM---\n"));

  for (const [message_id, bloom] of index.bloom_filters) {
    const bloom_data = { i: message_id, b: serialize_bloom_filter(bloom) };

    chunks.push(encoder.encode(JSON.stringify(bloom_data) + "\n"));
  }

  let total_length = 0;

  for (const chunk of chunks) {
    total_length += chunk.length;
  }

  const result = new Uint8Array(total_length);
  let offset = 0;

  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return result;
}

function deserialize_index(data: Uint8Array): SearchIndex {
  const decoder = new TextDecoder();
  const text = decoder.decode(data);
  const lines = text.split("\n").filter((l) => l.length > 0);

  const index = create_empty_index();

  if (lines.length === 0) return index;

  const header = JSON.parse(lines[0]);

  index.version = header.version;
  index.created_at = header.created_at;
  index.updated_at = header.updated_at;
  index.total_documents = header.total_documents;
  index.total_tokens = header.total_tokens;

  let section = "entries";
  let i = 1;

  while (i < lines.length) {
    const line = lines[i];

    if (line === "---TOKENS---") {
      section = "tokens";
      i++;
      continue;
    }
    if (line === "---META---") {
      section = "meta";
      i++;
      continue;
    }
    if (line === "---BLOOM---") {
      section = "bloom";
      i++;
      continue;
    }

    try {
      const parsed = JSON.parse(line);

      switch (section) {
        case "entries": {
          const entry: InvertedIndexEntry = {
            message_ids: parsed.m,
            positions: new Map(Object.entries(parsed.p || {})),
            last_updated: parsed.u,
          };

          index.token_map.set(parsed.t, entry);
          break;
        }
        case "tokens": {
          index.message_tokens.set(parsed.i, new Set(parsed.t));
          break;
        }
        case "meta": {
          const { i: id, ...rest } = parsed;

          index.message_metadata.set(id, rest as MessageMetadata);
          break;
        }
        case "bloom": {
          index.bloom_filters.set(parsed.i, deserialize_bloom_filter(parsed.b));
          break;
        }
      }
    } catch {
      i++;
      continue;
    }

    i++;
  }

  return index;
}

export class SearchCrypto {
  private index: SearchIndex;
  private search_key: CryptoKey | null = null;
  private index_key: CryptoKey | null = null;
  private is_dirty: boolean = false;

  constructor() {
    this.index = create_empty_index();
  }

  async initialize(): Promise<void> {
    this.search_key = await derive_search_key();
    this.index_key = await derive_index_encryption_key();
  }

  async generate_search_key(_master_key?: Uint8Array): Promise<CryptoKey> {
    this.search_key = await derive_search_key();

    return this.search_key;
  }

  async build_index(
    emails: Array<{
      id: string;
      subject?: string;
      body?: string;
      sender_email?: string;
      sender_name?: string;
      recipient_emails?: string[];
      recipient_names?: string[];
      timestamp?: string;
      folder?: string;
      has_attachments?: boolean;
    }>,
  ): Promise<SearchIndex> {
    if (!this.search_key) {
      await this.initialize();
    }

    this.index = create_empty_index();

    for (const email of emails) {
      await this.add_to_index_internal(email);
    }

    this.is_dirty = true;

    return this.index;
  }

  private async add_to_index_internal(email: {
    id: string;
    subject?: string;
    body?: string;
    sender_email?: string;
    sender_name?: string;
    recipient_emails?: string[];
    recipient_names?: string[];
    timestamp?: string;
    folder?: string;
    has_attachments?: boolean;
  }): Promise<void> {
    const indexed = await index_message_fields(email.id, {
      subject: email.subject,
      body: email.body,
      sender_email: email.sender_email,
      sender_name: email.sender_name,
      recipient_emails: email.recipient_emails,
      recipient_names: email.recipient_names,
    });

    const token_set = new Set<string>();

    for (const token of indexed.tokens) {
      token_set.add(token.token);

      const existing = this.index.token_map.get(token.token);

      if (existing) {
        if (!existing.message_ids.includes(email.id)) {
          existing.message_ids.push(email.id);
          existing.last_updated = Date.now();
        }
      } else {
        this.index.token_map.set(token.token, {
          message_ids: [email.id],
          positions: new Map(),
          last_updated: Date.now(),
        });
        this.index.total_tokens++;
      }
    }

    this.index.message_tokens.set(email.id, token_set);
    this.index.bloom_filters.set(email.id, indexed.bloom_filter);

    const field_lengths: Record<SearchField, number> = {
      subject: email.subject?.length || 0,
      body: email.body?.length || 0,
      sender:
        (email.sender_email?.length || 0) + (email.sender_name?.length || 0),
      recipient:
        (email.recipient_emails?.join(" ").length || 0) +
        (email.recipient_names?.join(" ").length || 0),
      all: 0,
    };

    field_lengths.all =
      field_lengths.subject +
      field_lengths.body +
      field_lengths.sender +
      field_lengths.recipient;

    this.index.message_metadata.set(email.id, {
      message_id: email.id,
      indexed_at: Date.now(),
      field_lengths,
      has_attachments: email.has_attachments || false,
      timestamp: email.timestamp || new Date().toISOString(),
      folder: email.folder || "inbox",
    });

    this.index.total_documents++;
    this.index.updated_at = Date.now();
  }

  async encrypt_index(
    index?: SearchIndex,
    _key?: CryptoKey,
  ): Promise<EncryptedIndex> {
    if (!this.index_key) {
      await this.initialize();
    }

    const target_index = index || this.index;
    const serialized = serialize_index(target_index);
    const compressed = compress_data(serialized);

    const nonce = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonce },
      this.index_key!,
      compressed,
    );

    const checksum = await compute_checksum(new Uint8Array(ciphertext));

    return {
      nonce,
      ciphertext: new Uint8Array(ciphertext),
      version: INDEX_VERSION,
      checksum,
    };
  }

  async decrypt_index(
    encrypted: EncryptedIndex,
    _key?: CryptoKey,
  ): Promise<SearchIndex> {
    if (!this.index_key) {
      await this.initialize();
    }

    const checksum = await compute_checksum(encrypted.ciphertext);

    if (checksum !== encrypted.checksum) {
      throw new Error("Index checksum mismatch - data may be corrupted");
    }

    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: encrypted.nonce },
      this.index_key!,
      encrypted.ciphertext,
    );

    const decompressed = decompress_data(new Uint8Array(decrypted));

    this.index = deserialize_index(decompressed);
    this.is_dirty = false;

    return this.index;
  }

  async search(
    query: string,
    options: {
      fields?: SearchField[];
      filters?: SearchFilters;
      limit?: number;
      offset?: number;
    } = {},
  ): Promise<SearchResult[]> {
    const { fields = ["all"], filters, limit = 50, offset = 0 } = options;

    if (!query.trim()) return [];

    if (!this.search_key) {
      await this.initialize();
    }

    const parsed = parse_query(query);
    const results = new Map<string, SearchResult>();

    const all_terms = [
      ...parsed.terms,
      ...parsed.required,
      ...parsed.phrases.flat(),
    ];

    for (const field of fields) {
      const field_terms = parsed.field_specific.get(field) || [];
      const terms_to_search = [...all_terms, ...field_terms];

      for (const term of terms_to_search) {
        const token = await generate_search_token(
          term,
          field,
          this.search_key!,
        );
        const entry = this.index.token_map.get(token.token);

        if (!entry) continue;

        for (const message_id of entry.message_ids) {
          const existing = results.get(message_id);

          if (existing) {
            existing.score += 1;
            if (!existing.matched_fields.includes(field)) {
              existing.matched_fields.push(field);
            }
          } else {
            results.set(message_id, {
              message_id,
              score: 1,
              matched_fields: [field],
              positions: [],
            });
          }
        }
      }
    }

    if (parsed.required.length > 0) {
      for (const [message_id, result] of results) {
        let has_all = true;

        for (const required_term of parsed.required) {
          let found = false;

          for (const field of fields) {
            const token = await generate_search_token(
              required_term,
              field,
              this.search_key!,
            );
            const entry = this.index.token_map.get(token.token);

            if (entry?.message_ids.includes(message_id)) {
              found = true;
              break;
            }
          }

          if (!found) {
            has_all = false;
            break;
          }
        }

        if (!has_all) {
          results.delete(message_id);
        } else {
          result.score += parsed.required.length * 2;
        }
      }
    }

    if (parsed.excluded.length > 0) {
      for (const [message_id] of results) {
        for (const excluded_term of parsed.excluded) {
          for (const field of fields) {
            const token = await generate_search_token(
              excluded_term,
              field,
              this.search_key!,
            );
            const entry = this.index.token_map.get(token.token);

            if (entry?.message_ids.includes(message_id)) {
              results.delete(message_id);
              break;
            }
          }
        }
      }
    }

    if (filters) {
      for (const [message_id] of results) {
        const metadata = this.index.message_metadata.get(message_id);

        if (!metadata) continue;

        if (filters.date_from) {
          if (metadata.timestamp < filters.date_from) {
            results.delete(message_id);
            continue;
          }
        }

        if (filters.date_to) {
          if (metadata.timestamp > filters.date_to) {
            results.delete(message_id);
            continue;
          }
        }

        if (
          filters.has_attachments !== undefined &&
          metadata.has_attachments !== filters.has_attachments
        ) {
          results.delete(message_id);
          continue;
        }

        if (filters.folder && metadata.folder !== filters.folder) {
          results.delete(message_id);
          continue;
        }
      }
    }

    for (const [message_id, result] of results) {
      const metadata = this.index.message_metadata.get(message_id);

      if (metadata) {
        const total_length = metadata.field_lengths.all;

        if (total_length > 0) {
          result.score *= 1 + 1000 / total_length;
        }
      }

      for (const field of result.matched_fields) {
        if (field === "subject") {
          result.score *= 2;
        } else if (field === "sender" || field === "recipient") {
          result.score *= 1.5;
        }
      }
    }

    const sorted = Array.from(results.values()).sort(
      (a, b) => b.score - a.score,
    );

    return sorted.slice(offset, offset + limit);
  }

  async update_index(
    new_emails: Array<{
      id: string;
      subject?: string;
      body?: string;
      sender_email?: string;
      sender_name?: string;
      recipient_emails?: string[];
      recipient_names?: string[];
      timestamp?: string;
      folder?: string;
      has_attachments?: boolean;
    }>,
    deleted_ids: string[] = [],
  ): Promise<void> {
    if (!this.search_key) {
      await this.initialize();
    }

    for (const id of deleted_ids) {
      const existing_tokens = this.index.message_tokens.get(id);

      if (existing_tokens) {
        for (const token of existing_tokens) {
          const entry = this.index.token_map.get(token);

          if (entry) {
            entry.message_ids = entry.message_ids.filter((m) => m !== id);
            entry.positions.delete(id);

            if (entry.message_ids.length === 0) {
              this.index.token_map.delete(token);
              this.index.total_tokens--;
            }
          }
        }

        this.index.message_tokens.delete(id);
        this.index.bloom_filters.delete(id);
        this.index.message_metadata.delete(id);
        this.index.total_documents--;
      }
    }

    for (const email of new_emails) {
      const existing_tokens = this.index.message_tokens.get(email.id);

      if (existing_tokens) {
        for (const token of existing_tokens) {
          const entry = this.index.token_map.get(token);

          if (entry) {
            entry.message_ids = entry.message_ids.filter((m) => m !== email.id);
            entry.positions.delete(email.id);

            if (entry.message_ids.length === 0) {
              this.index.token_map.delete(token);
              this.index.total_tokens--;
            }
          }
        }

        this.index.message_tokens.delete(email.id);
        this.index.bloom_filters.delete(email.id);
        this.index.message_metadata.delete(email.id);
        this.index.total_documents--;
      }

      await this.add_to_index_internal(email);
    }

    this.index.updated_at = Date.now();
    this.is_dirty = true;
  }

  get_index(): SearchIndex {
    return this.index;
  }

  is_index_dirty(): boolean {
    return this.is_dirty;
  }

  mark_index_clean(): void {
    this.is_dirty = false;
  }

  get_index_stats(): {
    total_documents: number;
    total_tokens: number;
    created_at: number;
    updated_at: number;
    version: number;
  } {
    return {
      total_documents: this.index.total_documents,
      total_tokens: this.index.total_tokens,
      created_at: this.index.created_at,
      updated_at: this.index.updated_at,
      version: this.index.version,
    };
  }

  clear(): void {
    this.index = create_empty_index();
    this.is_dirty = false;
  }
}

let search_crypto_instance: SearchCrypto | null = null;

export function get_search_crypto(): SearchCrypto {
  if (!search_crypto_instance) {
    search_crypto_instance = new SearchCrypto();
  }

  return search_crypto_instance;
}

export function reset_search_crypto(): void {
  if (search_crypto_instance) {
    search_crypto_instance.clear();
  }
  search_crypto_instance = null;
  clear_search_key_cache();
}

const COUNT_KEY_INFO = "aster-search-count-key-v1";
const COUNT_SALT = new Uint8Array([
  0x41, 0x73, 0x74, 0x65, 0x72, 0x43, 0x6f, 0x75, 0x6e, 0x74, 0x45, 0x6e, 0x63,
  0x72, 0x79, 0x70,
]);

let cached_count_key: CryptoKey | null = null;

async function derive_count_encryption_key(): Promise<CryptoKey> {
  const encryption_key = get_derived_encryption_key();

  if (!encryption_key) {
    throw new Error("No encryption key available. Please log in.");
  }

  const current_fingerprint = await fingerprint_key(encryption_key);

  if (cached_count_key && cached_key_fingerprint === current_fingerprint) {
    zero_uint8_array(encryption_key);

    return cached_count_key;
  }

  const key_material = await crypto.subtle.importKey(
    "raw",
    encryption_key,
    "HKDF",
    false,
    ["deriveKey"],
  );

  zero_uint8_array(encryption_key);

  const count_key = await crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: COUNT_SALT,
      info: new TextEncoder().encode(COUNT_KEY_INFO),
    },
    key_material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );

  cached_count_key = count_key;

  return count_key;
}

export async function encrypt_search_count(
  count: number,
): Promise<{ encrypted_count: string; count_nonce: string }> {
  const count_key = await derive_count_encryption_key();
  const nonce = crypto.getRandomValues(new Uint8Array(12));

  const count_bytes = new Uint8Array(4);
  const view = new DataView(count_bytes.buffer);

  view.setInt32(0, count, false);

  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    count_key,
    count_bytes,
  );

  return {
    encrypted_count: array_to_base64(new Uint8Array(ciphertext)),
    count_nonce: array_to_base64(nonce),
  };
}

export async function decrypt_search_count(
  encrypted_count: string,
  count_nonce: string,
): Promise<number> {
  const count_key = await derive_count_encryption_key();
  const nonce = base64_to_array(count_nonce);
  const ciphertext = base64_to_array(encrypted_count);

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: nonce },
    count_key,
    ciphertext,
  );

  const view = new DataView(decrypted);

  return view.getInt32(0, false);
}

export function clear_count_key_cache(): void {
  cached_count_key = null;
}

export { derive_search_key, tokenize, tokenize_with_positions };
