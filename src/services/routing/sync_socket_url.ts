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
import { connection_store } from "./connection_store";
import { is_relay_host_allowed } from "./cdn_relay_transport";

const NATIVE_API_URL = "https://app.astermail.org/api";

function to_socket_url(http_url: string): string {
  return http_url.replace(/^https:/, "wss:").replace(/^http:/, "ws:");
}

export function resolve_sync_socket_url(): string | null {
  if (connection_store.get_method() === "cdn_relay") {
    const relay_url = connection_store.get_cdn_relay_url();

    if (!relay_url || !is_relay_host_allowed(relay_url)) return null;

    return `${to_socket_url(relay_url.replace(/\/+$/, ""))}/ws`;
  }

  const is_native =
    typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
  const api_url = is_native
    ? NATIVE_API_URL
    : import.meta.env.VITE_API_URL || "";

  if (api_url.startsWith("http")) {
    return to_socket_url(api_url).replace(/\/api$/, "/ws");
  }

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";

  return `${protocol}//${window.location.host}/ws`;
}
