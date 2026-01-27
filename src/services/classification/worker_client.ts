import type { EmailCategory, DecryptedEnvelope } from "@/types/email";
import type { ClassificationResult, UserCategoryPreference, EmailHeaders } from "./types";

type ClassificationMessageType =
  | "classify"
  | "classify_batch"
  | "add_preference"
  | "remove_preference"
  | "load_preferences"
  | "get_preferences"
  | "clear_cache";

interface WorkerMessage {
  id: string;
  type: ClassificationMessageType;
  payload: unknown;
}

interface WorkerResponse {
  id: string;
  type: ClassificationMessageType;
  payload?: unknown;
  error?: string;
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeout_id: ReturnType<typeof setTimeout>;
}

const WORKER_TIMEOUT_MS = 10000;
const MAX_QUEUE_SIZE = 500;

class ClassificationWorkerClient {
  private worker: Worker | null = null;
  private pending_requests = new Map<string, PendingRequest>();
  private request_counter = 0;
  private is_ready = false;

  private get_worker(): Worker {
    if (!this.worker) {
      this.worker = new Worker(
        new URL("../../workers/classification_worker.ts", import.meta.url),
        { type: "module" },
      );

      this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
        this.handle_response(event.data);
      };

      this.worker.onerror = (error) => {
        this.handle_error(new Error(`Worker error: ${error.message}`));
      };

      this.is_ready = true;
    }

    return this.worker;
  }

  private generate_id(): string {
    return `class_${++this.request_counter}_${Date.now()}`;
  }

  private handle_response(response: WorkerResponse): void {
    const pending = this.pending_requests.get(response.id);
    if (!pending) return;

    clearTimeout(pending.timeout_id);
    this.pending_requests.delete(response.id);

    if (response.error) {
      pending.reject(new Error(response.error));
    } else {
      pending.resolve(response.payload);
    }
  }

  private handle_error(error: Error): void {
    for (const [id, pending] of this.pending_requests) {
      clearTimeout(pending.timeout_id);
      pending.reject(error);
      this.pending_requests.delete(id);
    }
  }

  private send_message<T>(
    type: ClassificationMessageType,
    payload: unknown,
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      if (this.pending_requests.size >= MAX_QUEUE_SIZE) {
        reject(new Error("Classification queue full"));
        return;
      }

      const id = this.generate_id();
      const message: WorkerMessage = { id, type, payload };

      const timeout_id = setTimeout(() => {
        const pending = this.pending_requests.get(id);
        if (pending) {
          this.pending_requests.delete(id);
          reject(new Error("Classification request timeout"));
        }
      }, WORKER_TIMEOUT_MS);

      this.pending_requests.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timeout_id,
      });

      try {
        this.get_worker().postMessage(message);
      } catch (error) {
        clearTimeout(timeout_id);
        this.pending_requests.delete(id);
        reject(error instanceof Error ? error : new Error("Failed to send message"));
      }
    });
  }

  async classify(
    id: string,
    envelope: DecryptedEnvelope,
    headers?: EmailHeaders,
  ): Promise<ClassificationResult> {
    return this.send_message<ClassificationResult>("classify", {
      id,
      envelope,
      headers,
    });
  }

  async classify_batch(
    items: Array<{
      id: string;
      envelope: DecryptedEnvelope;
      headers?: EmailHeaders;
    }>,
  ): Promise<Map<string, ClassificationResult>> {
    const result = await this.send_message<{
      results: Record<string, ClassificationResult>;
    }>("classify_batch", { items });

    return new Map(Object.entries(result.results));
  }

  async add_preference(
    sender_email: string,
    category: EmailCategory,
  ): Promise<void> {
    await this.send_message("add_preference", { sender_email, category });
  }

  async remove_preference(sender_email: string): Promise<void> {
    await this.send_message("remove_preference", { sender_email });
  }

  async load_preferences(preferences: UserCategoryPreference[]): Promise<number> {
    const result = await this.send_message<{ loaded: number }>(
      "load_preferences",
      { preferences },
    );
    return result.loaded;
  }

  async get_preferences(): Promise<UserCategoryPreference[]> {
    const result = await this.send_message<{ preferences: UserCategoryPreference[] }>(
      "get_preferences",
      {},
    );
    return result.preferences;
  }

  async clear_cache(): Promise<void> {
    await this.send_message("clear_cache", {});
  }

  terminate(): void {
    for (const [id, pending] of this.pending_requests) {
      clearTimeout(pending.timeout_id);
      pending.reject(new Error("Worker terminated"));
      this.pending_requests.delete(id);
    }

    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }

    this.is_ready = false;
  }

  is_initialized(): boolean {
    return this.is_ready;
  }
}

let worker_instance: ClassificationWorkerClient | null = null;

export function get_classification_worker(): ClassificationWorkerClient {
  if (!worker_instance) {
    worker_instance = new ClassificationWorkerClient();
  }
  return worker_instance;
}

export function terminate_classification_worker(): void {
  if (worker_instance) {
    worker_instance.terminate();
    worker_instance = null;
  }
}

export async function classify_with_worker(
  id: string,
  envelope: DecryptedEnvelope,
  headers?: EmailHeaders,
): Promise<ClassificationResult> {
  return get_classification_worker().classify(id, envelope, headers);
}

export async function classify_batch_with_worker(
  items: Array<{
    id: string;
    envelope: DecryptedEnvelope;
    headers?: EmailHeaders;
  }>,
): Promise<Map<string, ClassificationResult>> {
  return get_classification_worker().classify_batch(items);
}

export { ClassificationWorkerClient };
