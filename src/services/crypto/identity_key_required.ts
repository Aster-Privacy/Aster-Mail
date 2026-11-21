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
const PLACEHOLDER_IDENTITY_KEYS = new Set([
  "undefined",
  "null",
  "nan",
  "[object object]",
]);

export function is_usable_identity_key(
  identity_key: unknown,
): identity_key is string {
  if (typeof identity_key !== "string") return false;

  const trimmed = identity_key.trim();

  return (
    trimmed.length > 0 && !PLACEHOLDER_IDENTITY_KEYS.has(trimmed.toLowerCase())
  );
}

export class IdentityKeyMissingError extends Error {
  constructor() {
    super("identity key is not available");
    this.name = "IdentityKeyMissingError";
  }
}

export function with_identity_key<T extends { identity_key?: string | null }>(
  vault: T,
): T {
  if (!is_usable_identity_key(vault.identity_key)) {
    throw new IdentityKeyMissingError();
  }

  return vault;
}
