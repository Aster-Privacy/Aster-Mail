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
import type { MailItemUpdatedEventDetail } from "./mail_events";

export function compute_should_remove_from_view(
  detail: MailItemUpdatedEventDetail,
  current_view: string,
): boolean {
  const is_non_trash_spam_view =
    current_view !== "trash" && current_view !== "spam";

  if (is_non_trash_spam_view) {
    if (detail.is_trashed === true || detail.is_spam === true) {
      return true;
    }
  }

  const is_folder_like_view =
    current_view.startsWith("folder-") ||
    current_view.startsWith("tag-") ||
    current_view.startsWith("alias-");

  if (
    current_view !== "archive" &&
    current_view !== "all" &&
    !is_folder_like_view &&
    detail.is_archived === true
  ) {
    return true;
  }

  switch (current_view) {
    case "starred":
      return detail.is_starred === false;
    case "trash":
      return detail.is_trashed === false;
    case "archive":
      return detail.is_archived === false;
    case "spam":
      return detail.is_spam === false;
    default:
      if (
        (current_view === "inbox" || current_view === "") &&
        detail.folders !== undefined &&
        detail.folders.length > 0
      ) {
        return true;
      }

      if (current_view.startsWith("folder-") && detail.folders !== undefined) {
        const folder_token = current_view.replace("folder-", "");

        return !detail.folders.some((f) => f.folder_token === folder_token);
      }

      if (current_view.startsWith("tag-") && detail.tags !== undefined) {
        const tag_token = current_view.replace("tag-", "");

        return !detail.tags.some((t) => t.id === tag_token);
      }

      return false;
  }
}

export function destination_views_for_update(
  detail: MailItemUpdatedEventDetail,
): string[] {
  const views: string[] = [];

  if (detail.is_trashed === true) views.push("trash");
  if (detail.is_archived === true) views.push("archive");
  if (detail.is_spam === true) views.push("spam");
  if (detail.is_starred === true) views.push("starred");
  if (
    detail.is_trashed === false ||
    detail.is_spam === false ||
    detail.is_archived === false
  ) {
    views.push("inbox", "", "all");
  }
  if (detail.folders !== undefined) {
    for (const folder of detail.folders) {
      views.push(`folder-${folder.folder_token}`);
    }
  }
  if (detail.tags !== undefined) {
    for (const tag of detail.tags) {
      views.push(`tag-${tag.id}`);
    }
  }

  return views;
}
