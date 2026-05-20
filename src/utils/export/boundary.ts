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
function base64url(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function random_boundary(): string {
  const rand = new Uint8Array(12);
  crypto.getRandomValues(rand);
  return `=_aster_${base64url(rand)}`;
}

export function body_contains_boundary(
  body: string | Uint8Array,
  boundary: string,
): boolean {
  if (typeof body === "string") return body.includes(boundary);
  const needle = new TextEncoder().encode(boundary);
  outer: for (let i = 0; i + needle.length <= body.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (body[i + j] !== needle[j]) continue outer;
    }
    return true;
  }
  return false;
}

export function safe_boundary_for(...bodies: (string | Uint8Array)[]): string {
  for (let attempt = 0; attempt < 8; attempt++) {
    const candidate = random_boundary();
    let collision = false;
    for (const b of bodies) {
      if (body_contains_boundary(b, candidate)) {
        collision = true;
        break;
      }
    }
    if (!collision) return candidate;
  }
  return random_boundary();
}
