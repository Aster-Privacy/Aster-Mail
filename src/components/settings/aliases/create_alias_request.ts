//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
export const AUTO_OPEN_CREATE_ALIAS_EVENT = "astermail:auto-open-create-alias";

const PENDING_REQUEST_TTL_MS = 10_000;

let pending_request_at: number | null = null;

export function request_auto_open_create_alias(): void {
  pending_request_at = Date.now();
}

export function dispatch_auto_open_create_alias(): void {
  window.dispatchEvent(new CustomEvent(AUTO_OPEN_CREATE_ALIAS_EVENT));
}

export function consume_auto_open_create_alias(): boolean {
  const requested_at = pending_request_at;

  pending_request_at = null;

  if (requested_at === null) {
    return false;
  }

  return Date.now() - requested_at <= PENDING_REQUEST_TTL_MS;
}
