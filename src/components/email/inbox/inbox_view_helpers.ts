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
import type { InboxEmail, InboxFilterType } from "@/types/email";
import type { DecryptedFolder } from "@/hooks/use_folders";
import type { TranslationKey } from "@/lib/i18n/types";

export function get_view_title(
  current_view: string,
  folders: DecryptedFolder[],
  tags?: { tag_token: string; name: string }[],
  t?: (key: TranslationKey) => string,
): string {
  const static_titles: Record<string, string> = {
    all: t ? t("mail.all_mail") : "All Mail",
    starred: t ? t("mail.starred") : "Starred",
    sent: t ? t("mail.sent") : "Sent",
    drafts: t ? t("mail.drafts") : "Drafts",
    scheduled: t ? t("mail.scheduled") : "Scheduled",
    snoozed: t ? t("mail.snoozed") : "Snoozed",
    archive: t ? t("mail.archive") : "Archive",
    spam: t ? t("mail.spam") : "Spam",
    trash: t ? t("mail.trash") : "Trash",
  };

  if (current_view.startsWith("folder-")) {
    const folder_token = current_view.replace("folder-", "");
    const folder = folders.find((f) => f.folder_token === folder_token);

    return folder?.name || (t ? t("mail.folder") : "Folder");
  }

  if (current_view.startsWith("tag-")) {
    const tag_token = current_view.replace("tag-", "");
    const tag = tags?.find((t) => t.tag_token === tag_token);

    return tag?.name || (t ? t("mail.label") : "Label");
  }

  if (current_view.startsWith("alias-")) {
    return current_view.replace("alias-", "");
  }

  return static_titles[current_view] || (t ? t("mail.inbox") : "Inbox");
}

export function get_search_context(
  current_view: string,
  folders: DecryptedFolder[],
  tags?: { tag_token: string; name: string }[],
): string | undefined {
  if (current_view.startsWith("folder-")) {
    const folder_token = current_view.replace("folder-", "");
    const folder = folders.find((f) => f.folder_token === folder_token);

    return folder ? `folder:${folder.name}` : undefined;
  }

  if (current_view.startsWith("tag-")) {
    const tag_token = current_view.replace("tag-", "");
    const tag = tags?.find((t) => t.tag_token === tag_token);

    return tag ? `label:${tag.name}` : undefined;
  }

  return undefined;
}

export function filter_emails_by_view(
  emails: InboxEmail[],
  _current_view: string,
): InboxEmail[] {
  if (_current_view.startsWith("alias-")) {
    const alias_address = _current_view.replace("alias-", "").toLowerCase();

    return emails.filter(
      (e) =>
        e.sender_email.toLowerCase() === alias_address ||
        (e.recipient_addresses &&
          e.recipient_addresses.some(
            (addr) => addr.toLowerCase() === alias_address,
          )),
    );
  }

  return emails;
}

export function apply_active_filter(
  emails: InboxEmail[],
  filter: InboxFilterType,
): InboxEmail[] {
  switch (filter) {
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
