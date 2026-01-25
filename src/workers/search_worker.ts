const SEARCH_KEY_INFO = "aster-search-key-v1";
const TOKEN_SALT = new Uint8Array([
  0x41, 0x73, 0x74, 0x65, 0x72, 0x53, 0x65, 0x61, 0x72, 0x63, 0x68, 0x54, 0x6f,
  0x6b, 0x65, 0x6e,
]);

const BLOOM_SIZE = 256;
const BLOOM_HASH_COUNT = 7;
const LRU_CACHE_SIZE = 500;
const TRIE_MAX_SUGGESTIONS = 20;
const FUZZY_MAX_DISTANCE = 2;

interface WorkerMessage {
  id: string;
  type: WorkerMessageType;
  payload: unknown;
}

interface WorkerResponse {
  id: string;
  type: WorkerMessageType;
  payload?: unknown;
  error?: string;
}

type WorkerMessageType =
  | "init_key"
  | "generate_tokens"
  | "index_message"
  | "bulk_index"
  | "search"
  | "autocomplete"
  | "fuzzy_search"
  | "check_bloom"
  | "clear_cache"
  | "update_index"
  | "remove_from_index"
  | "get_stats"
  | "load_index"
  | "export_index";

interface InitKeyPayload {
  encryption_key: ArrayBuffer;
}

interface GenerateTokensPayload {
  query: string;
  fields: SearchField[];
}

interface IndexMessagePayload {
  message_id: string;
  fields: SearchableFieldsPayload;
  timestamp?: number;
  metadata?: MessageMetadata;
}

interface BulkIndexPayload {
  messages: Array<{
    message_id: string;
    fields: SearchableFieldsPayload;
    timestamp?: number;
    metadata?: MessageMetadata;
  }>;
}

interface SearchPayload {
  query: string;
  fields: SearchField[];
  limit?: number;
  offset?: number;
  filters?: SearchFilters;
}

interface AutocompletePayload {
  prefix: string;
  field: SearchField;
  limit?: number;
}

interface FuzzySearchPayload {
  query: string;
  fields: SearchField[];
  max_distance?: number;
  limit?: number;
}

interface UpdateIndexPayload {
  message_id: string;
  fields: SearchableFieldsPayload;
  timestamp?: number;
  metadata?: MessageMetadata;
}

interface RemoveFromIndexPayload {
  message_ids: string[];
}

interface LoadIndexPayload {
  serialized_index: string;
}

interface SearchableFieldsPayload {
  subject?: string;
  body?: string;
  sender_email?: string;
  sender_name?: string;
  recipient_emails?: string[];
  recipient_names?: string[];
}

interface CheckBloomPayload {
  bloom_data: string;
  tokens: string[];
}

interface SearchToken {
  token: string;
  field: SearchField;
  term?: string;
}

interface MessageMetadata {
  is_starred?: boolean;
  is_read?: boolean;
  has_attachments?: boolean;
  folder?: string;
  labels?: string[];
  attachment_types?: string[];
  attachment_filenames?: string[];
  size_bytes?: number;
}

interface IndexedMessage {
  message_id: string;
  tokens: Map<string, Set<SearchField>>;
  bloom: Uint8Array;
  timestamp: number;
  metadata: MessageMetadata;
  term_frequencies: Map<string, number>;
}

interface SearchResult {
  message_id: string;
  score: number;
  matched_fields: SearchField[];
}

interface SearchFilters {
  date_from?: number;
  date_to?: number;
  has_attachments?: boolean;
  is_read?: boolean;
  is_starred?: boolean;
  folder?: string;
  attachment_type?: string;
  attachment_mimes?: string[];
  filename?: string;
  size_min?: number;
  size_max?: number;
}

type SearchField = "subject" | "body" | "sender" | "recipient" | "all";

interface TrieNode {
  children: Map<string, TrieNode>;
  is_end: boolean;
  message_ids: Set<string>;
  term: string;
}

interface LRUCacheEntry<T> {
  value: T;
  prev: string | null;
  next: string | null;
}

class LRUCache<T> {
  private cache: Map<string, LRUCacheEntry<T>> = new Map();
  private head: string | null = null;
  private tail: string | null = null;
  private max_size: number;

  constructor(max_size: number) {
    this.max_size = max_size;
  }

  get(key: string): T | undefined {
    const entry = this.cache.get(key);

    if (!entry) return undefined;

    this.move_to_front(key);

    return entry.value;
  }

  set(key: string, value: T): void {
    if (this.cache.has(key)) {
      const entry = this.cache.get(key)!;

      entry.value = value;
      this.move_to_front(key);

      return;
    }

    if (this.cache.size >= this.max_size) {
      this.evict_lru();
    }

    const entry: LRUCacheEntry<T> = {
      value,
      prev: null,
      next: this.head,
    };

    if (this.head) {
      this.cache.get(this.head)!.prev = key;
    }

    this.head = key;

    if (!this.tail) {
      this.tail = key;
    }

    this.cache.set(key, entry);
  }

  private move_to_front(key: string): void {
    if (this.head === key) return;

    const entry = this.cache.get(key)!;

    if (entry.prev) {
      this.cache.get(entry.prev)!.next = entry.next;
    }

    if (entry.next) {
      this.cache.get(entry.next)!.prev = entry.prev;
    }

    if (this.tail === key) {
      this.tail = entry.prev;
    }

    entry.prev = null;
    entry.next = this.head;

    if (this.head) {
      this.cache.get(this.head)!.prev = key;
    }

    this.head = key;
  }

  private evict_lru(): void {
    if (!this.tail) return;

    const old_tail = this.tail;
    const entry = this.cache.get(old_tail)!;

    if (entry.prev) {
      this.cache.get(entry.prev)!.next = null;
      this.tail = entry.prev;
    } else {
      this.head = null;
      this.tail = null;
    }

    this.cache.delete(old_tail);
  }

  clear(): void {
    this.cache.clear();
    this.head = null;
    this.tail = null;
  }

  size(): number {
    return this.cache.size;
  }
}

class Trie {
  private root: TrieNode = this.create_node("");
  private node_count = 0;

  private create_node(term: string): TrieNode {
    this.node_count++;

    return {
      children: new Map(),
      is_end: false,
      message_ids: new Set(),
      term,
    };
  }

  insert(word: string, message_id: string): void {
    let node = this.root;
    let current_term = "";

    for (const char of word) {
      current_term += char;

      if (!node.children.has(char)) {
        node.children.set(char, this.create_node(current_term));
      }

      node = node.children.get(char)!;
    }

    node.is_end = true;
    node.message_ids.add(message_id);
  }

  remove(word: string, message_id: string): void {
    const path: TrieNode[] = [];
    let node = this.root;

    for (const char of word) {
      if (!node.children.has(char)) return;

      path.push(node);
      node = node.children.get(char)!;
    }

    node.message_ids.delete(message_id);

    if (node.message_ids.size === 0 && node.children.size === 0) {
      node.is_end = false;
    }
  }

  search_prefix(
    prefix: string,
    limit: number = TRIE_MAX_SUGGESTIONS,
  ): string[] {
    let node = this.root;

    for (const char of prefix) {
      if (!node.children.has(char)) {
        return [];
      }

      node = node.children.get(char)!;
    }

    const results: string[] = [];

    this.collect_words(node, results, limit);

    return results;
  }

  private collect_words(
    node: TrieNode,
    results: string[],
    limit: number,
  ): void {
    if (results.length >= limit) return;

    if (node.is_end && node.term) {
      results.push(node.term);
    }

    for (const child of node.children.values()) {
      if (results.length >= limit) break;

      this.collect_words(child, results, limit);
    }
  }

  get_message_ids(word: string): Set<string> {
    let node = this.root;

    for (const char of word) {
      if (!node.children.has(char)) {
        return new Set();
      }

      node = node.children.get(char)!;
    }

    return node.is_end ? node.message_ids : new Set();
  }

  get_stats(): { node_count: number } {
    return { node_count: this.node_count };
  }
}

let search_key: CryptoKey | null = null;
const message_index: Map<string, IndexedMessage> = new Map();
const inverted_index: Map<string, Set<string>> = new Map();
const field_tries: Map<SearchField, Trie> = new Map();
const query_cache = new LRUCache<SearchResult[]>(LRU_CACHE_SIZE);
const token_cache = new LRUCache<string>(LRU_CACHE_SIZE);

function initialize_tries(): void {
  const fields: SearchField[] = [
    "subject",
    "body",
    "sender",
    "recipient",
    "all",
  ];

  for (const field of fields) {
    field_tries.set(field, new Trie());
  }
}

initialize_tries();

function array_to_base64(arr: Uint8Array): string {
  let binary = "";

  for (let i = 0; i < arr.length; i++) {
    binary += String.fromCharCode(arr[i]);
  }

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

async function derive_search_key_from_bytes(
  encryption_key: Uint8Array,
): Promise<CryptoKey> {
  const key_material = await crypto.subtle.importKey(
    "raw",
    encryption_key,
    "HKDF",
    false,
    ["deriveKey"],
  );

  return crypto.subtle.deriveKey(
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
}

function normalize_text(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s@.-]/g, " ")
    .trim();
}

function tokenize(text: string): string[] {
  const normalized = normalize_text(text);
  const words = normalized.split(/\s+/).filter((w) => w.length >= 2);

  const tokens = new Set<string>();

  for (const word of words) {
    tokens.add(word);

    if (word.length >= 3) {
      for (let len = 3; len <= Math.min(word.length, 8); len++) {
        tokens.add(word.substring(0, len));
      }
    }
  }

  return Array.from(tokens);
}

function tokenize_full(text: string): string[] {
  const normalized = normalize_text(text);

  return normalized.split(/\s+/).filter((w) => w.length >= 2);
}

async function generate_search_token(
  term: string,
  field: SearchField,
): Promise<SearchToken> {
  if (!search_key) {
    throw new Error("Search key not initialized");
  }

  const cache_key = `${field}:${term}`;
  const cached = token_cache.get(cache_key);

  if (cached) {
    return { token: cached, field, term };
  }

  const normalized = normalize_text(term);
  const data = new TextEncoder().encode(`${field}:${normalized}`);

  const signature = await crypto.subtle.sign("HMAC", search_key, data);
  const token = array_to_base64(new Uint8Array(signature));

  token_cache.set(cache_key, token);

  return { token, field, term };
}

async function generate_search_tokens(
  query: string,
  fields: SearchField[],
): Promise<SearchToken[]> {
  const terms = tokenize(query);
  const tokens: SearchToken[] = [];
  const promises: Promise<SearchToken>[] = [];

  for (const term of terms) {
    for (const field of fields) {
      promises.push(generate_search_token(term, field));
    }
  }

  const results = await Promise.all(promises);

  tokens.push(...results);

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

function create_bloom_filter(): Uint8Array {
  return new Uint8Array(BLOOM_SIZE);
}

async function add_to_bloom(bits: Uint8Array, token: string): Promise<void> {
  const data = new TextEncoder().encode(token);
  const base_hash = await crypto.subtle.digest("SHA-256", data);
  const hash_bytes = new Uint8Array(base_hash);

  for (let i = 0; i < BLOOM_HASH_COUNT; i++) {
    const position = bloom_hash(hash_bytes, i);

    set_bloom_bit(bits, position);
  }
}

async function check_bloom(bits: Uint8Array, token: string): Promise<boolean> {
  const data = new TextEncoder().encode(token);
  const base_hash = await crypto.subtle.digest("SHA-256", data);
  const hash_bytes = new Uint8Array(base_hash);

  for (let i = 0; i < BLOOM_HASH_COUNT; i++) {
    const position = bloom_hash(hash_bytes, i);

    if (!check_bloom_bit(bits, position)) {
      return false;
    }
  }

  return true;
}

function levenshtein_distance(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1,
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

function calculate_tf_idf(
  term: string,
  message: IndexedMessage,
  total_messages: number,
): number {
  const tf = message.term_frequencies.get(term) || 0;
  const df = inverted_index.get(term)?.size || 1;
  const idf = Math.log(total_messages / df);

  return tf * idf;
}

function calculate_relevance_score(
  message: IndexedMessage,
  query_terms: string[],
  matched_fields: SearchField[],
  total_messages: number,
): number {
  let score = 0;

  const field_weights: Record<SearchField, number> = {
    subject: 3.0,
    sender: 2.0,
    recipient: 1.5,
    body: 1.0,
    all: 1.0,
  };

  for (const term of query_terms) {
    const tf_idf = calculate_tf_idf(term, message, total_messages);

    score += tf_idf;
  }

  for (const field of matched_fields) {
    score *= field_weights[field] || 1.0;
  }

  const age_days = (Date.now() - message.timestamp) / (1000 * 60 * 60 * 24);
  const recency_boost = Math.max(0.5, 1 - age_days / 365);

  score *= recency_boost;

  return score;
}

function apply_filters(
  message: IndexedMessage,
  filters: SearchFilters,
): boolean {
  if (filters.date_from && message.timestamp < filters.date_from) {
    return false;
  }

  if (filters.date_to && message.timestamp > filters.date_to) {
    return false;
  }

  if (
    filters.has_attachments !== undefined &&
    message.metadata.has_attachments !== filters.has_attachments
  ) {
    return false;
  }

  if (
    filters.is_read !== undefined &&
    message.metadata.is_read !== filters.is_read
  ) {
    return false;
  }

  if (
    filters.is_starred !== undefined &&
    message.metadata.is_starred !== filters.is_starred
  ) {
    return false;
  }

  if (filters.folder && message.metadata.folder !== filters.folder) {
    return false;
  }

  if (filters.attachment_mimes && filters.attachment_mimes.length > 0) {
    const message_types = message.metadata.attachment_types || [];
    const has_matching_type = filters.attachment_mimes.some((mime) =>
      message_types.some(
        (t) =>
          t.toLowerCase() === mime.toLowerCase() ||
          t.startsWith(mime.split("/")[0]),
      ),
    );

    if (!has_matching_type) {
      return false;
    }
  }

  if (filters.filename) {
    const filenames = message.metadata.attachment_filenames || [];
    const search_term = filters.filename.toLowerCase();
    const has_matching_filename = filenames.some((name) =>
      name.toLowerCase().includes(search_term),
    );

    if (!has_matching_filename) {
      return false;
    }
  }

  if (
    filters.size_min !== undefined &&
    message.metadata.size_bytes !== undefined
  ) {
    if (message.metadata.size_bytes < filters.size_min) {
      return false;
    }
  }

  if (
    filters.size_max !== undefined &&
    message.metadata.size_bytes !== undefined
  ) {
    if (message.metadata.size_bytes > filters.size_max) {
      return false;
    }
  }

  return true;
}

async function index_message_internal(
  message_id: string,
  fields: SearchableFieldsPayload,
  timestamp: number = Date.now(),
  metadata: MessageMetadata = {},
): Promise<IndexedMessage> {
  const tokens = new Map<string, Set<SearchField>>();
  const bloom = create_bloom_filter();
  const term_frequencies = new Map<string, number>();

  async function add_field_tokens(
    text: string,
    field: SearchField,
  ): Promise<void> {
    const terms = tokenize_full(text);

    for (const term of terms) {
      const count = term_frequencies.get(term) || 0;

      term_frequencies.set(term, count + 1);
    }

    const unique_terms = tokenize(text);

    for (const term of unique_terms) {
      const token = await generate_search_token(term, field);

      if (!tokens.has(token.token)) {
        tokens.set(token.token, new Set());
      }

      tokens.get(token.token)!.add(field);

      await add_to_bloom(bloom, token.token);

      if (field !== "all") {
        const all_token = await generate_search_token(term, "all");

        if (!tokens.has(all_token.token)) {
          tokens.set(all_token.token, new Set());
        }

        tokens.get(all_token.token)!.add("all");
        await add_to_bloom(bloom, all_token.token);

        if (!inverted_index.has(all_token.token)) {
          inverted_index.set(all_token.token, new Set());
        }

        inverted_index.get(all_token.token)!.add(message_id);
      }

      const trie = field_tries.get(field);

      if (trie) {
        trie.insert(term, message_id);
      }

      const all_trie = field_tries.get("all");

      if (all_trie && field !== "all") {
        all_trie.insert(term, message_id);
      }

      if (!inverted_index.has(token.token)) {
        inverted_index.set(token.token, new Set());
      }

      inverted_index.get(token.token)!.add(message_id);
    }
  }

  if (fields.subject) {
    await add_field_tokens(fields.subject, "subject");
  }

  if (fields.body) {
    await add_field_tokens(fields.body, "body");
  }

  if (fields.sender_email) {
    await add_field_tokens(fields.sender_email, "sender");
  }

  if (fields.sender_name) {
    await add_field_tokens(fields.sender_name, "sender");
  }

  if (fields.recipient_emails) {
    for (const email of fields.recipient_emails) {
      await add_field_tokens(email, "recipient");
    }
  }

  if (fields.recipient_names) {
    for (const name of fields.recipient_names) {
      await add_field_tokens(name, "recipient");
    }
  }

  const indexed_message: IndexedMessage = {
    message_id,
    tokens,
    bloom,
    timestamp,
    metadata,
    term_frequencies,
  };

  message_index.set(message_id, indexed_message);

  return indexed_message;
}

async function search_internal(
  query: string,
  fields: SearchField[],
  limit: number = 50,
  offset: number = 0,
  filters?: SearchFilters,
): Promise<{ results: SearchResult[]; total: number }> {
  const cache_key = `${query}:${fields.join(",")}:${JSON.stringify(filters)}`;
  const cached = query_cache.get(cache_key);

  if (cached) {
    const paginated = cached.slice(offset, offset + limit);

    return { results: paginated, total: cached.length };
  }

  const tokens = await generate_search_tokens(query, fields);

  if (tokens.length === 0) {
    return { results: [], total: 0 };
  }

  const tokens_by_term = new Map<string, SearchToken[]>();

  for (const token of tokens) {
    const term_key = token.term || token.token;
    const existing = tokens_by_term.get(term_key) || [];

    existing.push(token);
    tokens_by_term.set(term_key, existing);
  }

  let candidate_ids: Set<string> | null = null;

  for (const [, term_tokens] of tokens_by_term) {
    const term_matches = new Set<string>();

    for (const token of term_tokens) {
      const message_ids = inverted_index.get(token.token);

      if (message_ids) {
        for (const id of message_ids) {
          term_matches.add(id);
        }
      }
    }

    if (term_matches.size === 0) {
      candidate_ids = new Set();
      break;
    }

    if (candidate_ids === null) {
      candidate_ids = term_matches;
    } else {
      for (const id of candidate_ids) {
        if (!term_matches.has(id)) {
          candidate_ids.delete(id);
        }
      }
    }

    if (candidate_ids.size === 0) {
      break;
    }
  }

  if (!candidate_ids || candidate_ids.size === 0) {
    return { results: [], total: 0 };
  }

  const query_terms = tokenize_full(query);
  const results: SearchResult[] = [];
  const total_messages = message_index.size;

  for (const message_id of candidate_ids) {
    const message = message_index.get(message_id);

    if (!message) continue;

    if (filters && !apply_filters(message, filters)) {
      continue;
    }

    let bloom_match = true;

    for (const token of tokens) {
      if (!(await check_bloom(message.bloom, token.token))) {
        bloom_match = false;
        break;
      }
    }

    if (!bloom_match) continue;

    const matched_fields = new Set<SearchField>();

    for (const token of tokens) {
      const fields_for_token = message.tokens.get(token.token);

      if (fields_for_token) {
        for (const field of fields_for_token) {
          matched_fields.add(field);
        }
      }
    }

    const score = calculate_relevance_score(
      message,
      query_terms,
      Array.from(matched_fields),
      total_messages,
    );

    results.push({
      message_id,
      score,
      matched_fields: Array.from(matched_fields),
    });
  }

  results.sort((a, b) => b.score - a.score);

  query_cache.set(cache_key, results);

  const paginated = results.slice(offset, offset + limit);

  return { results: paginated, total: results.length };
}

async function autocomplete_internal(
  prefix: string,
  field: SearchField,
  limit: number = TRIE_MAX_SUGGESTIONS,
): Promise<string[]> {
  const normalized = normalize_text(prefix);
  const trie = field_tries.get(field);

  if (!trie) {
    return [];
  }

  return trie.search_prefix(normalized, limit);
}

async function fuzzy_search_internal(
  query: string,
  fields: SearchField[],
  max_distance: number = FUZZY_MAX_DISTANCE,
  limit: number = 50,
): Promise<SearchResult[]> {
  const query_terms = tokenize_full(query);
  const candidate_ids = new Set<string>();

  for (const field of fields) {
    const trie = field_tries.get(field);

    if (!trie) continue;

    for (const term of query_terms) {
      const prefix = term.substring(0, Math.max(1, term.length - max_distance));
      const suggestions = trie.search_prefix(prefix, 100);

      for (const suggestion of suggestions) {
        if (levenshtein_distance(term, suggestion) <= max_distance) {
          const message_ids = trie.get_message_ids(suggestion);

          for (const id of message_ids) {
            candidate_ids.add(id);
          }
        }
      }
    }
  }

  const results: SearchResult[] = [];
  const total_messages = message_index.size;

  for (const message_id of candidate_ids) {
    const message = message_index.get(message_id);

    if (!message) continue;

    const matched_fields = new Set<SearchField>();

    for (const [, field_set] of message.tokens) {
      for (const field of field_set) {
        if (fields.includes(field)) {
          matched_fields.add(field);
        }
      }
    }

    const score = calculate_relevance_score(
      message,
      query_terms,
      Array.from(matched_fields),
      total_messages,
    );

    results.push({
      message_id,
      score: score * 0.8,
      matched_fields: Array.from(matched_fields),
    });
  }

  results.sort((a, b) => b.score - a.score);

  return results.slice(0, limit);
}

function remove_from_index_internal(message_ids: string[]): number {
  let removed = 0;

  for (const message_id of message_ids) {
    const message = message_index.get(message_id);

    if (!message) continue;

    for (const [token] of message.tokens) {
      const id_set = inverted_index.get(token);

      if (id_set) {
        id_set.delete(message_id);

        if (id_set.size === 0) {
          inverted_index.delete(token);
        }
      }
    }

    for (const [, trie] of field_tries) {
      for (const term of message.term_frequencies.keys()) {
        trie.remove(term, message_id);
      }
    }

    message_index.delete(message_id);
    removed++;
  }

  if (removed > 0) {
    query_cache.clear();
  }

  return removed;
}

function get_index_stats(): {
  message_count: number;
  token_count: number;
  memory_estimate_bytes: number;
  cache_size: number;
  trie_stats: Record<SearchField, { node_count: number }>;
} {
  let memory_estimate = 0;

  memory_estimate += message_index.size * 500;

  for (const [, ids] of inverted_index) {
    memory_estimate += ids.size * 50;
  }

  memory_estimate += token_cache.size() * 100;
  memory_estimate += query_cache.size() * 200;

  const trie_stats: Record<SearchField, { node_count: number }> = {} as Record<
    SearchField,
    { node_count: number }
  >;

  for (const [field, trie] of field_tries) {
    trie_stats[field] = trie.get_stats();
    memory_estimate += trie_stats[field].node_count * 100;
  }

  return {
    message_count: message_index.size,
    token_count: inverted_index.size,
    memory_estimate_bytes: memory_estimate,
    cache_size: query_cache.size(),
    trie_stats,
  };
}

function export_index(): string {
  const export_data: Array<{
    id: string;
    bloom: string;
    timestamp: number;
    metadata: MessageMetadata;
    tokens: Array<[string, SearchField[]]>;
    term_frequencies: Array<[string, number]>;
  }> = [];

  for (const [id, message] of message_index) {
    const tokens: Array<[string, SearchField[]]> = [];

    for (const [token, fields] of message.tokens) {
      tokens.push([token, Array.from(fields)]);
    }

    export_data.push({
      id,
      bloom: array_to_base64(message.bloom),
      timestamp: message.timestamp,
      metadata: message.metadata,
      tokens,
      term_frequencies: Array.from(message.term_frequencies),
    });
  }

  return JSON.stringify(export_data);
}

function load_index(serialized: string): number {
  const data = JSON.parse(serialized) as Array<{
    id: string;
    bloom: string;
    timestamp: number;
    metadata: MessageMetadata;
    tokens: Array<[string, SearchField[]]>;
    term_frequencies: Array<[string, number]>;
  }>;

  let loaded = 0;

  for (const item of data) {
    const tokens = new Map<string, Set<SearchField>>();

    for (const [token, fields] of item.tokens) {
      tokens.set(token, new Set(fields));

      if (!inverted_index.has(token)) {
        inverted_index.set(token, new Set());
      }

      inverted_index.get(token)!.add(item.id);
    }

    const indexed_message: IndexedMessage = {
      message_id: item.id,
      tokens,
      bloom: base64_to_array(item.bloom),
      timestamp: item.timestamp,
      metadata: item.metadata,
      term_frequencies: new Map(item.term_frequencies),
    };

    message_index.set(item.id, indexed_message);
    loaded++;
  }

  return loaded;
}

async function handle_message(message: WorkerMessage): Promise<WorkerResponse> {
  const { id, type, payload } = message;

  try {
    switch (type) {
      case "init_key": {
        const { encryption_key } = payload as InitKeyPayload;
        const key_bytes = new Uint8Array(encryption_key);

        search_key = await derive_search_key_from_bytes(key_bytes);
        crypto.getRandomValues(key_bytes);

        return { id, type, payload: { success: true } };
      }

      case "generate_tokens": {
        if (!search_key) {
          return { id, type, error: "Search key not initialized" };
        }

        const { query, fields } = payload as GenerateTokensPayload;
        const tokens = await generate_search_tokens(query, fields);

        return { id, type, payload: { tokens } };
      }

      case "index_message": {
        if (!search_key) {
          return { id, type, error: "Search key not initialized" };
        }

        const { message_id, fields, timestamp, metadata } =
          payload as IndexMessagePayload;
        const indexed = await index_message_internal(
          message_id,
          fields,
          timestamp,
          metadata,
        );

        const tokens_array: SearchToken[] = [];

        for (const [token, field_set] of indexed.tokens) {
          for (const field of field_set) {
            tokens_array.push({ token, field });
          }
        }

        return {
          id,
          type,
          payload: {
            indexed: {
              message_id: indexed.message_id,
              tokens: tokens_array,
              bloom_filter: array_to_base64(indexed.bloom),
            },
          },
        };
      }

      case "bulk_index": {
        if (!search_key) {
          return { id, type, error: "Search key not initialized" };
        }

        const { messages } = payload as BulkIndexPayload;
        const results: Array<{
          message_id: string;
          tokens: SearchToken[];
          bloom_filter: string;
        }> = [];

        for (const msg of messages) {
          const indexed = await index_message_internal(
            msg.message_id,
            msg.fields,
            msg.timestamp,
            msg.metadata,
          );

          const tokens_array: SearchToken[] = [];

          for (const [token, field_set] of indexed.tokens) {
            for (const field of field_set) {
              tokens_array.push({ token, field });
            }
          }

          results.push({
            message_id: indexed.message_id,
            tokens: tokens_array,
            bloom_filter: array_to_base64(indexed.bloom),
          });
        }

        query_cache.clear();

        return { id, type, payload: { results } };
      }

      case "search": {
        if (!search_key) {
          return { id, type, error: "Search key not initialized" };
        }

        const { query, fields, limit, offset, filters } =
          payload as SearchPayload;
        const { results, total } = await search_internal(
          query,
          fields,
          limit,
          offset,
          filters,
        );

        return { id, type, payload: { results, total } };
      }

      case "autocomplete": {
        const { prefix, field, limit } = payload as AutocompletePayload;
        const suggestions = await autocomplete_internal(prefix, field, limit);

        return { id, type, payload: { suggestions } };
      }

      case "fuzzy_search": {
        if (!search_key) {
          return { id, type, error: "Search key not initialized" };
        }

        const { query, fields, max_distance, limit } =
          payload as FuzzySearchPayload;
        const results = await fuzzy_search_internal(
          query,
          fields,
          max_distance,
          limit,
        );

        return { id, type, payload: { results } };
      }

      case "check_bloom": {
        const { bloom_data, tokens } = payload as CheckBloomPayload;
        const bits = base64_to_array(bloom_data);
        let matches = true;

        for (const token of tokens) {
          if (!(await check_bloom(bits, token))) {
            matches = false;
            break;
          }
        }

        return { id, type, payload: { matches } };
      }

      case "update_index": {
        if (!search_key) {
          return { id, type, error: "Search key not initialized" };
        }

        const { message_id, fields, timestamp, metadata } =
          payload as UpdateIndexPayload;

        remove_from_index_internal([message_id]);
        await index_message_internal(message_id, fields, timestamp, metadata);

        return { id, type, payload: { success: true } };
      }

      case "remove_from_index": {
        const { message_ids } = payload as RemoveFromIndexPayload;
        const removed = remove_from_index_internal(message_ids);

        return { id, type, payload: { removed } };
      }

      case "get_stats": {
        const stats = get_index_stats();

        return { id, type, payload: stats };
      }

      case "load_index": {
        const { serialized_index } = payload as LoadIndexPayload;
        const loaded = load_index(serialized_index);

        return { id, type, payload: { loaded } };
      }

      case "export_index": {
        const exported = export_index();

        return { id, type, payload: { index: exported } };
      }

      case "clear_cache": {
        search_key = null;
        message_index.clear();
        inverted_index.clear();
        query_cache.clear();
        token_cache.clear();
        initialize_tries();

        return { id, type, payload: { success: true } };
      }

      default:
        return { id, type, error: `Unknown message type: ${type}` };
    }
  } catch (error) {
    const error_message =
      error instanceof Error ? error.message : "Unknown error";

    return { id, type, error: error_message };
  }
}

self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
  const response = await handle_message(event.data);

  self.postMessage(response);
};

export type { WorkerMessage, WorkerResponse, WorkerMessageType };
