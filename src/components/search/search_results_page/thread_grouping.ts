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
import type { InboxEmail } from "@/types/email";

import { group_emails_by_thread } from "@/hooks/email_list_helpers";

export interface ThreadableResult {
  id: string;
  thread_token?: string;
  thread_message_count?: number;
  grouped_email_ids?: string[];
}

export function group_search_results<T extends ThreadableResult>(
  results: T[],
  conversation_grouping: boolean,
): T[] {
  if (!conversation_grouping) return results;

  return group_emails_by_thread(
    results as unknown as InboxEmail[],
  ) as unknown as T[];
}

export function expand_thread_ids<T extends ThreadableResult>(
  results: T[],
  ids: string[],
): string[] {
  const members = new Map<string, string[]>();

  for (const result of results) {
    if ((result.grouped_email_ids?.length ?? 0) > 1) {
      members.set(result.id, result.grouped_email_ids as string[]);
    }
  }

  const expanded = new Set<string>();

  for (const id of ids) {
    const group = members.get(id);

    if (group) {
      for (const member of group) expanded.add(member);
    } else {
      expanded.add(id);
    }
  }

  return Array.from(expanded);
}
