export interface EmailSender {
  name: string;
  email: string;
  avatar_url?: string;
}

export interface EmailAttachment {
  id?: string;
  name: string;
  size: string;
  mime_type?: string;
}

export interface EmailLabel {
  id: string;
  name: string;
  color: string;
}

export interface UnsubscribeInfo {
  has_unsubscribe: boolean;
  unsubscribe_link?: string;
  list_unsubscribe_header?: string;
  list_unsubscribe_post?: string;
  unsubscribe_mailto?: string;
  method: "link" | "mailto" | "one-click" | "none";
}

export interface Email {
  id: string;
  sender: EmailSender;
  subject: string;
  preview: string;
  body?: string;
  html_content?: string;
  timestamp: string;
  is_read: boolean;
  is_starred: boolean;
  is_pinned: boolean;
  is_archived: boolean;
  has_attachment: boolean;
  attachments?: EmailAttachment[];
  labels?: EmailLabel[];
  thread_id?: string;
  in_reply_to?: string;
  unsubscribe_info?: UnsubscribeInfo;
}

export interface EmailThread {
  id: string;
  emails: Email[];
  participant_count: number;
  last_activity: string;
}

export interface DecryptedEmail extends Email {
  body: string;
  html_content?: string;
  replies?: EmailReply[];
}

export interface EmailReply {
  id: string;
  sender: EmailSender;
  timestamp: string;
  body: string;
  attachments?: EmailAttachment[];
}

export interface EmailFilter {
  type: "all" | "read" | "unread" | "attachments" | "starred";
}

export type EmailCategory =
  | "primary"
  | "social"
  | "promotions"
  | "updates"
  | "forums";

export const EMAIL_CATEGORY_STYLES: Record<EmailCategory, string> = {
  primary:
    "bg-slate-100 text-slate-700 border border-slate-300 dark:bg-slate-900/30 dark:text-slate-400 dark:border-slate-500",
  social:
    "bg-blue-100 text-blue-700 border border-blue-300 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-500",
  promotions:
    "bg-green-100 text-green-700 border border-green-300 dark:bg-green-900/30 dark:text-green-400 dark:border-green-500",
  updates:
    "bg-amber-100 text-amber-700 border border-amber-300 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-500",
  forums:
    "bg-purple-100 text-purple-700 border border-purple-300 dark:bg-purple-900/30 dark:text-purple-400 dark:border-purple-500",
};

export const EMAIL_CATEGORY_LABELS: Record<EmailCategory, string> = {
  primary: "Primary",
  social: "Social",
  promotions: "Promotions",
  updates: "Updates",
  forums: "Forums",
};

export const EMAIL_CATEGORY_ICONS: Record<EmailCategory, string> = {
  primary: "inbox",
  social: "users",
  promotions: "tag",
  updates: "bell",
  forums: "message-square",
};

export interface CategoryMetadata {
  category: EmailCategory;
  confidence: number;
  classified_at: number;
  user_override: boolean;
  version: number;
}

export function create_empty_email(id: string): Email {
  return {
    id,
    sender: { name: "", email: "" },
    subject: "",
    preview: "",
    timestamp: new Date().toISOString(),
    is_read: false,
    is_starred: false,
    is_pinned: false,
    is_archived: false,
    has_attachment: false,
  };
}

export type MailItemType =
  | "received"
  | "sent"
  | "draft"
  | "scheduled"
  | "outbox";

export interface InboxEmailFolder {
  folder_token: string;
  name: string;
  color?: string;
  icon?: string;
}

export interface InboxEmailTag {
  id: string;
  name: string;
  color?: string;
  icon?: string;
  variant?: string;
}

export type InboxEmailLabel = InboxEmailFolder;

export interface InboxEmail {
  id: string;
  item_type: MailItemType;
  sender_name: string;
  sender_email: string;
  subject: string;
  preview: string;
  timestamp: string;
  raw_timestamp?: string;
  is_pinned: boolean;
  is_starred: boolean;
  is_selected: boolean;
  is_read: boolean;
  is_trashed: boolean;
  is_archived: boolean;
  is_spam: boolean;
  has_attachment: boolean;
  category: string;
  category_color: string;
  avatar_url: string;
  is_encrypted?: boolean;
  labels?: InboxEmailLabel[];
  folders?: InboxEmailFolder[];
  tags?: InboxEmailTag[];
  snoozed_until?: string;
  thread_token?: string;
  thread_message_count?: number;
  encrypted_metadata?: string;
  metadata_nonce?: string;
  metadata_version?: number;
  email_category?: EmailCategory;
  category_confidence?: number;
  category_user_override?: boolean;
}

export interface MailItemMetadata {
  is_read: boolean;
  is_starred: boolean;
  is_pinned: boolean;
  is_trashed: boolean;
  is_archived: boolean;
  is_spam: boolean;
  size_bytes: number;
  has_attachments: boolean;
  attachment_count: number;
  scheduled_at?: string;
  send_status?: string;
  snoozed_until?: string;
  trashed_at?: string;
  message_ts: string;
  item_type: string;
  email_category?: EmailCategory;
  category_confidence?: number;
  category_user_override?: boolean;
  category_classified_at?: number;
}

export interface DecryptedEnvelope {
  subject: string;
  body_text: string;
  from: { name: string; email: string };
  to: { name: string; email: string }[];
  cc: { name: string; email: string }[];
  bcc: { name: string; email: string }[];
  sent_at: string;
}

export type InboxFilterType = "all" | "read" | "unread" | "attachments";

export interface ContextMenuState {
  x: number;
  y: number;
  email: InboxEmail;
}

export interface EmailListState {
  emails: InboxEmail[];
  is_loading: boolean;
  total_messages: number;
}

export interface ConfirmationDialogState {
  show_delete: boolean;
  show_archive: boolean;
  skip_delete: boolean;
  skip_archive: boolean;
}
