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
import { useSyncExternalStore } from "react";

const PAGE_SEARCH_ROUTES = new Set(["/contacts", "/subscriptions"]);

let current_query = "";
const listeners = new Set<() => void>();

export function is_page_search_route(pathname: string): boolean {
  return PAGE_SEARCH_ROUTES.has(pathname);
}

export function set_page_search(next: string): void {
  if (next === current_query) return;
  current_query = next;
  for (const listener of listeners) listener();
}

function get_page_search(): string {
  return current_query;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

export function use_page_search(): string {
  return useSyncExternalStore(subscribe, get_page_search, get_page_search);
}
