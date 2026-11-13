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
export type UnboundPolicy = "accept_unbound" | "refuse_unbound";

export function local_unbound_policy(): UnboundPolicy {
  const is_desktop =
    typeof window !== "undefined" &&
    Boolean(Reflect.get(window, "__TAURI_INTERNALS__"));
  const is_mac =
    typeof navigator !== "undefined" &&
    /Macintosh|Mac OS/i.test(navigator.userAgent || "");

  return is_desktop && is_mac ? "accept_unbound" : "refuse_unbound";
}

export async function decrypt_aes_gcm_bound_or_unbound(
  key: CryptoKey,
  iv: BufferSource,
  data: BufferSource,
  additional_data: BufferSource,
  unbound: UnboundPolicy,
): Promise<ArrayBuffer> {
  try {
    return await crypto.subtle.decrypt(
      { name: "AES-GCM", iv, additionalData: additional_data },
      key,
      data,
    );
  } catch (bound_error) {
    if (unbound === "refuse_unbound") throw bound_error;

    try {
      return await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
    } catch {
      throw bound_error;
    }
  }
}
