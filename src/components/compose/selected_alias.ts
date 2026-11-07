//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
import { alias_address_of } from "@/hooks/email_list_helpers/alias_view";

const ALIAS_PATH_PREFIX = "/alias/";
const EMAIL_PATH_PREFIX = "/email/";

function decode_segment(segment: string): string | null {
  try {
    const decoded = decodeURIComponent(segment).trim();

    return decoded.length > 0 ? decoded : null;
  } catch {
    return null;
  }
}

function from_view_of(state: unknown): string | null {
  if (!state || typeof state !== "object") return null;
  const view = (state as { from_view?: unknown }).from_view;

  return typeof view === "string" ? view : null;
}

export function selected_alias_from_location(
  pathname: string,
  state?: unknown,
): string | null {
  if (pathname.startsWith(ALIAS_PATH_PREFIX)) {
    const segment = pathname.slice(ALIAS_PATH_PREFIX.length).split("/")[0];

    return decode_segment(segment);
  }

  if (pathname.startsWith(EMAIL_PATH_PREFIX)) {
    const view = from_view_of(state);
    const address = view ? alias_address_of(view)?.trim() : null;

    return address ? address : null;
  }

  return null;
}

export interface compose_draft_marker {
  id?: string | null;
  draft_type?: string | null;
}

export function compose_selected_alias(
  enabled: boolean | undefined,
  edit_draft: compose_draft_marker | null | undefined,
  selected_alias: string | null | undefined,
): string | null {
  if (enabled !== true) return null;
  if (edit_draft?.id) return null;
  if (edit_draft && edit_draft.draft_type !== "new") return null;

  return selected_alias?.trim() || null;
}
