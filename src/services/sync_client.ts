import type { EncryptedVault } from "./crypto/key_manager";

import { api_client } from "./api/client";
import { refresh_session_activity } from "./session_timeout_service";

type ServerMessageType =
  | "auth_success"
  | "auth_error"
  | "preferences"
  | "preferences_saved"
  | "draft"
  | "draft_saved"
  | "draft_deleted";

interface ServerMessage {
  type: ServerMessageType;
  encrypted?: string | null;
  nonce?: string | null;
  success?: boolean;
  message?: string;
}

type MessageHandler = (data: ServerMessage) => void;

interface PendingRequest {
  resolve: (data: ServerMessage) => void;
  reject: (error: Error) => void;
  type: string;
  timeout_id: ReturnType<typeof setTimeout>;
}

class SyncClient {
  private socket: WebSocket | null = null;
  private authenticated = false;
  private pending_requests: PendingRequest[] = [];
  private reconnect_timeout: ReturnType<typeof setTimeout> | null = null;
  private message_handlers: Map<string, MessageHandler[]> = new Map();
  private should_reconnect = false;
  private auth_error_count = 0;
  private last_auth_error = false;
  private reconnect_attempt = 0;

  async connect(): Promise<void> {
    this.should_reconnect = true;

    return new Promise((resolve, reject) => {
      const api_url = import.meta.env.VITE_API_URL || "";

      let ws_url: string;

      if (api_url && api_url.startsWith("http")) {
        ws_url = api_url
          .replace(/^https:/, "wss:")
          .replace(/^http:/, "ws:")
          .replace(/\/api$/, "/ws");
      } else {
        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";

        ws_url = `${protocol}//${window.location.host}/ws`;
      }

      this.socket = new WebSocket(ws_url);

      this.socket.onopen = () => {
        const token = api_client.get_access_token();

        if (token) {
          this.send_message({ type: "auth", token });
        } else {
          this.socket?.close();
          reject(new Error("No access token available"));
        }
      };

      this.socket.onmessage = (event) => {
        const data: ServerMessage = JSON.parse(event.data);

        this.handle_message(data);

        if (data.type === "auth_success") {
          this.authenticated = true;
          this.auth_error_count = 0;
          this.last_auth_error = false;
          this.reconnect_attempt = 0;
          resolve();
        } else if (data.type === "auth_error") {
          this.last_auth_error = true;
          reject(new Error(data.message || "Authentication failed"));
        }
      };

      this.socket.onerror = () => {
        reject(new Error("WebSocket connection failed"));
      };

      this.socket.onclose = () => {
        this.authenticated = false;
        this.clear_pending_requests();
        this.schedule_reconnect();
      };
    });
  }

  private schedule_reconnect(): void {
    if (this.reconnect_timeout || !this.should_reconnect) return;

    const base_delay = 3000;
    const max_delay = 60000;
    const delay = Math.min(
      base_delay * Math.pow(2, this.reconnect_attempt),
      max_delay,
    );

    this.reconnect_attempt++;

    this.reconnect_timeout = setTimeout(async () => {
      this.reconnect_timeout = null;
      if (!this.should_reconnect) return;

      if (this.last_auth_error) {
        this.auth_error_count++;

        if (this.auth_error_count > 3) {
          this.should_reconnect = false;
          window.dispatchEvent(new CustomEvent("astermail:session-expired"));

          return;
        }

        await api_client.refresh_session();

        if (!api_client.is_authenticated()) {
          this.should_reconnect = false;
          window.dispatchEvent(new CustomEvent("astermail:session-expired"));

          return;
        }

        this.last_auth_error = false;
      }

      this.connect().catch(() => {
        window.dispatchEvent(
          new CustomEvent("astermail:sync-connection-failed"),
        );
      });
    }, delay);
  }

  private send_message(msg: Record<string, unknown>): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(msg));
    }
  }

  private handle_message(data: ServerMessage): void {
    refresh_session_activity();

    const handlers = this.message_handlers.get(data.type);

    if (handlers) {
      handlers.forEach((h) => h(data));
    }

    const request_types: Record<string, string> = {
      preferences: "get_preferences",
      preferences_saved: "save_preferences",
      draft: "get_draft",
      draft_saved: "save_draft",
      draft_deleted: "delete_draft",
    };

    const request_type = request_types[data.type];

    if (request_type) {
      const idx = this.pending_requests.findIndex(
        (r) => r.type === request_type,
      );

      if (idx !== -1) {
        const request = this.pending_requests.splice(idx, 1)[0];

        clearTimeout(request.timeout_id);
        request.resolve(data);
      }
    }
  }

  private async send_and_wait(
    msg: Record<string, unknown>,
    _response_type: string,
  ): Promise<ServerMessage> {
    return new Promise((resolve, reject) => {
      if (!this.authenticated || this.socket?.readyState !== WebSocket.OPEN) {
        reject(new Error("Not connected"));

        return;
      }

      const pending: PendingRequest = {
        resolve,
        reject,
        type: msg.type as string,
        timeout_id: null as unknown as ReturnType<typeof setTimeout>,
      };

      pending.timeout_id = setTimeout(() => {
        const idx = this.pending_requests.indexOf(pending);

        if (idx !== -1) {
          this.pending_requests.splice(idx, 1);
          reject(new Error("Request timeout"));
        }
      }, 10000);

      this.pending_requests.push(pending);

      this.send_message(msg);
    });
  }

  async get_preferences(): Promise<{
    encrypted: string | null;
    nonce: string | null;
  }> {
    const response = await this.send_and_wait(
      { type: "get_preferences" },
      "preferences",
    );

    return {
      encrypted: response.encrypted || null,
      nonce: response.nonce || null,
    };
  }

  async save_preferences(encrypted: string, nonce: string): Promise<boolean> {
    const response = await this.send_and_wait(
      { type: "save_preferences", encrypted, nonce },
      "preferences_saved",
    );

    return response.success === true;
  }

  async get_draft(): Promise<{
    encrypted: string | null;
    nonce: string | null;
  }> {
    const response = await this.send_and_wait({ type: "get_draft" }, "draft");

    return {
      encrypted: response.encrypted || null,
      nonce: response.nonce || null,
    };
  }

  async save_draft(encrypted: string, nonce: string): Promise<boolean> {
    const response = await this.send_and_wait(
      { type: "save_draft", encrypted, nonce },
      "draft_saved",
    );

    return response.success === true;
  }

  async delete_draft(): Promise<boolean> {
    const response = await this.send_and_wait(
      { type: "delete_draft" },
      "draft_deleted",
    );

    return response.success === true;
  }

  disconnect(): void {
    this.should_reconnect = false;
    this.last_auth_error = false;
    this.auth_error_count = 0;
    this.reconnect_attempt = 0;
    if (this.reconnect_timeout) {
      clearTimeout(this.reconnect_timeout);
      this.reconnect_timeout = null;
    }
    this.clear_pending_requests();
    this.message_handlers.clear();
    this.authenticated = false;
    this.socket?.close();
    this.socket = null;
  }

  private clear_pending_requests(): void {
    for (const request of this.pending_requests) {
      clearTimeout(request.timeout_id);
      request.reject(new Error("Connection closed"));
    }
    this.pending_requests = [];
  }

  is_connected(): boolean {
    return this.authenticated && this.socket?.readyState === WebSocket.OPEN;
  }

  register_handler(message_type: string, handler: MessageHandler): () => void {
    if (!this.message_handlers.has(message_type)) {
      this.message_handlers.set(message_type, []);
    }

    this.message_handlers.get(message_type)!.push(handler);

    return () => {
      const handlers = this.message_handlers.get(message_type);

      if (handlers) {
        const idx = handlers.indexOf(handler);

        if (idx !== -1) {
          handlers.splice(idx, 1);
        }
      }
    };
  }

  async wait_for_connection(timeout_ms: number = 5000): Promise<boolean> {
    if (this.is_connected()) return true;

    const start = Date.now();

    while (Date.now() - start < timeout_ms) {
      if (this.is_connected()) return true;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    return false;
  }
}

export const sync_client = new SyncClient();

if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () => {
    sync_client.disconnect();
  });
}

async function derive_key(
  vault: EncryptedVault,
  context: string,
): Promise<CryptoKey> {
  const key_material = new TextEncoder().encode(vault.identity_key + context);
  const hash = await crypto.subtle.digest("SHA-256", key_material);

  return crypto.subtle.importKey(
    "raw",
    hash,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function encrypt_data(
  data: unknown,
  vault: EncryptedVault,
  context: string,
): Promise<{ encrypted: string; nonce: string }> {
  const key = await derive_key(vault, context);
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(JSON.stringify(data));

  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    key,
    encoded,
  );

  return {
    encrypted: btoa(String.fromCharCode(...new Uint8Array(encrypted))),
    nonce: btoa(String.fromCharCode(...nonce)),
  };
}

async function decrypt_data<T>(
  encrypted: string,
  nonce: string,
  vault: EncryptedVault,
  context: string,
): Promise<T> {
  const key = await derive_key(vault, context);
  const encrypted_bytes = Uint8Array.from(atob(encrypted), (c) =>
    c.charCodeAt(0),
  );
  const nonce_bytes = Uint8Array.from(atob(nonce), (c) => c.charCodeAt(0));

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: nonce_bytes },
    key,
    encrypted_bytes,
  );

  return JSON.parse(new TextDecoder().decode(decrypted));
}

export async function sync_get_preferences<T>(
  vault: EncryptedVault,
  default_value: T,
): Promise<T> {
  const connected = await sync_client.wait_for_connection(3000);

  if (!connected) {
    return default_value;
  }

  try {
    const { encrypted, nonce } = await sync_client.get_preferences();

    if (!encrypted || !nonce) {
      return default_value;
    }

    return await decrypt_data<T>(
      encrypted,
      nonce,
      vault,
      "astermail-preferences-v1",
    );
  } catch {
    return default_value;
  }
}

export async function sync_save_preferences<T>(
  vault: EncryptedVault,
  data: T,
): Promise<boolean> {
  if (!sync_client.is_connected()) {
    return false;
  }

  try {
    const { encrypted, nonce } = await encrypt_data(
      data,
      vault,
      "astermail-preferences-v1",
    );

    return await sync_client.save_preferences(encrypted, nonce);
  } catch {
    return false;
  }
}

export interface DraftData {
  to_recipients: string[];
  cc_recipients: string[];
  bcc_recipients: string[];
  subject: string;
  message: string;
}

export async function sync_get_draft(
  vault: EncryptedVault,
): Promise<DraftData | null> {
  if (!sync_client.is_connected()) {
    return null;
  }

  try {
    const { encrypted, nonce } = await sync_client.get_draft();

    if (!encrypted || !nonce) {
      return null;
    }

    return await decrypt_data<DraftData>(
      encrypted,
      nonce,
      vault,
      "astermail-draft-v1",
    );
  } catch {
    return null;
  }
}

export async function sync_save_draft(
  vault: EncryptedVault,
  data: DraftData,
): Promise<boolean> {
  if (!sync_client.is_connected()) {
    return false;
  }

  try {
    const { encrypted, nonce } = await encrypt_data(
      data,
      vault,
      "astermail-draft-v1",
    );

    return await sync_client.save_draft(encrypted, nonce);
  } catch {
    return false;
  }
}

export async function sync_delete_draft(): Promise<boolean> {
  if (!sync_client.is_connected()) {
    return false;
  }

  try {
    return await sync_client.delete_draft();
  } catch {
    return false;
  }
}
