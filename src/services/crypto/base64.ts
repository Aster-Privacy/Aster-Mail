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
const BASE64_CHUNK = 8192;

export function array_to_base64(array: Uint8Array | ArrayBuffer): string {
  const bytes = array instanceof Uint8Array ? array : new Uint8Array(array);

  let binary = "";

  for (let offset = 0; offset < bytes.length; offset += BASE64_CHUNK) {
    binary += String.fromCharCode(
      ...bytes.subarray(offset, offset + BASE64_CHUNK),
    );
  }

  return btoa(binary);
}

export function first_base64_byte(base64: string): number {
  if (!base64) return -1;

  const head = base64.slice(0, 4);

  try {
    const decoded = atob(head.length % 4 === 0 ? head : head.padEnd(4, "="));

    return decoded.length > 0 ? decoded.charCodeAt(0) : -1;
  } catch {
    try {
      return base64_to_array(base64)[0] ?? -1;
    } catch {
      return -1;
    }
  }
}

export function base64_to_array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}
