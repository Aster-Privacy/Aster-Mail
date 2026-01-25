import type { MailItem } from "@/services/api/mail";

export interface ThreadMessage {
  id: string;
  item_type: "received" | "sent" | "draft";
  encrypted_envelope: string;
  envelope_nonce: string;
  is_read: boolean;
  is_trashed: boolean;
  message_ts: string;
  created_at: string;
}

export interface DecryptedThreadMessage {
  id: string;
  item_type: "received" | "sent" | "draft";
  sender_name: string;
  sender_email: string;
  subject: string;
  body: string;
  timestamp: string;
  is_read: boolean;
  is_starred: boolean;
  is_deleted: boolean;
  encrypted_metadata?: string;
  metadata_nonce?: string;
  attachments?: ThreadAttachment[];
}

export interface ThreadAttachment {
  id: string;
  filename: string;
  content_type: string;
  size: number;
}

export interface ThreadViewState {
  thread_token: string;
  subject: string;
  messages: DecryptedThreadMessage[];
  expanded_ids: Set<string>;
  is_loading: boolean;
}

export interface ThreadContext {
  thread_token: string;
  original_email_id: string;
  in_reply_to?: string;
}

export function mail_item_to_thread_message(item: MailItem): ThreadMessage {
  return {
    id: item.id,
    item_type: item.item_type as "received" | "sent" | "draft",
    encrypted_envelope: item.encrypted_envelope,
    envelope_nonce: item.envelope_nonce,
    is_read: item.is_read ?? false,
    is_trashed: item.is_trashed ?? false,
    message_ts: item.message_ts ?? new Date().toISOString(),
    created_at: item.created_at,
  };
}
