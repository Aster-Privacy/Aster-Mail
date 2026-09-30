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
  safe_local_get,
  safe_local_remove,
  safe_local_set,
} from "@/lib/safe_storage";

const LS_KEY = (account_id: string) => `aster:expanded_folders:${account_id}`;
const MAX_EXPANDED_FOLDERS = 500;
const TOKEN_PATTERN = /^[A-Za-z0-9+/=_-]{1,128}$/;

const expanded_state = new Map<string, Set<string>>();
const listeners = new Set<() => void>();

function read_stored_tokens(account_id: string): Set<string> {
  if (!account_id) return new Set();

  const raw = safe_local_get(LS_KEY(account_id));

  if (!raw) return new Set();

  try {
    const parsed: unknown = JSON.parse(raw);

    if (!Array.isArray(parsed)) return new Set();

    return new Set(
      parsed
        .filter(
          (token): token is string =>
            typeof token === "string" && TOKEN_PATTERN.test(token),
        )
        .slice(0, MAX_EXPANDED_FOLDERS),
    );
  } catch {
    return new Set();
  }
}

export function get_expanded_folders(account_id: string): Set<string> {
  const cached = expanded_state.get(account_id);

  if (cached) return cached;

  const tokens = read_stored_tokens(account_id);

  expanded_state.set(account_id, tokens);

  return tokens;
}

export function set_expanded_folders(
  account_id: string,
  tokens: Set<string>,
): void {
  const next = new Set([...tokens].slice(-MAX_EXPANDED_FOLDERS));

  expanded_state.set(account_id, next);

  if (account_id) {
    if (next.size === 0) {
      safe_local_remove(LS_KEY(account_id));
    } else {
      safe_local_set(LS_KEY(account_id), JSON.stringify([...next]));
    }
  }

  for (const listener of listeners) listener();
}

export function subscribe_expanded_folders(listener: () => void): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

export function clear_expanded_folders(account_id: string): void {
  expanded_state.delete(account_id);
  safe_local_remove(LS_KEY(account_id));
  for (const listener of listeners) listener();
}
