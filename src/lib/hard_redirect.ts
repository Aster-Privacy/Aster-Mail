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

// The desktop build serves a static bundle and routes via HashRouter, so a
// path-based location change to "/sign-in" resolves to a missing asset and
// paints nothing over the dark window background. Routes there live in the
// fragment, so the path must be moved into the hash before reloading.
function uses_hash_router(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export function hard_redirect(path: string): void {
  if (uses_hash_router() && path.startsWith("/")) {
    const base = window.location.href.split("#")[0];

    window.location.replace(`${base}#${path}`);
    window.location.reload();

    return;
  }

  window.location.replace(path);
}

export function get_app_query_param(name: string): string | null {
  const from_search = new URLSearchParams(window.location.search).get(name);

  if (from_search != null) return from_search;

  const hash = window.location.hash;
  const query_index = hash.indexOf("?");

  if (query_index === -1) return null;

  return new URLSearchParams(hash.slice(query_index + 1)).get(name);
}
