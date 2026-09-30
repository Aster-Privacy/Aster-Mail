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
import { complete_oauth_authorize } from "@/services/api/external_accounts";

export const DESKTOP_OAUTH_RETURN_TO = "aster://oauth/callback";
export const DESKTOP_OAUTH_CALLBACK_EVENT = "aster-oauth-callback";

const STATE_PATTERN = /^[0-9a-f]{64}$/;
const REASON_PATTERN = /^[a-z_]{1,64}$/;
const MAX_CODE_LENGTH = 2048;

export interface DesktopOAuthCallbackDetail {
  status: "success" | "error";
  provider?: string;
  reason?: string;
}

export interface ParsedOAuthCallback {
  state: string;
  code?: string;
  error?: string;
}

const handled_states = new Set<string>();

function is_desktop(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export function parse_oauth_callback_url(
  raw_url: string,
): ParsedOAuthCallback | null {
  if (!raw_url || !raw_url.startsWith(`${DESKTOP_OAUTH_RETURN_TO}?`)) {
    return null;
  }

  let parsed: URL;

  try {
    parsed = new URL(raw_url);
  } catch {
    return null;
  }

  if (
    parsed.protocol !== "aster:" ||
    parsed.host !== "oauth" ||
    parsed.pathname !== "/callback"
  ) {
    return null;
  }

  const state = parsed.searchParams.get("state") ?? "";

  if (!STATE_PATTERN.test(state)) return null;

  const error = parsed.searchParams.get("error");

  if (error !== null) {
    return { state, error: REASON_PATTERN.test(error) ? error : "unknown" };
  }

  const code = parsed.searchParams.get("code") ?? "";

  if (!code || code.length > MAX_CODE_LENGTH) return null;

  return { state, code };
}

function dispatch_callback(detail: DesktopOAuthCallbackDetail): void {
  window.dispatchEvent(
    new CustomEvent<DesktopOAuthCallbackDetail>(DESKTOP_OAUTH_CALLBACK_EVENT, {
      detail,
    }),
  );
}

export async function handle_oauth_callback_url(
  raw_url: string,
): Promise<void> {
  const parsed = parse_oauth_callback_url(raw_url);

  if (!parsed) return;
  if (handled_states.has(parsed.state)) return;
  handled_states.add(parsed.state);

  if (parsed.error !== undefined) {
    dispatch_callback({ status: "error", reason: parsed.error });

    return;
  }

  const result = await complete_oauth_authorize(
    parsed.state,
    parsed.code ?? "",
  );

  if (result.data?.success) {
    dispatch_callback({ status: "success", provider: result.data.provider });

    return;
  }

  const reason =
    result.data?.reason ??
    (result.server_code === "OAUTH_WRONG_ACCOUNT"
      ? "wrong_account"
      : "unknown");

  dispatch_callback({ status: "error", reason });
}

export async function start_desktop_oauth_bridge(): Promise<void> {
  if (!is_desktop()) return;
  try {
    const { onOpenUrl } = await import("@tauri-apps/plugin-deep-link");

    await onOpenUrl((urls) => {
      for (const url of urls) {
        void handle_oauth_callback_url(url);
      }
    });
  } catch {
    if (import.meta.env.DEV) {
      console.error("desktop oauth bridge unavailable");
    }
  }
}
