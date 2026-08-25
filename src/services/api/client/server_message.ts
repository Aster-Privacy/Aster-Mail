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
const UNTYPED_VALIDATION_CODES = new Set(["VALIDATION_ERROR", "INVALID_INPUT"]);

const SENTINEL_TOKEN = /^[A-Z][A-Z0-9_]{3,}$/;

const DEVELOPER_TOKEN = /[a-z0-9]_[a-z0-9]|::|[{}<>[\]]|\bnonce\b|\bbase64\b/i;

export function reads_as_user_prose(message: string): boolean {
  const trimmed = message.trim();

  if (trimmed.length < 12 || trimmed.length > 400) return false;
  if (!/\s/.test(trimmed)) return false;
  if (DEVELOPER_TOKEN.test(trimmed)) return false;
  if (!/[.!?]$/.test(trimmed)) return false;

  const first = trimmed[0];

  return first === first.toUpperCase() && first !== first.toLowerCase();
}

export function should_show_server_message(
  server_code: string | undefined,
  message: string,
): boolean {
  if (!server_code || !UNTYPED_VALIDATION_CODES.has(server_code)) return true;
  if (SENTINEL_TOKEN.test(message.trim())) return true;

  return reads_as_user_prose(message);
}
