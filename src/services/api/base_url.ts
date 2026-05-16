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
import { Capacitor } from "@capacitor/core";

const NATIVE_API_BASE_URL = "https://app.astermail.org/api";
const NATIVE_WS_BASE_URL = "wss://app.astermail.org/ws";

export function is_native_app(): boolean {
  return (
    Capacitor.isNativePlatform() ||
    (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window)
  );
}

export function get_api_base_url(): string {
  if (is_native_app()) {
    return NATIVE_API_BASE_URL;
  }

  const configured = import.meta.env.VITE_API_URL;

  if (configured) {
    return configured;
  }

  if (typeof window !== "undefined" && window.location?.origin) {
    return `${window.location.origin}/api`;
  }

  return "/api";
}

export function get_ws_base_url(): string {
  if (is_native_app()) {
    return NATIVE_WS_BASE_URL;
  }

  const configured = import.meta.env.VITE_API_URL;

  if (configured && /^https?:/i.test(configured)) {
    return configured
      .replace(/^https:/i, "wss:")
      .replace(/^http:/i, "ws:")
      .replace(/\/api\/?$/i, "/ws");
  }

  if (typeof window !== "undefined" && window.location?.host) {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";

    return `${protocol}//${window.location.host}/ws`;
  }

  return "/ws";
}
