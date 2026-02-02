import { Preferences } from "@capacitor/preferences";

import { is_native_platform, get_network_status } from "./capacitor_bridge";
import { haptic_notification } from "./haptic_feedback";

export interface QueuedAction {
  id: string;
  type: "send_email" | "archive" | "delete" | "star" | "mark_read" | "move";
  payload: unknown;
  created_at: number;
  retry_count: number;
  last_error?: string;
}

const QUEUE_KEY = "aster_offline_queue";
const MAX_RETRIES = 3;

let is_processing = false;

export async function initialize_offline_queue(): Promise<void> {
  if (!is_native_platform()) return;

  const status = await get_network_status();

  if (status.connected) {
    process_offline_queue();
  }
}

export async function enqueue_action(
  type: QueuedAction["type"],
  payload: unknown,
): Promise<string> {
  const action: QueuedAction = {
    id: crypto.randomUUID(),
    type,
    payload,
    created_at: Date.now(),
    retry_count: 0,
  };

  const queue = await get_queue();

  queue.push(action);
  await save_queue(queue);

  const status = await get_network_status();

  if (status.connected) {
    process_offline_queue();
  }

  return action.id;
}

export async function get_queue(): Promise<QueuedAction[]> {
  try {
    if (!is_native_platform()) {
      const stored = localStorage.getItem(QUEUE_KEY);

      return stored ? JSON.parse(stored) : [];
    }

    const { value } = await Preferences.get({ key: QUEUE_KEY });

    return value ? JSON.parse(value) : [];
  } catch {
    await save_queue([]);

    return [];
  }
}

async function save_queue(queue: QueuedAction[]): Promise<void> {
  const value = JSON.stringify(queue);

  if (!is_native_platform()) {
    localStorage.setItem(QUEUE_KEY, value);

    return;
  }

  await Preferences.set({ key: QUEUE_KEY, value });
}

export async function remove_from_queue(id: string): Promise<void> {
  const queue = await get_queue();
  const filtered = queue.filter((action) => action.id !== id);

  await save_queue(filtered);
}

export async function process_offline_queue(): Promise<void> {
  if (is_processing) return;

  const status = await get_network_status();

  if (!status.connected) return;

  is_processing = true;

  try {
    const queue = await get_queue();

    for (const action of queue) {
      try {
        await process_action(action);
        await remove_from_queue(action.id);
        await haptic_notification("success");
      } catch (error) {
        action.retry_count++;
        action.last_error =
          error instanceof Error ? error.message : "Unknown error";

        if (action.retry_count >= MAX_RETRIES) {
          await remove_from_queue(action.id);
          notify_queue_failure(action);
        } else {
          const queue = await get_queue();
          const index = queue.findIndex((a) => a.id === action.id);

          if (index !== -1) {
            queue[index] = action;
            await save_queue(queue);
          }
        }
      }
    }
  } finally {
    is_processing = false;
  }
}

async function process_action(action: QueuedAction): Promise<void> {
  switch (action.type) {
    case "send_email":
      await process_send_email(action.payload as SendEmailPayload);
      break;
    case "archive":
      await process_archive(action.payload as EmailActionPayload);
      break;
    case "delete":
      await process_delete(action.payload as EmailActionPayload);
      break;
    case "star":
      await process_star(action.payload as StarPayload);
      break;
    case "mark_read":
      await process_mark_read(action.payload as MarkReadPayload);
      break;
    case "move":
      await process_move(action.payload as MovePayload);
      break;
  }
}

interface SendEmailPayload {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  attachments?: { name: string; data: string; type: string }[];
}

interface EmailActionPayload {
  email_ids: string[];
}

interface StarPayload {
  email_ids: string[];
  starred: boolean;
}

interface MarkReadPayload {
  email_ids: string[];
  read: boolean;
}

interface MovePayload {
  email_ids: string[];
  folder_id: string;
}

async function process_send_email(payload: SendEmailPayload): Promise<void> {
  const response = await fetch("/api/mail/v1/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Failed to send email: ${response.status}`);
  }
}

async function process_archive(payload: EmailActionPayload): Promise<void> {
  const response = await fetch("/api/mail/v1/archive", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ email_ids: payload.email_ids }),
  });

  if (!response.ok) {
    throw new Error(`Failed to archive: ${response.status}`);
  }
}

async function process_delete(payload: EmailActionPayload): Promise<void> {
  const response = await fetch("/api/mail/v1/messages/trash", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ email_ids: payload.email_ids }),
  });

  if (!response.ok) {
    throw new Error(`Failed to delete: ${response.status}`);
  }
}

async function process_star(payload: StarPayload): Promise<void> {
  const response = await fetch("/api/mail/v1/messages/star", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      email_ids: payload.email_ids,
      starred: payload.starred,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to star: ${response.status}`);
  }
}

async function process_mark_read(payload: MarkReadPayload): Promise<void> {
  const response = await fetch("/api/mail/v1/messages/read", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      email_ids: payload.email_ids,
      read: payload.read,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to mark read: ${response.status}`);
  }
}

async function process_move(payload: MovePayload): Promise<void> {
  const response = await fetch("/api/mail/v1/messages/move", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      email_ids: payload.email_ids,
      folder_id: payload.folder_id,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to move: ${response.status}`);
  }
}

type QueueStatusCallback = (pending_count: number) => void;
const queue_status_listeners: QueueStatusCallback[] = [];

export function add_queue_status_listener(
  callback: QueueStatusCallback,
): () => void {
  queue_status_listeners.push(callback);

  return () => {
    const index = queue_status_listeners.indexOf(callback);

    if (index > -1) {
      queue_status_listeners.splice(index, 1);
    }
  };
}

function notify_queue_failure(action: QueuedAction): void {
  const event = new CustomEvent("offline-queue-failure", {
    detail: { action },
  });

  window.dispatchEvent(event);
}

export async function get_pending_count(): Promise<number> {
  const queue = await get_queue();

  return queue.length;
}

export async function clear_queue(): Promise<void> {
  await save_queue([]);
}

export async function retry_failed_actions(): Promise<void> {
  const queue = await get_queue();
  const updated = queue.map((action) => ({
    ...action,
    retry_count: 0,
    last_error: undefined,
  }));

  await save_queue(updated);
  process_offline_queue();
}
