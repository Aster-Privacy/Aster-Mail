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
export function storage_name_support(store: Map<string, unknown>) {
  return {
    encrypted_has: async (key: string) => store.has(key),
    encrypted_list_keys: async () => [...store.keys()],
    encrypted_set_if_absent: async (key: string, value: unknown) => {
      if (store.has(key)) return false;

      store.set(key, JSON.parse(JSON.stringify(value)));

      return true;
    },
    encrypted_move: async (from_key: string, to_key: string) => {
      if (!store.has(from_key)) return "missing";

      const kept = store.has(to_key);

      if (!kept) store.set(to_key, store.get(from_key));
      store.delete(from_key);

      return kept ? "kept_existing" : "moved";
    },
    encrypted_delete_where: async (matches: (key: string) => boolean) => {
      let removed = 0;

      for (const key of [...store.keys()]) {
        if (!matches(key)) continue;

        store.delete(key);
        removed += 1;
      }

      return removed;
    },
  };
}

export function stored_under(
  store: Map<string, unknown>,
  prefix: string,
): unknown[] {
  return [...store.entries()]
    .filter(([key]) => key.startsWith(prefix))
    .map(([, value]) => value);
}
