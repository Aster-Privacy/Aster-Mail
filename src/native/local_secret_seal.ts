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
import { is_tauri } from "./desktop_device_auth";

export const NATIVE_SEAL_PREFIX = "n1:";

const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;

async function invoke<T>(
  cmd: string,
  args: Record<string, unknown>,
): Promise<T> {
  const core = await import("@tauri-apps/api/core");

  return core.invoke<T>(cmd, args);
}

function base64_to_base64url(value: string): string {
  return value.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64url_to_base64(value: string): string {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");

  return padded + "=".repeat((4 - (padded.length % 4)) % 4);
}

export function can_native_seal(): boolean {
  return is_tauri();
}

export function is_native_sealed(value: string): boolean {
  return value.startsWith(NATIVE_SEAL_PREFIX);
}

export async function native_seal_base64(
  value_base64: string,
): Promise<string | null> {
  if (!can_native_seal()) return null;

  try {
    const sealed = await invoke<string>("device_seal_local_secret", {
      valueB64: base64_to_base64url(value_base64),
    });

    if (typeof sealed !== "string" || !BASE64URL_PATTERN.test(sealed)) {
      return null;
    }

    return NATIVE_SEAL_PREFIX + sealed;
  } catch {
    return null;
  }
}

export async function native_open_base64(
  value: string,
): Promise<string | null> {
  if (!can_native_seal() || !is_native_sealed(value)) return null;

  const sealed = value.slice(NATIVE_SEAL_PREFIX.length);

  if (!BASE64URL_PATTERN.test(sealed)) return null;

  try {
    const opened = await invoke<string | null>("device_open_local_secret", {
      sealedB64: sealed,
    });

    if (typeof opened !== "string" || !BASE64URL_PATTERN.test(opened)) {
      return null;
    }

    return base64url_to_base64(opened);
  } catch {
    return null;
  }
}
