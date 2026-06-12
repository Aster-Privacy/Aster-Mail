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

export function is_tauri_env(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

interface ProxyResponse {
  status: number;
  body: string;
  headers: Record<string, string>;
}

export async function tauri_proxy_fetch(
  url: string,
  options: RequestInit,
): Promise<Response> {
  const { invoke } = await import("@tauri-apps/api/core");

  const headers_map: Record<string, string> = {};

  if (options.headers) {
    const h = new Headers(options.headers);
    h.forEach((v, k) => {
      headers_map[k] = v;
    });
  }

  const body = (() => {
    const b = options.body;
    if (b == null) return null;
    if (typeof b === "string") return b;
    if (b instanceof URLSearchParams) return b.toString();
    return String(b);
  })();

  const result = await invoke<ProxyResponse>("device_http_request", {
    url,
    method: options.method || "GET",
    body,
    headers: Object.keys(headers_map).length > 0 ? headers_map : null,
  });

  let bytes: Uint8Array;
  try {
    bytes = result.body
      ? Uint8Array.from(atob(result.body), (c) => c.charCodeAt(0))
      : new Uint8Array(0);
  } catch {
    return new Response(null, { status: 500 });
  }

  return new Response(bytes, {
    status: result.status,
    headers: result.headers,
  });
}
