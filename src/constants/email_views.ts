import type { Email } from "@/types/email";

export type EmailView =
  | "inbox"
  | "starred"
  | "sent"
  | "drafts"
  | "scheduled"
  | "archive"
  | "spam"
  | "trash"
  | "folder-marketing"
  | "folder-finance"
  | "folder-operation";

interface ViewConfig {
  title: string;
  filter: (email: Email) => boolean;
  empty_message: string;
  icon?: string;
}

export const EMAIL_VIEW_CONFIG: Record<EmailView, ViewConfig> = {
  inbox: {
    title: "Inbox",
    filter: () => true,
    empty_message: "Your inbox is empty",
  },
  starred: {
    title: "Starred",
    filter: (e) => e.is_starred,
    empty_message: "No starred messages",
  },
  sent: {
    title: "Sent",
    filter: () => false,
    empty_message: "No sent messages",
  },
  drafts: {
    title: "Drafts",
    filter: () => false,
    empty_message: "No drafts",
  },
  scheduled: {
    title: "Scheduled",
    filter: () => false,
    empty_message: "No scheduled messages",
  },
  archive: {
    title: "Archive",
    filter: (e) => e.is_archived,
    empty_message: "No archived messages",
  },
  spam: {
    title: "Spam",
    filter: () => false,
    empty_message: "No spam messages",
  },
  trash: {
    title: "Trash",
    filter: () => false,
    empty_message: "Trash is empty",
  },
  "folder-marketing": {
    title: "Marketing",
    filter: (e) =>
      e.labels?.some((l) => l.name.toLowerCase() === "marketing") ?? false,
    empty_message: "No marketing messages",
  },
  "folder-finance": {
    title: "Finance",
    filter: (e) =>
      e.labels?.some((l) => l.name.toLowerCase() === "finance") ?? false,
    empty_message: "No finance messages",
  },
  "folder-operation": {
    title: "Operation",
    filter: (e) =>
      e.labels?.some((l) => l.name.toLowerCase() === "operation") ?? false,
    empty_message: "No operation messages",
  },
};

export function get_view_config(view: string): ViewConfig {
  const normalized_view = (view || "inbox") as EmailView;

  return EMAIL_VIEW_CONFIG[normalized_view] || EMAIL_VIEW_CONFIG.inbox;
}

export function filter_emails_by_view(emails: Email[], view: string): Email[] {
  const config = get_view_config(view);

  return emails.filter(config.filter);
}

export type EmailFilterType = "all" | "read" | "unread" | "attachments";

export function filter_emails_by_type(
  emails: Email[],
  filter_type: EmailFilterType,
): Email[] {
  switch (filter_type) {
    case "read":
      return emails.filter((e) => e.is_read);
    case "unread":
      return emails.filter((e) => !e.is_read);
    case "attachments":
      return emails.filter((e) => e.has_attachment);
    default:
      return emails;
  }
}
