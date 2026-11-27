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
import {
  build_list_page_params,
  build_view_list_params,
  DEFAULT_PAGE_SIZE,
} from "@/hooks/email_list_helpers/views";
import { prefetch_mail_list } from "@/services/api/mail";
import { get_cached_preferences } from "@/services/api/preferences";
import { resolve_effective_page_size } from "@/lib/inbox_page_size";

const SYSTEM_VIEW_PATHS: Record<string, string> = {
  "/all": "all",
  "/starred": "starred",
  "/sent": "sent",
  "/scheduled": "scheduled",
  "/snoozed": "snoozed",
  "/archive": "archive",
  "/spam": "spam",
  "/trash": "trash",
};

export function startup_view_for_path(path: string): string | null {
  const system_view = SYSTEM_VIEW_PATHS[path];

  if (system_view) return system_view;
  if (path === "/" || path === "") return "inbox";

  for (const [prefix, view_prefix] of [
    ["/folder/", "folder-"],
    ["/tag/", "tag-"],
  ] as const) {
    if (!path.startsWith(prefix)) continue;

    const token = path.slice(prefix.length);

    if (!token || token.includes("/")) return null;

    try {
      return `${view_prefix}${decodeURIComponent(token)}`;
    } catch {
      return null;
    }
  }

  return null;
}

export function start_startup_list_prefetch(
  user_id: string,
  path: string,
): boolean {
  const view = startup_view_for_path(path);

  if (!view) return false;

  const preferences = get_cached_preferences();

  if (view === "inbox" && preferences?.inbox_categories_enabled !== false) {
    return false;
  }

  const limit = resolve_effective_page_size(
    preferences?.inbox_page_size,
    preferences?.low_network_mode,
    DEFAULT_PAGE_SIZE,
  );
  const params = build_list_page_params(view, build_view_list_params(view), {
    limit,
    offset: 0,
    conversation_grouping: preferences?.conversation_grouping ?? true,
    sort_order: preferences?.inbox_sort_order ?? "newest_first",
  });

  return prefetch_mail_list(user_id, params);
}
