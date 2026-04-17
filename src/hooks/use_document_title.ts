//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the AGPLv3 as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// AGPLv3 for more details.
//
// You should have received a copy of the AGPLv3
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
import { useLayoutEffect, useRef } from "react";

import { use_mail_stats, type MailStats } from "./use_mail_stats";
import { use_folders, type DecryptedFolder } from "./use_folders";

import { use_auth_safe } from "@/contexts/auth_context";
import { use_i18n } from "@/lib/i18n/context";

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

const VIEW_COUNT_KEYS: Record<string, keyof MailStats> = {
  inbox: "unread",
  starred: "starred",
  sent: "sent",
  drafts: "drafts",
  scheduled: "scheduled",
  snoozed: "snoozed",
  archive: "archived",
  spam: "spam",
  trash: "trash",
};

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

function get_view_label(
  view: string,
  folders: DecryptedFolder[],
  view_labels: Record<string, string>,
  folder_fallback: string,
  inbox_fallback: string,
): string {
  if (view.startsWith("folder-")) {
    const folder_token = view.replace("folder-", "");
    const folder = folders.find((f) => f.folder_token === folder_token);

    return folder?.name || folder_fallback;
  }

  return view_labels[view] || inbox_fallback;
}

function build_title(
  view: string,
  email_subject: string | undefined,
  custom_title: string | undefined,
  counts: MailStats,
  user_name: string,
  folders: DecryptedFolder[],
  view_labels: Record<string, string>,
  folder_fallback: string,
  inbox_fallback: string,
): string {
  const workspace = format_workspace_name(user_name);

  if (custom_title) {
    return `${custom_title} | ${workspace}`;
  }

  if (email_subject) {
    return `${truncate_subject(email_subject)} | ${workspace}`;
  }

  const label = get_view_label(
    view,
    folders,
    view_labels,
    folder_fallback,
    inbox_fallback,
  );
  const count_key = VIEW_COUNT_KEYS[view];
  const count = count_key ? (counts[count_key] ?? 0) : 0;

  return count > 0
    ? `(${count}) ${label} | ${workspace}`
    : `${label} | ${workspace}`;
}

export function use_document_title(options: DocumentTitleOptions = {}): void {
  const { view = "inbox", email_subject, custom_title } = options;
  const { t } = use_i18n();
  const { stats: counts } = use_mail_stats();
  const auth = use_auth_safe();
  const user = auth?.user ?? null;
  const { state: folder_state } = use_folders();
  const initialized = useRef(false);

  const view_labels: Record<string, string> = {
    inbox: t("mail.inbox"),
    all: t("mail.all_mail"),
    starred: t("mail.starred"),
    sent: t("mail.sent"),
    drafts: t("mail.drafts"),
    scheduled: t("mail.scheduled"),
    snoozed: t("mail.snoozed"),
    archive: t("mail.archive"),
    spam: t("mail.spam"),
    trash: t("mail.trash"),
  };

  const user_name = user?.display_name || user?.username || "";
  const title = build_title(
    view,
    email_subject,
    custom_title,
    counts,
    user_name,
    folder_state.folders,
    view_labels,
    t("common.folder_label"),
    t("mail.inbox"),
  );

  if (!initialized.current) {
    document.title = title;
    initialized.current = true;
  }

  useLayoutEffect(() => {
    document.title = title;
  }, [title]);
}
