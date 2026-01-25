import type { MailUserStatsResponse } from "@/services/api/mail";

import { useLayoutEffect, useRef } from "react";

import { use_mail_counts } from "./use_mail_counts";

import { use_auth } from "@/contexts/auth_context";

type ViewType =
  | "inbox"
  | "starred"
  | "sent"
  | "drafts"
  | "scheduled"
  | "snoozed"
  | "archive"
  | "spam"
  | "trash"
  | string;

interface DocumentTitleOptions {
  view?: ViewType;
  email_subject?: string;
  custom_title?: string;
}

const VIEW_LABELS: Record<string, string> = {
  inbox: "Inbox",
  all: "All Mail",
  starred: "Starred",
  sent: "Sent",
  drafts: "Drafts",
  scheduled: "Scheduled",
  snoozed: "Snoozed",
  archive: "Archive",
  spam: "Spam",
  trash: "Trash",
};

const VIEW_COUNT_KEYS: Record<string, string> = {
  inbox: "inbox",
  starred: "starred",
  sent: "sent",
  drafts: "drafts",
  scheduled: "scheduled",
  archive: "archived",
  spam: "spam",
  trash: "trash",
};

function get_view_label(view: string): string {
  if (view.startsWith("folder-")) {
    const folder_name = view.replace("folder-", "");

    return folder_name.charAt(0).toUpperCase() + folder_name.slice(1);
  }

  return VIEW_LABELS[view] || "Inbox";
}

function truncate_subject(subject: string, max_length: number = 60): string {
  if (subject.length <= max_length) return subject;

  return subject.substring(0, max_length - 3) + "...";
}

function format_workspace_name(name: string): string {
  const trimmed = name.trim();

  if (!trimmed) return "Aster Mail";

  const capitalized = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);

  return `${capitalized}'s Workspace | Aster Mail`;
}

function build_title(
  view: string,
  email_subject: string | undefined,
  custom_title: string | undefined,
  counts: MailUserStatsResponse,
  user_name: string,
): string {
  const workspace = format_workspace_name(user_name);

  if (custom_title) {
    return `${custom_title} | ${workspace}`;
  }

  if (email_subject) {
    return `${truncate_subject(email_subject)} | ${workspace}`;
  }

  const label = get_view_label(view);
  const count_key = VIEW_COUNT_KEYS[view] as keyof MailUserStatsResponse;
  const count = count_key ? ((counts[count_key] as number) ?? 0) : 0;

  return count > 0
    ? `(${count}) ${label} | ${workspace}`
    : `${label} | ${workspace}`;
}

export function use_document_title(options: DocumentTitleOptions = {}): void {
  const { view = "inbox", email_subject, custom_title } = options;
  const { counts } = use_mail_counts();
  const { user } = use_auth();
  const initialized = useRef(false);

  const user_name = user?.display_name || user?.username || "";
  const title = build_title(
    view,
    email_subject,
    custom_title,
    counts,
    user_name,
  );

  if (!initialized.current) {
    document.title = title;
    initialized.current = true;
  }

  useLayoutEffect(() => {
    document.title = title;
  }, [title]);
}
