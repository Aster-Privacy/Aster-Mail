import type {
  SearchField,
  SearchToken,
  SearchableFields,
} from "./search_crypto";

import { get_derived_encryption_key } from "./memory_key_store";
import { zero_uint8_array } from "./secure_memory";

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

interface IndexedMessageResult {
  message_id: string;
  tokens: SearchToken[];
  bloom_filter: string;
}

interface WorkerSearchResult {
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

interface IndexStats {
  message_count: number;
  token_count: number;
  memory_estimate_bytes: number;
  cache_size: number;
  trie_stats: Record<SearchField, { node_count: number }>;
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  type: WorkerMessageType;
  timestamp: number;
  timeout_id: ReturnType<typeof setTimeout>;
}

interface QueuedMessage {
  message: WorkerMessage;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  priority: number;
}

const WORKER_TIMEOUT_MS = 30000;
const MAX_CONCURRENT_REQUESTS = 10;
const MAX_QUEUE_SIZE = 1000;
const RECONNECT_DELAY_MS = 1000;
const MAX_RECONNECT_ATTEMPTS = 5;
const HEALTH_CHECK_INTERVAL_MS = 30000;

class SearchWorkerClient {
  private worker: Worker | null = null;
  private pending_requests: Map<string, PendingRequest> = new Map();
  private message_queue: QueuedMessage[] = [];
  private request_counter = 0;
  private is_initialized = false;
  private init_promise: Promise<void> | null = null;
  private reconnect_attempts = 0;
  private is_reconnecting = false;
  private health_check_interval: ReturnType<typeof setInterval> | null = null;
  private active_requests = 0;
  private on_error_callbacks: Set<(error: Error) => void> = new Set();
  private on_ready_callbacks: Set<() => void> = new Set();
  private last_activity_timestamp = 0;

  private create_worker(): Worker {
    const worker = new Worker(
      new URL("../../workers/search_worker.ts", import.meta.url),
      { type: "module" },
    );

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      this.last_activity_timestamp = Date.now();
      this.handle_response(event.data);
      this.process_queue();
    };

    worker.onerror = (error) => {
      this.handle_worker_error(new Error(`Worker error: ${error.message}`));
    };

    return worker;
  }

  private get_worker(): Worker {
    if (!this.worker) {
      this.worker = this.create_worker();
      this.start_health_check();
    }

    return this.worker;
  }

  private start_health_check(): void {
    if (this.health_check_interval) return;

    this.health_check_interval = setInterval(() => {
      this.perform_health_check();
    }, HEALTH_CHECK_INTERVAL_MS);
  }

  private stop_health_check(): void {
    if (this.health_check_interval) {
      clearInterval(this.health_check_interval);
      this.health_check_interval = null;
    }
  }

  private async perform_health_check(): Promise<void> {
    if (!this.worker || !this.is_initialized) return;

    const now = Date.now();
    const idle_time = now - this.last_activity_timestamp;

    if (idle_time > HEALTH_CHECK_INTERVAL_MS * 2) {
      try {
        await this.get_stats();
      } catch {
        this.handle_worker_error(new Error("Health check failed"));
      }
    }
  }

  private generate_id(): string {
    return `req_${++this.request_counter}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private handle_response(response: WorkerResponse): void {
    const pending = this.pending_requests.get(response.id);

    if (!pending) return;

    clearTimeout(pending.timeout_id);
    this.pending_requests.delete(response.id);
    this.active_requests--;

    if (response.error) {
      pending.reject(new Error(response.error));
    } else {
      pending.resolve(response.payload);
    }
  }

  private handle_worker_error(error: Error): void {
    for (const callback of this.on_error_callbacks) {
      try {
        callback(error);
      } catch {
        void 0;
      }
    }

    for (const [id, pending] of this.pending_requests.entries()) {
      clearTimeout(pending.timeout_id);
      pending.reject(error);
      this.pending_requests.delete(id);
    }

    this.active_requests = 0;

    if (!this.is_reconnecting) {
      this.attempt_reconnect();
    }
  }

  private async attempt_reconnect(): Promise<void> {
    if (this.reconnect_attempts >= MAX_RECONNECT_ATTEMPTS) {
      this.is_reconnecting = false;

      return;
    }

    this.is_reconnecting = true;
    this.reconnect_attempts++;

    this.terminate_worker_only();

    await new Promise((resolve) =>
      setTimeout(resolve, RECONNECT_DELAY_MS * this.reconnect_attempts),
    );

    try {
      this.worker = this.create_worker();
      this.is_initialized = false;
      await this.initialize();
      this.reconnect_attempts = 0;
      this.is_reconnecting = false;

      for (const callback of this.on_ready_callbacks) {
        try {
          callback();
        } catch {
          void 0;
        }
      }

      this.process_queue();
    } catch {
      this.attempt_reconnect();
    }
  }

  private terminate_worker_only(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
  }

  private send_message<T>(
    type: WorkerMessageType,
    payload: unknown,
    priority: number = 0,
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const id = this.generate_id();
      const message: WorkerMessage = { id, type, payload };

      if (this.active_requests >= MAX_CONCURRENT_REQUESTS) {
        if (this.message_queue.length >= MAX_QUEUE_SIZE) {
          reject(new Error("Message queue full"));

          return;
        }

        this.message_queue.push({
          message,
          resolve: resolve as (value: unknown) => void,
          reject,
          priority,
        });

        this.message_queue.sort((a, b) => b.priority - a.priority);

        return;
      }

      this.dispatch_message(
        message,
        resolve as (value: unknown) => void,
        reject,
      );
    });
  }

  private dispatch_message(
    message: WorkerMessage,
    resolve: (value: unknown) => void,
    reject: (error: Error) => void,
  ): void {
    const timeout_id = setTimeout(() => {
      const pending = this.pending_requests.get(message.id);

      if (pending) {
        this.pending_requests.delete(message.id);
        this.active_requests--;
        reject(new Error(`Request timeout: ${message.type}`));
        this.process_queue();
      }
    }, WORKER_TIMEOUT_MS);

    this.pending_requests.set(message.id, {
      resolve,
      reject,
      type: message.type,
      timestamp: Date.now(),
      timeout_id,
    });

    this.active_requests++;

    try {
      this.get_worker().postMessage(message);
      this.last_activity_timestamp = Date.now();
    } catch (error) {
      clearTimeout(timeout_id);
      this.pending_requests.delete(message.id);
      this.active_requests--;
      reject(
        error instanceof Error ? error : new Error("Failed to send message"),
      );
    }
  }

  private process_queue(): void {
    while (
      this.message_queue.length > 0 &&
      this.active_requests < MAX_CONCURRENT_REQUESTS
    ) {
      const queued = this.message_queue.shift();

      if (queued) {
        this.dispatch_message(queued.message, queued.resolve, queued.reject);
      }
    }
  }

  async initialize(): Promise<void> {
    if (this.is_initialized) return;

    if (this.init_promise) {
      return this.init_promise;
    }

    this.init_promise = (async () => {
      const encryption_key = get_derived_encryption_key();

      if (!encryption_key) {
        throw new Error("No encryption key available");
      }

      const key_buffer = encryption_key.buffer.slice(
        encryption_key.byteOffset,
        encryption_key.byteOffset + encryption_key.byteLength,
      );

      try {
        await this.send_message(
          "init_key",
          { encryption_key: key_buffer },
          100,
        );
        this.is_initialized = true;
      } finally {
        zero_uint8_array(encryption_key);
        this.init_promise = null;
      }
    })();

    return this.init_promise;
  }

  async generate_tokens(
    query: string,
    fields: SearchField[] = ["all"],
  ): Promise<SearchToken[]> {
    await this.initialize();

    const result = await this.send_message<{ tokens: SearchToken[] }>(
      "generate_tokens",
      { query, fields },
      50,
    );

    return result.tokens;
  }

  async index_message(
    message_id: string,
    fields: SearchableFields,
    timestamp?: number,
    metadata?: MessageMetadata,
  ): Promise<IndexedMessageResult> {
    await this.initialize();

    const result = await this.send_message<{ indexed: IndexedMessageResult }>(
      "index_message",
      { message_id, fields, timestamp, metadata },
      30,
    );

    return result.indexed;
  }

  async bulk_index_messages(
    messages: Array<{
      id: string;
      fields: SearchableFields;
      timestamp?: number;
      metadata?: MessageMetadata;
    }>,
  ): Promise<IndexedMessageResult[]> {
    await this.initialize();

    const batch_size = 50;
    const results: IndexedMessageResult[] = [];

    for (let i = 0; i < messages.length; i += batch_size) {
      const batch = messages.slice(i, i + batch_size);
      const payload = batch.map((msg) => ({
        message_id: msg.id,
        fields: msg.fields,
        timestamp: msg.timestamp,
        metadata: msg.metadata,
      }));

      const batch_result = await this.send_message<{
        results: IndexedMessageResult[];
      }>("bulk_index", { messages: payload }, 20);

      results.push(...batch_result.results);
    }

    return results;
  }

  async search(
    query: string,
    options: {
      fields?: SearchField[];
      limit?: number;
      offset?: number;
      filters?: SearchFilters;
    } = {},
  ): Promise<{ results: WorkerSearchResult[]; total: number }> {
    await this.initialize();

    const { fields = ["all"], limit = 50, offset = 0, filters } = options;

    return this.send_message<{
      results: WorkerSearchResult[];
      total: number;
    }>("search", { query, fields, limit, offset, filters }, 80);
  }

  async autocomplete(
    prefix: string,
    field: SearchField = "all",
    limit: number = 10,
  ): Promise<string[]> {
    await this.initialize();

    const result = await this.send_message<{ suggestions: string[] }>(
      "autocomplete",
      { prefix, field, limit },
      90,
    );

    return result.suggestions;
  }

  async fuzzy_search(
    query: string,
    options: {
      fields?: SearchField[];
      max_distance?: number;
      limit?: number;
    } = {},
  ): Promise<WorkerSearchResult[]> {
    await this.initialize();

    const { fields = ["all"], max_distance = 2, limit = 50 } = options;

    const result = await this.send_message<{ results: WorkerSearchResult[] }>(
      "fuzzy_search",
      { query, fields, max_distance, limit },
      70,
    );

    return result.results;
  }

  async check_bloom(bloom_data: string, tokens: string[]): Promise<boolean> {
    const result = await this.send_message<{ matches: boolean }>(
      "check_bloom",
      { bloom_data, tokens },
      40,
    );

    return result.matches;
  }

  async update_index(
    message_id: string,
    fields: SearchableFields,
    timestamp?: number,
    metadata?: MessageMetadata,
  ): Promise<void> {
    await this.initialize();

    await this.send_message(
      "update_index",
      { message_id, fields, timestamp, metadata },
      30,
    );
  }

  async remove_from_index(message_ids: string[]): Promise<number> {
    await this.initialize();

    const result = await this.send_message<{ removed: number }>(
      "remove_from_index",
      { message_ids },
      30,
    );

    return result.removed;
  }

  async get_stats(): Promise<IndexStats> {
    await this.initialize();

    return this.send_message<IndexStats>("get_stats", {}, 10);
  }

  async load_index(serialized_index: string): Promise<number> {
    await this.initialize();

    const result = await this.send_message<{ loaded: number }>(
      "load_index",
      { serialized_index },
      100,
    );

    return result.loaded;
  }

  async export_index(): Promise<string> {
    await this.initialize();

    const result = await this.send_message<{ index: string }>(
      "export_index",
      {},
      10,
    );

    return result.index;
  }

  async clear_cache(): Promise<void> {
    if (!this.worker) return;

    await this.send_message("clear_cache", {}, 100);
    this.is_initialized = false;
  }

  on_error(callback: (error: Error) => void): () => void {
    this.on_error_callbacks.add(callback);

    return () => {
      this.on_error_callbacks.delete(callback);
    };
  }

  on_ready(callback: () => void): () => void {
    this.on_ready_callbacks.add(callback);

    return () => {
      this.on_ready_callbacks.delete(callback);
    };
  }

  terminate(): void {
    this.stop_health_check();

    for (const [id, pending] of this.pending_requests.entries()) {
      clearTimeout(pending.timeout_id);
      pending.reject(new Error("Worker terminated"));
      this.pending_requests.delete(id);
    }

    for (const queued of this.message_queue) {
      queued.reject(new Error("Worker terminated"));
    }

    this.message_queue = [];

    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }

    this.pending_requests.clear();
    this.is_initialized = false;
    this.init_promise = null;
    this.active_requests = 0;
    this.reconnect_attempts = 0;
    this.is_reconnecting = false;
  }

  is_ready(): boolean {
    return this.is_initialized && !this.is_reconnecting;
  }

  get_queue_length(): number {
    return this.message_queue.length;
  }

  get_active_requests(): number {
    return this.active_requests;
  }
}

let worker_instance: SearchWorkerClient | null = null;

export function get_search_worker(): SearchWorkerClient {
  if (!worker_instance) {
    worker_instance = new SearchWorkerClient();
  }

  return worker_instance;
}

export function terminate_search_worker(): void {
  if (worker_instance) {
    worker_instance.terminate();
    worker_instance = null;
  }
}

export async function generate_tokens_with_worker(
  query: string,
  fields?: SearchField[],
): Promise<SearchToken[]> {
  return get_search_worker().generate_tokens(query, fields);
}

export async function index_message_with_worker(
  message_id: string,
  fields: SearchableFields,
): Promise<IndexedMessageResult> {
  return get_search_worker().index_message(message_id, fields);
}

export async function bulk_index_with_worker(
  messages: Array<{ id: string; fields: SearchableFields }>,
): Promise<IndexedMessageResult[]> {
  return get_search_worker().bulk_index_messages(messages);
}

export async function search_with_worker(
  query: string,
  options?: {
    fields?: SearchField[];
    limit?: number;
    offset?: number;
    filters?: SearchFilters;
  },
): Promise<{ results: WorkerSearchResult[]; total: number }> {
  return get_search_worker().search(query, options);
}

export async function autocomplete_with_worker(
  prefix: string,
  field?: SearchField,
  limit?: number,
): Promise<string[]> {
  return get_search_worker().autocomplete(prefix, field, limit);
}

export async function fuzzy_search_with_worker(
  query: string,
  options?: {
    fields?: SearchField[];
    max_distance?: number;
    limit?: number;
  },
): Promise<WorkerSearchResult[]> {
  return get_search_worker().fuzzy_search(query, options);
}

export async function get_worker_stats(): Promise<IndexStats> {
  return get_search_worker().get_stats();
}

export async function export_worker_index(): Promise<string> {
  return get_search_worker().export_index();
}

export async function load_worker_index(
  serialized_index: string,
): Promise<number> {
  return get_search_worker().load_index(serialized_index);
}

export type {
  IndexedMessageResult,
  WorkerSearchResult,
  SearchFilters,
  MessageMetadata,
  IndexStats,
};
