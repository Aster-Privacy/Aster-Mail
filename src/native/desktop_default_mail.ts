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
export interface DefaultMailStatus {
  supported: boolean;
  is_default: boolean;
}

export type DefaultMailOutcome = "applied" | "needs_confirmation" | "failed";

const UNSUPPORTED_STATUS: DefaultMailStatus = {
  supported: false,
  is_default: false,
};

function is_desktop(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function get_default_mail_status(): Promise<DefaultMailStatus> {
  if (!is_desktop()) return UNSUPPORTED_STATUS;

  try {
    const { invoke } = await import("@tauri-apps/api/core");

    return await invoke<DefaultMailStatus>("default_mail_app_status");
  } catch {
    return UNSUPPORTED_STATUS;
  }
}

export async function set_default_mail_app(
  enabled: boolean,
): Promise<DefaultMailOutcome> {
  if (!is_desktop()) return "failed";

  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const outcome = await invoke<string>(
      enabled ? "set_default_mail_app" : "clear_default_mail_app",
    );

    return outcome === "needs_confirmation" ? "needs_confirmation" : "applied";
  } catch {
    return "failed";
  }
}
