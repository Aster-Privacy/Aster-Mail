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
import type { TorFetchResponse } from "./types";

function is_tauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function is_capacitor(): boolean {
  return (
    typeof window !== "undefined" &&
    "Capacitor" in window &&
    (window as Record<string, unknown>).Capacitor !== undefined
  );
}

export function is_tor_available(): boolean {
  if (is_tauri()) return true;

  if (is_capacitor()) {
    try {
      const capacitor = (window as unknown as Record<string, unknown>)
        .Capacitor as {
        Plugins?: Record<string, unknown>;
      };

      return !!capacitor?.Plugins?.TorPlugin;
    } catch {
      return false;
    }
  }

  return false;
}

export async function tor_fetch(
  url: string,
  options: RequestInit,
): Promise<Response> {
  if (is_tauri()) {
    return tauri_tor_fetch(url, options);
  }

  if (is_capacitor()) {
    return capacitor_tor_fetch(url, options);
  }

  throw new Error("Tor transport is not available on this platform");
}

async function tauri_tor_fetch(
  url: string,
  options: RequestInit,
): Promise<Response> {
  const { invoke } = await import("@tauri-apps/api/core");

  const headers_obj: Record<string, string> = {};

  if (options.headers) {
    const h = new Headers(options.headers);

    h.forEach((value, key) => {
      headers_obj[key] = value;
    });
  }

  const result = await invoke<TorFetchResponse>("tor_fetch", {
    url,
    method: options.method || "GET",
    headers: headers_obj,
    body: typeof options.body === "string" ? options.body : undefined,
  });

  return new Response(result.body, {
    status: result.status,
    headers: new Headers(result.headers),
  });
}

async function capacitor_tor_fetch(
  url: string,
  options: RequestInit,
): Promise<Response> {
  const { Plugins } = await import("@capacitor/core");
  const tor_plugin = (Plugins as Record<string, unknown>)["TorPlugin"] as
    | {
        fetch: (options: {
          url: string;
          method: string;
          headers: Record<string, string>;
          body?: string;
        }) => Promise<TorFetchResponse>;
      }
    | undefined;

  if (!tor_plugin?.fetch) {
    throw new Error("Tor is only available in the native app");
  }

  const headers_obj: Record<string, string> = {};

  if (options.headers) {
    const h = new Headers(options.headers);

    h.forEach((value, key) => {
      headers_obj[key] = value;
    });
  }

  const result = await tor_plugin.fetch({
    url,
    method: options.method || "GET",
    headers: headers_obj,
    body: typeof options.body === "string" ? options.body : undefined,
  });

  return new Response(result.body, {
    status: result.status,
    headers: new Headers(result.headers),
  });
}

export async function tor_start(use_snowflake: boolean): Promise<void> {
  if (is_tauri()) {
    const { invoke } = await import("@tauri-apps/api/core");

    await invoke("tor_start", { config: { use_snowflake } });

    return;
  }

  if (is_capacitor()) {
    const { Plugins } = await import("@capacitor/core");
    const tor_plugin = (Plugins as Record<string, unknown>)["TorPlugin"] as
      | {
          start: (options: {
            snowflake?: boolean;
          }) => Promise<{ status: string }>;
        }
      | undefined;

    if (!tor_plugin?.start) {
      return;
    }

    await tor_plugin.start({ snowflake: use_snowflake });

    return;
  }
}

export async function tor_stop(): Promise<void> {
  if (is_tauri()) {
    const { invoke } = await import("@tauri-apps/api/core");

    await invoke("tor_stop");

    return;
  }

  if (is_capacitor()) {
    const { Plugins } = await import("@capacitor/core");
    const tor_plugin = (Plugins as Record<string, unknown>)["TorPlugin"] as
      | { stop: () => Promise<void> }
      | undefined;

    if (tor_plugin?.stop) {
      await tor_plugin.stop();
    }

    return;
  }
}

export async function tor_status(): Promise<{
  status: string;
  is_connected: boolean;
}> {
  if (is_tauri()) {
    const { invoke } = await import("@tauri-apps/api/core");

    return invoke("tor_status");
  }

  if (is_capacitor()) {
    const { Plugins } = await import("@capacitor/core");
    const tor_plugin = (Plugins as Record<string, unknown>)["TorPlugin"] as
      | { status: () => Promise<{ status: string; is_connected: boolean }> }
      | undefined;

    if (tor_plugin?.status) {
      return tor_plugin.status();
    }
  }

  return { status: "unavailable", is_connected: false };
}
