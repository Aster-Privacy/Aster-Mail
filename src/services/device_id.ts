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
const DEVICE_ID_KEY = "aster_device_id";

let cached: string | null = null;

function generate_random_id(): string {
  const bytes = new Uint8Array(32);

  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }

  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");

  return hex;
}

/*
 * Stable, opaque, per-browser identifier used only to scope the multi-account
 * "signed-in accounts on this device" limit. Persisted in per-origin storage so
 * every account in the same browser shares it, while unrelated devices never
 * collide. It carries no account or personal data.
 */
export function get_device_id(): string | null {
  if (cached) return cached;
  if (typeof window === "undefined") return null;

  try {
    let id = localStorage.getItem(DEVICE_ID_KEY);

    if (!id || id.length < 16) {
      id = generate_random_id();
      localStorage.setItem(DEVICE_ID_KEY, id);
    }

    cached = id;

    return id;
  } catch {
    return null;
  }
}
