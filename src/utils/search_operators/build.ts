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
import type {} from "@/lib/i18n/types";

export function build_query_from_filters(filters: {
  from?: string;
  to?: string;
  subject?: string;
  has_attachments?: boolean;
  is_read?: boolean;
  is_starred?: boolean;
  folder?: string;
  date_from?: string;
  date_to?: string;
  labels?: string[];
}): string {
  const parts: string[] = [];

  if (filters.from) {
    parts.push(
      `from:${filters.from.includes(" ") ? `"${filters.from}"` : filters.from}`,
    );
  }

  if (filters.to) {
    parts.push(
      `to:${filters.to.includes(" ") ? `"${filters.to}"` : filters.to}`,
    );
  }

  if (filters.subject) {
    parts.push(
      `subject:${filters.subject.includes(" ") ? `"${filters.subject}"` : filters.subject}`,
    );
  }

  if (filters.has_attachments) {
    parts.push("has:attachment");
  }

  if (filters.is_read === false) {
    parts.push("is:unread");
  } else if (filters.is_read === true) {
    parts.push("is:read");
  }

  if (filters.is_starred === true) {
    parts.push("is:starred");
  } else if (filters.is_starred === false) {
    parts.push("is:unstarred");
  }

  if (filters.folder) {
    parts.push(`in:${filters.folder}`);
  }

  if (filters.date_from) {
    parts.push(`after:${filters.date_from}`);
  }

  if (filters.date_to) {
    parts.push(`before:${filters.date_to}`);
  }

  if (filters.labels) {
    for (const label of filters.labels) {
      parts.push(`label:${label.includes(" ") ? `"${label}"` : label}`);
    }
  }

  return parts.join(" ");
}
