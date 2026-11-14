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
export interface LaunchAtLoginStatus {
  supported: boolean;
  enabled: boolean;
  start_minimized: boolean;
  needs_install: boolean;
}

const UNSUPPORTED: LaunchAtLoginStatus = {
  supported: false,
  enabled: false,
  start_minimized: false,
  needs_install: false,
};

function is_tauri(): boolean {
  return "__TAURI_INTERNALS__" in window;
}

function normalize(value: unknown): LaunchAtLoginStatus | null {
  if (typeof value !== "object" || value === null) return null;

  const record = value as Record<string, unknown>;

  if (
    typeof record["enabled"] !== "boolean" ||
    typeof record["start_minimized"] !== "boolean"
  ) {
    return null;
  }

  return {
    supported: true,
    enabled: record["enabled"],
    start_minimized: record["start_minimized"],
    needs_install: record["needs_install"] === true,
  };
}

export async function get_launch_at_login_status(): Promise<LaunchAtLoginStatus> {
  if (!is_tauri()) return UNSUPPORTED;

  try {
    const { invoke } = await import("@tauri-apps/api/core");

    return normalize(await invoke("launch_at_login_status")) ?? UNSUPPORTED;
  } catch {
    return UNSUPPORTED;
  }
}

export async function set_launch_at_login(
  enabled: boolean,
  reason: string,
): Promise<LaunchAtLoginStatus | null> {
  if (!is_tauri()) return null;

  try {
    const { invoke } = await import("@tauri-apps/api/core");

    return normalize(await invoke("set_launch_at_login", { enabled, reason }));
  } catch {
    return null;
  }
}

export async function set_start_minimized(
  enabled: boolean,
): Promise<LaunchAtLoginStatus | null> {
  if (!is_tauri()) return null;

  try {
    const { invoke } = await import("@tauri-apps/api/core");

    return normalize(await invoke("set_start_minimized", { enabled }));
  } catch {
    return null;
  }
}
