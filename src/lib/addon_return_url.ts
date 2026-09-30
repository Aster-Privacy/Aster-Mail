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
export const ADDON_PURCHASE_PARAM = "addon_purchase";

export function addon_return_url(
  status: "success" | "cancelled",
): string | undefined {
  if (typeof window === "undefined") return undefined;
  if ("__TAURI_INTERNALS__" in window) return undefined;

  try {
    const url = new URL(window.location.href);

    url.search = "";
    url.hash = "";
    url.searchParams.set(ADDON_PURCHASE_PARAM, status);

    return url.toString();
  } catch {
    return undefined;
  }
}

export function clear_addon_purchase_param(): void {
  if (typeof window === "undefined") return;

  try {
    const url = new URL(window.location.href);

    url.searchParams.delete(ADDON_PURCHASE_PARAM);
    window.history.replaceState({}, "", url.toString());
  } catch {
    return;
  }
}
