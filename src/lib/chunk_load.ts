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
const CHUNK_LOAD_ERROR_SIGNATURES = [
  "importing a module script failed",
  "failed to fetch dynamically imported module",
  "error loading dynamically imported module",
  "failed to load module script",
  "dynamically imported module",
  "loading chunk",
  "loading css chunk",
  "chunkloaderror",
];

function extract_error_message(input: unknown): string {
  if (typeof input === "string") return input;
  if (input instanceof Error) return input.message;
  if (input && typeof input === "object" && "message" in input) {
    return String((input as { message: unknown }).message);
  }

  return "";
}

export function is_chunk_load_error(input: unknown): boolean {
  const message = extract_error_message(input).toLowerCase();

  if (!message) return false;

  return CHUNK_LOAD_ERROR_SIGNATURES.some((signature) =>
    message.includes(signature),
  );
}
