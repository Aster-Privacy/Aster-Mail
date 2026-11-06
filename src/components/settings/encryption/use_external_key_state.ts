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
import type { external_key_state } from "@/services/crypto/external_pgp_key";
import type { TranslationKey } from "@/lib/i18n/types";

import { useSyncExternalStore } from "react";

import {
  get_external_key_state,
  subscribe_external_key,
} from "@/services/crypto/external_pgp_key";

const DEVICE_KEYS: Record<string, TranslationKey> = {
  android: "settings.external_key_device_android",
  ios: "settings.external_key_device_ios",
  desktop: "settings.external_key_device_desktop",
  tauri: "settings.external_key_device_desktop",
  windows: "settings.external_key_device_desktop",
  macos: "settings.external_key_device_desktop",
  linux: "settings.external_key_device_desktop",
  web: "settings.external_key_device_web",
  bridge: "settings.external_key_device_bridge",
};

export function external_key_device_label_key(
  platform: string | null | undefined,
): TranslationKey {
  return (
    DEVICE_KEYS[(platform ?? "").trim().toLowerCase()] ??
    "settings.external_key_device_other"
  );
}

const EXPIRY_WARNING_MS = 30 * 24 * 60 * 60 * 1000;

export function use_external_key_state(): external_key_state {
  return useSyncExternalStore(subscribe_external_key, get_external_key_state);
}

export function external_key_expires_soon(expires_at: string | Date): boolean {
  return new Date(expires_at).getTime() - Date.now() < EXPIRY_WARNING_MS;
}

export function format_external_fingerprint(fingerprint: string): string {
  return fingerprint
    .toUpperCase()
    .replace(/(.{4})/g, "$1 ")
    .trim();
}
