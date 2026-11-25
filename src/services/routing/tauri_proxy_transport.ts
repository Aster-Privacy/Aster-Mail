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

import { has_tauri_runtime } from "@/lib/tauri_runtime";

export function is_tauri_env(): boolean {
  return has_tauri_runtime();
}

interface ProxyResponse {
  status: number;
  body: string;
  headers: Record<string, string>;
}

type Base64Decoder = (value: string) => Uint8Array;

export function decode_base64_body(value: string): Uint8Array {
  const native = (Uint8Array as unknown as { fromBase64?: Base64Decoder })
    .fromBase64;

  if (typeof native === "function") return native.call(Uint8Array, value);

  const binary = atob(value);
  const decoded = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    decoded[index] = binary.charCodeAt(index);
  }

  return decoded;
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

    throw new TypeError("device request body must be text");
  })();

  const result = await invoke<ProxyResponse>("device_http_request", {
    url,
    method: options.method || "GET",
    body,
    headers: Object.keys(headers_map).length > 0 ? headers_map : null,
  });

  let bytes: Uint8Array;

  try {
    bytes = result.body ? decode_base64_body(result.body) : new Uint8Array(0);
  } catch {
    return new Response(null, { status: 500 });
  }

  const body_forbidden =
    result.status === 204 || result.status === 205 || result.status === 304;

  return new Response(body_forbidden ? null : bytes, {
    status: result.status,
    headers: result.headers,
  });
}
