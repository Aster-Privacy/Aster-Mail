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
import { is_handoff_grant_id } from "@/lib/session_handoff/session_handoff_protocol";
import { safe_session_set } from "@/lib/safe_storage";
import { has_tauri_runtime } from "@/lib/tauri_runtime";

export const HANDOFF_GRANT_HASH_PREFIX = "#handoff=";
export const PENDING_GRANT_KEY = "aster_session_handoff_grant";

export function strip_handoff_hash(): string | null {
  if (typeof window === "undefined") return null;

  const { hash, pathname, search } = window.location;

  if (!hash.startsWith(HANDOFF_GRANT_HASH_PREFIX)) return null;

  try {
    window.history.replaceState(window.history.state, "", pathname + search);
  } catch {
    window.location.hash = "";
  }

  const grant = hash.slice(HANDOFF_GRANT_HASH_PREFIX.length);

  return is_handoff_grant_id(grant) ? grant : null;
}

export function capture_handoff_grant(): void {
  if (typeof window === "undefined") return;
  if (has_tauri_runtime()) return;

  const grant = strip_handoff_hash();

  if (grant) safe_session_set(PENDING_GRANT_KEY, grant);
}
