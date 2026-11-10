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
import { ignore_error } from "@/lib/ignore_error";

export const WEB_SANDBOX_NOTICE_KEY = "aster_web_sandbox_notice_dismissed";

const CHOSEN_BY_USER = new Set(["forced_off", "disabled_by_environment"]);

export interface WebSandboxStatus {
  enabled: boolean;
  reason: string;
}

export function should_show_web_sandbox_notice(
  status: WebSandboxStatus | null,
  dismissed: boolean,
): boolean {
  if (!status || dismissed || status.enabled) return false;

  return !CHOSEN_BY_USER.has(status.reason);
}

export function is_web_sandbox_notice_dismissed(): boolean {
  try {
    return localStorage.getItem(WEB_SANDBOX_NOTICE_KEY) === "1";
  } catch {
    return false;
  }
}

export function dismiss_web_sandbox_notice(): void {
  try {
    localStorage.setItem(WEB_SANDBOX_NOTICE_KEY, "1");
  } catch (caught) {
    ignore_error("services/desktop/web_sandbox_status:dismiss", caught);
  }
}

function in_tauri(): boolean {
  if (typeof window === "undefined") return false;

  return Boolean(
    (window as unknown as { __TAURI_INTERNALS__?: unknown })
      .__TAURI_INTERNALS__,
  );
}

function parse_status(value: unknown): WebSandboxStatus | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;

  if (typeof record.enabled !== "boolean") return null;
  if (typeof record.reason !== "string") return null;

  return { enabled: record.enabled, reason: record.reason };
}

export async function fetch_web_sandbox_status(): Promise<WebSandboxStatus | null> {
  if (!in_tauri()) return null;
  try {
    const core = await import("@tauri-apps/api/core");

    return parse_status(await core.invoke("webkit_sandbox_status"));
  } catch (caught) {
    ignore_error("services/desktop/web_sandbox_status:fetch", caught);

    return null;
  }
}
