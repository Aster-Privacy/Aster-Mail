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
const OPAQUE_ERROR_NAMES = ["TypeError", "AbortError", "NetworkError"];

const OPAQUE_MESSAGE_PATTERNS = [
  /failed to fetch/i,
  /fetch failed/i,
  /networkerror/i,
  /network request failed/i,
  /load failed/i,
  /the operation was aborted/i,
  /signal is aborted/i,
  /^err_[a-z_]+$/i,
  /connection (refused|reset|closed)/i,
  /^\[object [a-z]+\]$/i,
];

export function user_facing_error(value: unknown, fallback: string): string {
  if (!(value instanceof Error)) return fallback;
  if (OPAQUE_ERROR_NAMES.includes(value.name)) return fallback;

  const message = value.message.trim();

  if (!message) return fallback;
  if (OPAQUE_MESSAGE_PATTERNS.some((pattern) => pattern.test(message))) {
    return fallback;
  }

  return message;
}
