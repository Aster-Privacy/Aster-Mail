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

import { ignore_error } from "@/lib/ignore_error";

export type PurgedMailScope = "trash" | "spam";

export interface PurgedMail {
  ids?: string[];
  scope?: PurgedMailScope;
}

export function is_expired_mail(
  item: { expires_at?: string },
  now: number = Date.now(),
): boolean {
  if (!item.expires_at) return false;

  const expires = Date.parse(item.expires_at);

  return Number.isFinite(expires) && expires <= now;
}

export function request_search_index_check(): void {
  void import("@/hooks/use_search/index_cache")
    .then((index_cache) => index_cache.request_index_reconcile())
    .catch((caught) =>
      ignore_error(
        "services/search/index_removals:request_search_index_check",
        caught,
      ),
    );
}

export function note_bulk_mail_removed(): void {
  void import("@/hooks/use_search/index_cache")
    .then((index_cache) => index_cache.force_index_reconcile())
    .catch((caught) =>
      ignore_error(
        "services/search/index_removals:note_bulk_mail_removed",
        caught,
      ),
    );
}

export function note_purged_mail(purge: PurgedMail): void {
  if (!purge.scope && !(purge.ids && purge.ids.length > 0)) return;

  void import("@/hooks/use_search/index_cache")
    .then((index_cache) => index_cache.purge_search_index(purge))
    .catch((caught) =>
      ignore_error("services/search/index_removals:note_purged_mail", caught),
    );
}
